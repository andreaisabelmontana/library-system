"""The Library facade: roles, loans, fines, reservations, CSV, reports.

Design notes
------------
* **Money** is stored as integer cents to avoid float drift.
* **Dates** are ``datetime.date``; the public methods accept/return ISO strings
  or ``date`` objects. ``today`` is injectable on every time-sensitive call so
  the lifecycle (and the tests) are deterministic without monkeypatching.
* **Roles**: every mutating operation takes an ``actor`` describing who is
  acting. Member-only data access is scoped to that member; librarian-only
  actions raise ``PermissionError`` for members.
* **Reservations** form a FIFO queue per book. When a copy is returned and a
  queue exists, the head of the queue is promoted to ``ready`` (its turn to
  borrow); a member at the head can convert their ready hold into a loan.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable

from . import csvio
from .db import connect, init_schema
from .errors import (
    DuplicateError,
    FineCapError,
    LoanLimitError,
    NotAvailableError,
    NotFoundError,
)
from .models import (
    MEMBERSHIP_LOAN_LIMITS,
    Availability,
    Book,
    CopyStatus,
    Fine,
    Loan,
    LoanStatus,
    Member,
    Reservation,
    ReservationStatus,
    Role,
    Staff,
)


@dataclass(frozen=True)
class LoanRules:
    """Tunable policy. Defaults mirror the syllabus' Java project."""

    loan_period_days: int = 14
    fine_cents_per_day: int = 25          # $0.25/day overdue
    max_unpaid_fine_cents: int = 500      # block borrowing over $5.00 owed


@dataclass(frozen=True)
class Actor:
    """Who is performing an operation."""

    role: Role
    member_id: int | None = None  # set for members so we can scope their data

    @classmethod
    def librarian(cls, staff_id: int | None = None) -> "Actor":
        return cls(role=Role.LIBRARIAN, member_id=None)

    @classmethod
    def member(cls, member_id: int) -> "Actor":
        return cls(role=Role.MEMBER, member_id=member_id)


def _to_date(value) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


class Library:
    """Single entry point to the library backend."""

    def __init__(self, db_path: str = ":memory:", rules: LoanRules | None = None):
        self.conn: sqlite3.Connection = connect(db_path)
        init_schema(self.conn)
        self.rules = rules or LoanRules()

    def close(self) -> None:
        self.conn.close()

    def __enter__(self) -> "Library":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    # ------------------------------------------------------------------ #
    # role gate
    # ------------------------------------------------------------------ #
    @staticmethod
    def _require_librarian(actor: Actor, action: str) -> None:
        if actor.role is not Role.LIBRARIAN:
            raise PermissionError(
                f"action '{action}' requires a librarian; actor role is "
                f"'{actor.role.value}'"
            )

    @staticmethod
    def _require_self_or_librarian(actor: Actor, member_id: int, action: str) -> None:
        if actor.role is Role.LIBRARIAN:
            return
        if actor.member_id != member_id:
            raise PermissionError(
                f"action '{action}' may only be performed on the acting "
                f"member's own record"
            )

    # ------------------------------------------------------------------ #
    # member / staff management
    # ------------------------------------------------------------------ #
    def add_member(
        self,
        actor: Actor,
        name: str,
        email: str,
        membership: str = "standard",
    ) -> Member:
        """Librarian-only. Registers a member; loan limit derived from type."""
        self._require_librarian(actor, "add_member")
        membership = membership.lower()
        limit = MEMBERSHIP_LOAN_LIMITS.get(membership)
        if limit is None:
            raise NotFoundError(f"unknown membership type: {membership!r}")
        try:
            cur = self.conn.execute(
                "INSERT INTO members (name, email, membership, loan_limit) "
                "VALUES (?, ?, ?, ?)",
                (name, email, membership, limit),
            )
        except sqlite3.IntegrityError as exc:
            raise DuplicateError(f"member email already exists: {email}") from exc
        self.conn.commit()
        return self.get_member(cur.lastrowid)

    def add_staff(self, actor: Actor, name: str, email: str) -> Staff:
        self._require_librarian(actor, "add_staff")
        try:
            cur = self.conn.execute(
                "INSERT INTO staff (name, email, role) VALUES (?, ?, 'librarian')",
                (name, email),
            )
        except sqlite3.IntegrityError as exc:
            raise DuplicateError(f"staff email already exists: {email}") from exc
        self.conn.commit()
        row = self.conn.execute(
            "SELECT * FROM staff WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
        return Staff(**dict(row))

    def get_member(self, member_id: int) -> Member:
        row = self.conn.execute(
            "SELECT * FROM members WHERE id = ?", (member_id,)
        ).fetchone()
        if row is None:
            raise NotFoundError(f"no member with id {member_id}")
        return Member(**dict(row))

    # ------------------------------------------------------------------ #
    # catalog
    # ------------------------------------------------------------------ #
    def add_book(
        self,
        actor: Actor,
        title: str,
        author: str,
        isbn: str,
        category: str = "General",
        copies: int = 1,
    ) -> Book:
        """Librarian-only. Adds a book and ``copies`` physical copies."""
        self._require_librarian(actor, "add_book")
        try:
            cur = self.conn.execute(
                "INSERT INTO books (title, author, isbn, category) "
                "VALUES (?, ?, ?, ?)",
                (title, author, isbn, category),
            )
        except sqlite3.IntegrityError as exc:
            raise DuplicateError(f"ISBN already in catalog: {isbn}") from exc
        book_id = cur.lastrowid
        for _ in range(max(0, copies)):
            self._add_copy(book_id)
        self.conn.commit()
        return self.get_book(book_id)

    def add_copies(self, actor: Actor, book_id: int, copies: int = 1) -> int:
        """Librarian-only. Adds N copies to an existing book. Returns new total."""
        self._require_librarian(actor, "add_copies")
        self.get_book(book_id)  # existence check
        for _ in range(max(0, copies)):
            self._add_copy(book_id)
        self.conn.commit()
        return self.conn.execute(
            "SELECT COUNT(*) AS n FROM copies WHERE book_id = ?", (book_id,)
        ).fetchone()["n"]

    def _add_copy(self, book_id: int) -> int:
        # Barcode: zero-padded book id + sequential copy index for that book.
        n = self.conn.execute(
            "SELECT COUNT(*) AS n FROM copies WHERE book_id = ?", (book_id,)
        ).fetchone()["n"]
        barcode = f"C{book_id:05d}-{n + 1:03d}"
        cur = self.conn.execute(
            "INSERT INTO copies (book_id, barcode, status) VALUES (?, ?, 'available')",
            (book_id, barcode),
        )
        return cur.lastrowid

    def get_book(self, book_id: int) -> Book:
        row = self.conn.execute(
            "SELECT * FROM books WHERE id = ?", (book_id,)
        ).fetchone()
        if row is None:
            raise NotFoundError(f"no book with id {book_id}")
        return Book(**dict(row))

    def search(self, query: str = "", category: str | None = None) -> list[Book]:
        """Open to everyone. Substring match over title/author/isbn."""
        sql = "SELECT * FROM books"
        clauses, params = [], []
        if query:
            like = f"%{query.lower()}%"
            clauses.append(
                "(LOWER(title) LIKE ? OR LOWER(author) LIKE ? OR LOWER(isbn) LIKE ?)"
            )
            params += [like, like, like]
        if category:
            clauses.append("LOWER(category) = ?")
            params.append(category.lower())
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY title"
        rows = self.conn.execute(sql, params).fetchall()
        return [Book(**dict(r)) for r in rows]

    # ------------------------------------------------------------------ #
    # availability helpers
    # ------------------------------------------------------------------ #
    def _free_copy_id(self, book_id: int) -> int | None:
        row = self.conn.execute(
            "SELECT id FROM copies WHERE book_id = ? AND status = 'available' "
            "ORDER BY id LIMIT 1",
            (book_id,),
        ).fetchone()
        return row["id"] if row else None

    def available_count(self, book_id: int) -> int:
        return self.conn.execute(
            "SELECT COUNT(*) AS n FROM copies "
            "WHERE book_id = ? AND status = 'available'",
            (book_id,),
        ).fetchone()["n"]

    def _active_loan_count(self, member_id: int) -> int:
        return self.conn.execute(
            "SELECT COUNT(*) AS n FROM loans "
            "WHERE member_id = ? AND status = 'active'",
            (member_id,),
        ).fetchone()["n"]

    def unpaid_fine_total(self, member_id: int) -> int:
        """Total unpaid fine balance for a member, in cents."""
        return self.conn.execute(
            "SELECT COALESCE(SUM(amount_cents), 0) AS t FROM fines "
            "WHERE member_id = ? AND paid = 0",
            (member_id,),
        ).fetchone()["t"]

    # ------------------------------------------------------------------ #
    # checkout
    # ------------------------------------------------------------------ #
    def checkout(
        self,
        actor: Actor,
        book_id: int,
        member_id: int,
        today=None,
    ) -> Loan:
        """Librarian-only. Check a free copy of ``book_id`` out to a member.

        Enforces, in order:
          * member exists,
          * member is not over their unpaid-fine cap,
          * member is below their active-loan limit,
          * if the member holds a ready reservation it is honoured and consumed,
            otherwise the book must not be fully reserved ahead of them,
          * a free copy exists.
        """
        self._require_librarian(actor, "checkout")
        member = self.get_member(member_id)
        today = _to_date(today) if today is not None else date.today()

        owed = self.unpaid_fine_total(member_id)
        if owed > self.rules.max_unpaid_fine_cents:
            raise FineCapError(
                f"member {member_id} owes {owed}c which exceeds the "
                f"{self.rules.max_unpaid_fine_cents}c borrowing cap"
            )

        if self._active_loan_count(member_id) >= member.loan_limit:
            raise LoanLimitError(
                f"member {member_id} is at their loan limit "
                f"({member.loan_limit})"
            )

        ready = self._ready_reservation(book_id, member_id)
        if ready is None:
            # If the head of the waiting queue is someone else, they have
            # priority for the next freed copy — block jumping the line.
            head = self._queue_head(book_id)
            if head is not None and head["member_id"] != member_id:
                raise NotAvailableError(
                    f"book {book_id} has a reservation queue; member "
                    f"{head['member_id']} is next in line"
                )

        copy_id = self._free_copy_id(book_id)
        if copy_id is None:
            raise NotAvailableError(f"no available copy of book {book_id}")

        due = today + timedelta(days=self.rules.loan_period_days)
        cur = self.conn.execute(
            "INSERT INTO loans "
            "(copy_id, book_id, member_id, checkout_date, due_date, status) "
            "VALUES (?, ?, ?, ?, ?, 'active')",
            (copy_id, book_id, member_id, today.isoformat(), due.isoformat()),
        )
        self.conn.execute(
            "UPDATE copies SET status = 'on_loan' WHERE id = ?", (copy_id,)
        )
        if ready is not None:
            self.conn.execute(
                "UPDATE reservations SET status = 'fulfilled' WHERE id = ?",
                (ready["id"],),
            )
        self.conn.commit()
        return self.get_loan(cur.lastrowid)

    # ------------------------------------------------------------------ #
    # return
    # ------------------------------------------------------------------ #
    def return_loan(self, actor: Actor, loan_id: int, today=None) -> Loan:
        """Librarian-only. Returns a loan, accruing an overdue fine if late.

        Overdue fine = ``fine_cents_per_day * days_late`` where
        ``days_late = max(0, return_date - due_date)``. Returns on/before the
        due date accrue nothing. On return, if the book has a waiting queue the
        head is promoted to ``ready``.
        """
        self._require_librarian(actor, "return_loan")
        loan = self.get_loan(loan_id)
        if loan.status == LoanStatus.RETURNED.value:
            raise NotFoundError(f"loan {loan_id} is already returned")
        today = _to_date(today) if today is not None else date.today()

        due = _to_date(loan.due_date)
        days_late = max(0, (today - due).days)
        fine_id = None
        if days_late > 0:
            amount = days_late * self.rules.fine_cents_per_day
            fcur = self.conn.execute(
                "INSERT INTO fines (loan_id, member_id, amount_cents, paid, reason) "
                "VALUES (?, ?, ?, 0, ?)",
                (loan_id, loan.member_id, amount, f"{days_late} day(s) overdue"),
            )
            fine_id = fcur.lastrowid

        self.conn.execute(
            "UPDATE loans SET status='returned', return_date=?, fine_id=? "
            "WHERE id=?",
            (today.isoformat(), fine_id, loan_id),
        )
        # Free the copy, then (if anyone is waiting) hold it for the queue head.
        self.conn.execute(
            "UPDATE copies SET status='available' WHERE id=?", (loan.copy_id,)
        )
        self._promote_queue_head(loan.book_id)
        self.conn.commit()
        return self.get_loan(loan_id)

    # ------------------------------------------------------------------ #
    # fines
    # ------------------------------------------------------------------ #
    def pay_fine(self, actor: Actor, fine_id: int) -> Fine:
        """A member may pay their own fine; a librarian may pay any."""
        fine = self._get_fine(fine_id)
        self._require_self_or_librarian(actor, fine.member_id, "pay_fine")
        self.conn.execute("UPDATE fines SET paid=1 WHERE id=?", (fine_id,))
        self.conn.commit()
        return self._get_fine(fine_id)

    def waive_fine(self, actor: Actor, fine_id: int) -> Fine:
        """Librarian-only. Waiving and paying both clear the balance; waiving
        records that no money changed hands."""
        self._require_librarian(actor, "waive_fine")
        fine = self._get_fine(fine_id)
        self.conn.execute(
            "UPDATE fines SET paid=1, reason=? WHERE id=?",
            (f"{fine.reason} (waived)", fine_id),
        )
        self.conn.commit()
        return self._get_fine(fine_id)

    def _get_fine(self, fine_id: int) -> Fine:
        row = self.conn.execute(
            "SELECT * FROM fines WHERE id = ?", (fine_id,)
        ).fetchone()
        if row is None:
            raise NotFoundError(f"no fine with id {fine_id}")
        return Fine(**dict(row))

    def member_fines(self, actor: Actor, member_id: int) -> list[Fine]:
        self._require_self_or_librarian(actor, member_id, "member_fines")
        rows = self.conn.execute(
            "SELECT * FROM fines WHERE member_id = ? ORDER BY id", (member_id,)
        ).fetchall()
        return [Fine(**dict(r)) for r in rows]

    # ------------------------------------------------------------------ #
    # reservations (FIFO hold queue)
    # ------------------------------------------------------------------ #
    def reserve(self, actor: Actor, book_id: int, member_id: int, today=None) -> Reservation:
        """A member may reserve for themselves; a librarian for anyone.

        Appends to the FIFO queue for the title. Re-reserving while already
        waiting/ready is a no-op returning the existing hold.
        """
        self._require_self_or_librarian(actor, member_id, "reserve")
        self.get_book(book_id)
        self.get_member(member_id)
        today = _to_date(today) if today is not None else date.today()

        existing = self.conn.execute(
            "SELECT * FROM reservations WHERE book_id=? AND member_id=? "
            "AND status IN ('waiting','ready') ORDER BY id LIMIT 1",
            (book_id, member_id),
        ).fetchone()
        if existing is not None:
            return Reservation(**dict(existing))

        cur = self.conn.execute(
            "INSERT INTO reservations (book_id, member_id, created_at, status) "
            "VALUES (?, ?, ?, 'waiting')",
            (book_id, member_id, today.isoformat()),
        )
        self.conn.commit()
        row = self.conn.execute(
            "SELECT * FROM reservations WHERE id=?", (cur.lastrowid,)
        ).fetchone()
        return Reservation(**dict(row))

    def cancel_reservation(self, actor: Actor, reservation_id: int) -> Reservation:
        row = self.conn.execute(
            "SELECT * FROM reservations WHERE id=?", (reservation_id,)
        ).fetchone()
        if row is None:
            raise NotFoundError(f"no reservation with id {reservation_id}")
        self._require_self_or_librarian(actor, row["member_id"], "cancel_reservation")
        self.conn.execute(
            "UPDATE reservations SET status='cancelled' WHERE id=?", (reservation_id,)
        )
        # If we cancelled the ready holder, promote the next one.
        self._promote_queue_head(row["book_id"])
        self.conn.commit()
        return Reservation(
            **dict(
                self.conn.execute(
                    "SELECT * FROM reservations WHERE id=?", (reservation_id,)
                ).fetchone()
            )
        )

    def queue(self, book_id: int) -> list[Reservation]:
        """The live FIFO queue (waiting + ready) in service order."""
        rows = self.conn.execute(
            "SELECT * FROM reservations WHERE book_id=? "
            "AND status IN ('waiting','ready') ORDER BY created_at, id",
            (book_id,),
        ).fetchall()
        return [Reservation(**dict(r)) for r in rows]

    def _queue_head(self, book_id: int):
        return self.conn.execute(
            "SELECT * FROM reservations WHERE book_id=? "
            "AND status IN ('waiting','ready') ORDER BY created_at, id LIMIT 1",
            (book_id,),
        ).fetchone()

    def _ready_reservation(self, book_id: int, member_id: int):
        return self.conn.execute(
            "SELECT * FROM reservations WHERE book_id=? AND member_id=? "
            "AND status='ready' ORDER BY id LIMIT 1",
            (book_id, member_id),
        ).fetchone()

    def _promote_queue_head(self, book_id: int) -> None:
        """If a free copy exists and someone is waiting, mark the head ready."""
        if self.available_count(book_id) <= 0:
            return
        head = self.conn.execute(
            "SELECT * FROM reservations WHERE book_id=? AND status='waiting' "
            "ORDER BY created_at, id LIMIT 1",
            (book_id,),
        ).fetchone()
        if head is not None:
            self.conn.execute(
                "UPDATE reservations SET status='ready' WHERE id=?", (head["id"],)
            )

    def next_in_line(self, book_id: int) -> Reservation | None:
        head = self._queue_head(book_id)
        return Reservation(**dict(head)) if head else None

    # ------------------------------------------------------------------ #
    # history / reports
    # ------------------------------------------------------------------ #
    def get_loan(self, loan_id: int) -> Loan:
        row = self.conn.execute(
            "SELECT * FROM loans WHERE id = ?", (loan_id,)
        ).fetchone()
        if row is None:
            raise NotFoundError(f"no loan with id {loan_id}")
        return Loan(**dict(row))

    def member_loans(self, actor: Actor, member_id: int) -> list[Loan]:
        """Loan history for a member (newest first). Self or librarian."""
        self._require_self_or_librarian(actor, member_id, "member_loans")
        rows = self.conn.execute(
            "SELECT * FROM loans WHERE member_id=? ORDER BY id DESC", (member_id,)
        ).fetchall()
        return [Loan(**dict(r)) for r in rows]

    def availability_report(self, actor: Actor) -> list[Availability]:
        """Librarian-only inventory report: per-title totals + queue depth."""
        self._require_librarian(actor, "availability_report")
        rows = self.conn.execute(
            """
            SELECT b.id AS book_id, b.title, b.author, b.isbn, b.category,
                   COUNT(c.id) AS total_copies,
                   COALESCE(SUM(c.status = 'available'), 0) AS available_copies,
                   (SELECT COUNT(*) FROM reservations r
                      WHERE r.book_id = b.id
                        AND r.status IN ('waiting','ready')) AS waiting
            FROM books b
            LEFT JOIN copies c ON c.book_id = b.id
            GROUP BY b.id
            ORDER BY b.title
            """
        ).fetchall()
        return [
            Availability(
                book_id=r["book_id"],
                title=r["title"],
                author=r["author"],
                isbn=r["isbn"],
                category=r["category"],
                total_copies=r["total_copies"],
                available_copies=r["available_copies"],
                waiting_reservations=r["waiting"],
            )
            for r in rows
        ]

    # ------------------------------------------------------------------ #
    # CSV import / export
    # ------------------------------------------------------------------ #
    def export_catalog_csv(self, actor: Actor) -> str:
        """Librarian-only. Catalog as CSV (one row per title, with copy count)."""
        self._require_librarian(actor, "export_catalog_csv")
        rows = self.conn.execute(
            """
            SELECT b.title, b.author, b.isbn, b.category,
                   COUNT(c.id) AS copies
            FROM books b LEFT JOIN copies c ON c.book_id = b.id
            GROUP BY b.id ORDER BY b.title
            """
        ).fetchall()
        return csvio.write_catalog([dict(r) for r in rows])

    def import_catalog_csv(self, actor: Actor, text: str) -> int:
        """Librarian-only. Upsert catalog rows from CSV. Returns rows processed.

        New ISBNs are inserted with their copy count; existing ISBNs top up to
        the requested copy count if it is higher (never removes copies).
        """
        self._require_librarian(actor, "import_catalog_csv")
        records = csvio.read_catalog(text)
        for rec in records:
            existing = self.conn.execute(
                "SELECT id FROM books WHERE isbn = ?", (rec["isbn"],)
            ).fetchone()
            if existing is None:
                self.add_book(
                    actor,
                    rec["title"],
                    rec["author"],
                    rec["isbn"],
                    rec["category"],
                    rec["copies"],
                )
            else:
                book_id = existing["id"]
                have = self.conn.execute(
                    "SELECT COUNT(*) AS n FROM copies WHERE book_id=?", (book_id,)
                ).fetchone()["n"]
                if rec["copies"] > have:
                    self.add_copies(actor, book_id, rec["copies"] - have)
        self.conn.commit()
        return len(records)

    def export_members_csv(self, actor: Actor) -> str:
        self._require_librarian(actor, "export_members_csv")
        rows = self.conn.execute(
            "SELECT name, email, membership FROM members ORDER BY id"
        ).fetchall()
        return csvio.write_members([dict(r) for r in rows])

    def import_members_csv(self, actor: Actor, text: str) -> int:
        self._require_librarian(actor, "import_members_csv")
        records = csvio.read_members(text)
        n = 0
        for rec in records:
            existing = self.conn.execute(
                "SELECT id FROM members WHERE email = ?", (rec["email"],)
            ).fetchone()
            if existing is None:
                self.add_member(actor, rec["name"], rec["email"], rec["membership"])
                n += 1
        self.conn.commit()
        return n
