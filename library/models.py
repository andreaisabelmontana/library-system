"""Domain enums and lightweight row dataclasses.

The dataclasses are plain read views over SQLite rows — the database is the
source of truth, these just give callers typed attribute access instead of
tuple/dict indexing.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Role(str, Enum):
    """Who an actor is. Gates every mutating operation."""

    MEMBER = "member"
    LIBRARIAN = "librarian"


class CopyStatus(str, Enum):
    """Physical-copy lifecycle."""

    AVAILABLE = "available"   # on the shelf, can be checked out
    ON_LOAN = "on_loan"       # currently checked out to a member
    LOST = "lost"             # written off, not loanable


class LoanStatus(str, Enum):
    ACTIVE = "active"   # checked out, not yet returned
    RETURNED = "returned"


class ReservationStatus(str, Enum):
    WAITING = "waiting"     # in the FIFO queue
    READY = "ready"         # next holder, a copy is being held for them
    FULFILLED = "fulfilled"  # converted into a loan
    CANCELLED = "cancelled"


# Membership types -> max simultaneous active loans.
MEMBERSHIP_LOAN_LIMITS = {
    "standard": 5,
    "student": 10,
    "staff": 20,
}


@dataclass(frozen=True)
class Member:
    id: int
    name: str
    email: str
    membership: str
    loan_limit: int


@dataclass(frozen=True)
class Staff:
    id: int
    name: str
    email: str
    role: str  # always "librarian" here, kept as a column for extensibility


@dataclass(frozen=True)
class Book:
    id: int
    title: str
    author: str
    isbn: str
    category: str


@dataclass(frozen=True)
class Copy:
    id: int
    book_id: int
    barcode: str
    status: str


@dataclass(frozen=True)
class Loan:
    id: int
    copy_id: int
    book_id: int
    member_id: int
    checkout_date: str
    due_date: str
    return_date: str | None
    status: str
    fine_id: int | None


@dataclass(frozen=True)
class Fine:
    id: int
    loan_id: int
    member_id: int
    amount_cents: int
    paid: int  # 0/1
    reason: str


@dataclass(frozen=True)
class Reservation:
    id: int
    book_id: int
    member_id: int
    created_at: str
    status: str


@dataclass(frozen=True)
class Availability:
    book_id: int
    title: str
    author: str
    isbn: str
    category: str
    total_copies: int
    available_copies: int
    waiting_reservations: int
