# Library Management System

A multi-role library backend in Python over SQLite: catalog, physical copies,
members, loans, automatic overdue fines, a FIFO reservation queue, and CSV
import/export — all role-gated (librarian vs member). The browser page in this
repo (`index.html`) is a self-contained demo of the same model; the real,
tested backend is the `library/` Python package.

Runtime is standard library only (`sqlite3`, `csv`, `datetime`). `pytest` is
the sole dev dependency.

## Data model

| Table | Key columns | Notes |
|-------|-------------|-------|
| `books` | title, author, **isbn** (unique), category | one row per title |
| `copies` | book_id, barcode, status | one row per *physical* copy; `available` / `on_loan` / `lost` |
| `members` | name, email (unique), membership, **loan_limit** | limit derived from membership type |
| `staff` | name, email, role | librarians |
| `loans` | copy_id, book_id, member_id, checkout_date, due_date, return_date, status, fine_id | `active` / `returned` |
| `fines` | loan_id, member_id, amount_cents, paid, reason | money stored as integer cents |
| `reservations` | book_id, member_id, created_at, status | `waiting` / `ready` / `fulfilled` / `cancelled` |

Membership types and their simultaneous-loan limits: `standard` → 5,
`student` → 10, `staff` → 20.

## Rules

**Checkout** (librarian only) issues a free copy to a member and is rejected,
in order, if: the member's **unpaid fines exceed the cap** (`FineCapError`),
the member is at their **loan limit** (`LoanLimitError`), the title has a
**reservation queue headed by someone else** (`NotAvailableError`), or **no
copy is free** (`NotAvailableError`). A successful checkout flips one copy to
`on_loan` and sets a due date `loan_period_days` ahead.

**Return** (librarian only) computes the overdue fine as
`fine_cents_per_day * max(0, return_date − due_date)` — zero when returned on
or before the due date. The copy is freed and, if anyone is waiting, the head
of that title's queue is promoted to `ready`.

**Reservations** form a per-title FIFO queue ordered by creation time. When a
copy is returned the head becomes `ready`; only that member may take the freed
copy (others get `NotAvailableError`). Taking it via checkout consumes the
hold and the next member becomes the new head.

**Fines** are paid (`pay_fine`) or waived (`waive_fine`, librarian only); both
clear the unpaid balance. Borrowing is blocked while unpaid fines exceed the
cap.

Defaults (override via `LoanRules`): 14-day loans, **$0.25/day** overdue,
**$5.00** unpaid-fine borrow cap.

## Roles

| Action | Member | Librarian |
|--------|:------:|:---------:|
| search catalog | ✅ | ✅ |
| reserve / cancel own hold | ✅ (self) | ✅ (anyone) |
| view own loans / fines | ✅ (self) | ✅ (anyone) |
| pay own fine | ✅ (self) | ✅ (anyone) |
| check out / return | ❌ | ✅ |
| add book / copies / member / staff | ❌ | ✅ |
| waive fine | ❌ | ✅ |
| availability report, CSV import/export | ❌ | ✅ |

Unauthorized actions raise `PermissionError`. Member data access is scoped to
the acting member's own records.

## CSV

`export_catalog_csv` / `import_catalog_csv` round-trip the catalog
(`title,author,isbn,category,copies`); import upserts by ISBN and tops up copy
counts. `export_members_csv` / `import_members_csv` do the same for members.
RFC-4180 quoting is handled by the stdlib `csv` module, so titles with commas
(e.g. *"Thinking, Fast and Slow"*) survive the round-trip. Seed data lives in
`data/catalog.csv` and `data/members.csv`.

## How to run

```bash
pip install -r requirements.txt   # just pytest; runtime is stdlib only
python -m pytest -q                # tests
python demo.py                     # full lifecycle demo
```

### Tests

```
$ python -m pytest -q
................                                                         [100%]
16 passed in 0.06s
```

Coverage: checkout decrements available copies and is blocked when no copy is
free / over the loan limit / over the fine cap; returns compute the correct
overdue fine and zero when on time; the reservation queue is FIFO and the head
is served on return; a member cannot perform librarian-only actions while a
librarian can; and the catalog/members CSV round-trips.

## Example

Selected real output from `python demo.py`:

```
3. Checkout (librarian issues a copy to Andrea)
  'The Hobbit' -> Andrea | due 2026-01-24 | available now: 2

4. Overdue return -> automatic fine
  due 2026-01-24, returned 2026-02-09
  16 day(s) overdue -> fine $4.00 (rate $0.25/day)

5. Fine cap blocks borrowing until paid
  Andrea now owes $15.25 (cap $5.00)
  checkout blocked: member 1 owes 1525c which exceeds the 500c borrowing cap
  after paying: balance $0.00

6. Reservation queue (FIFO) served on return
  'Introduction to Algorithms' checked out to Marcus (available: 0)
  queue: ['Priya Nair', 'Andrea Montana']
  on return, next in line is Priya Nair (status: ready)
  Priya collected her hold; queue now: ['Andrea Montana']

7. Role gating
  Priya CANNOT check out (librarian-only): action 'checkout' requires a librarian; actor role is 'member'
  Priya CANNOT view Marcus's history: action 'member_loans' may only be performed on the acting member's own record
```

## Library API (sketch)

```python
from datetime import date
from library import Library, Actor

lib = Library("library.db")          # or ":memory:"
lib_actor = Actor.librarian()

book = lib.add_book(lib_actor, "Dune", "Frank Herbert", "9780441013593", "SciFi", copies=2)
ann  = lib.add_member(lib_actor, "Ann", "ann@example.edu", "student")

loan = lib.checkout(lib_actor, book.id, ann.id, today=date(2026, 1, 1))
lib.return_loan(lib_actor, loan.id, today=date(2026, 1, 25))   # 10 days late -> $2.50 fine

me = Actor.member(ann.id)
lib.reserve(me, book.id, ann.id)     # member reserves for herself
lib.member_loans(me, ann.id)         # member views own history
```

## File layout

```
library-system/
├── library/            # the backend package
│   ├── library.py      # Library facade: roles, loans, fines, reservations, CSV, reports
│   ├── db.py           # SQLite schema + connection
│   ├── models.py       # enums + row dataclasses
│   ├── csvio.py        # RFC-4180 catalog/member CSV
│   ├── errors.py       # exception hierarchy
│   └── seed.py         # build a populated library from data/
├── data/               # seed catalog.csv + members.csv
├── tests/              # pytest suite (16 tests)
├── demo.py             # end-to-end lifecycle
├── index.html          # self-contained browser demo of the same model
└── requirements.txt
```

## License

MIT — see [LICENSE](LICENSE).
