from datetime import date

import pytest

from library import Library, Actor, LoanRules
from library.errors import LoanLimitError, NotAvailableError, FineCapError


LIB = Actor.librarian()


def make_lib(**rules):
    lib = Library(":memory:", rules=LoanRules(**rules) if rules else None)
    return lib


def test_checkout_decrements_available_copies():
    lib = make_lib()
    book = lib.add_book(LIB, "Dune", "Frank Herbert", "ISBN-D", "SciFi", copies=2)
    member = lib.add_member(LIB, "Ann", "ann@x.com", "standard")

    assert lib.available_count(book.id) == 2
    loan = lib.checkout(LIB, book.id, member.id, today=date(2026, 1, 1))
    assert loan.status == "active"
    assert lib.available_count(book.id) == 1
    lib.checkout(LIB, book.id, member.id, today=date(2026, 1, 1))
    assert lib.available_count(book.id) == 0


def test_checkout_blocked_when_no_copy_free():
    lib = make_lib()
    book = lib.add_book(LIB, "Solo", "A. Author", "ISBN-S", "X", copies=1)
    m1 = lib.add_member(LIB, "One", "one@x.com", "standard")
    m2 = lib.add_member(LIB, "Two", "two@x.com", "standard")

    lib.checkout(LIB, book.id, m1.id, today=date(2026, 1, 1))
    with pytest.raises(NotAvailableError):
        lib.checkout(LIB, book.id, m2.id, today=date(2026, 1, 1))


def test_checkout_blocked_over_loan_limit():
    lib = make_lib()
    member = lib.add_member(LIB, "Maxed", "max@x.com", "standard")  # limit 5
    assert member.loan_limit == 5
    for i in range(5):
        b = lib.add_book(LIB, f"Book {i}", "Auth", f"ISBN-{i}", "X", copies=1)
        lib.checkout(LIB, b.id, member.id, today=date(2026, 1, 1))

    extra = lib.add_book(LIB, "Extra", "Auth", "ISBN-EX", "X", copies=1)
    with pytest.raises(LoanLimitError):
        lib.checkout(LIB, extra.id, member.id, today=date(2026, 1, 1))


def test_checkout_blocked_when_fines_exceed_cap():
    lib = make_lib(max_unpaid_fine_cents=500)  # $5.00 cap
    member = lib.add_member(LIB, "Debtor", "debt@x.com", "standard")
    book = lib.add_book(LIB, "Late Book", "Auth", "ISBN-L", "X", copies=2)

    # Check out and return very late to accrue a fine over the cap.
    loan = lib.checkout(LIB, book.id, member.id, today=date(2026, 1, 1))
    # due 2026-01-15; return 60 days late -> 60 * 25c = 1500c (> 500c cap)
    lib.return_loan(LIB, loan.id, today=date(2026, 3, 16))
    assert lib.unpaid_fine_total(member.id) == 60 * 25

    other = lib.add_book(LIB, "Another", "Auth", "ISBN-A", "X", copies=1)
    with pytest.raises(FineCapError):
        lib.checkout(LIB, other.id, member.id, today=date(2026, 3, 16))

    # After paying it off, borrowing is allowed again.
    (fine,) = lib.member_fines(LIB, member.id)
    lib.pay_fine(LIB, fine.id)
    loan2 = lib.checkout(LIB, other.id, member.id, today=date(2026, 3, 17))
    assert loan2.status == "active"
