from datetime import date

from library import Library, Actor, LoanRules

LIB = Actor.librarian()


def test_return_on_time_has_no_fine():
    lib = Library(":memory:")
    book = lib.add_book(LIB, "Punctual", "Auth", "ISBN-P", "X", copies=1)
    member = lib.add_member(LIB, "Ontime", "ot@x.com", "standard")

    loan = lib.checkout(LIB, book.id, member.id, today=date(2026, 1, 1))
    assert loan.due_date == "2026-01-15"  # 14-day period
    returned = lib.return_loan(LIB, loan.id, today=date(2026, 1, 15))
    assert returned.status == "returned"
    assert returned.fine_id is None
    assert lib.unpaid_fine_total(member.id) == 0


def test_return_late_computes_correct_fine():
    lib = Library(":memory:")  # 25c/day default
    book = lib.add_book(LIB, "Tardy", "Auth", "ISBN-T", "X", copies=1)
    member = lib.add_member(LIB, "Late", "late@x.com", "standard")

    loan = lib.checkout(LIB, book.id, member.id, today=date(2026, 1, 1))
    # due 2026-01-15; returned 2026-01-25 -> 10 days late -> 250c
    returned = lib.return_loan(LIB, loan.id, today=date(2026, 1, 25))
    assert returned.fine_id is not None
    (fine,) = lib.member_fines(LIB, member.id)
    assert fine.amount_cents == 10 * 25
    assert fine.paid == 0
    assert lib.unpaid_fine_total(member.id) == 250


def test_custom_fine_rate():
    lib = Library(":memory:", rules=LoanRules(fine_cents_per_day=50))
    book = lib.add_book(LIB, "Pricey", "Auth", "ISBN-PR", "X", copies=1)
    member = lib.add_member(LIB, "Owe", "owe@x.com", "standard")
    loan = lib.checkout(LIB, book.id, member.id, today=date(2026, 1, 1))
    lib.return_loan(LIB, loan.id, today=date(2026, 1, 19))  # 4 days late
    (fine,) = lib.member_fines(LIB, member.id)
    assert fine.amount_cents == 4 * 50


def test_pay_and_waive_clear_balance():
    lib = Library(":memory:")
    book = lib.add_book(LIB, "B", "Auth", "ISBN-B", "X", copies=2)
    member = lib.add_member(LIB, "M", "m@x.com", "standard")

    l1 = lib.checkout(LIB, book.id, member.id, today=date(2026, 1, 1))
    lib.return_loan(LIB, l1.id, today=date(2026, 1, 20))  # 5 late -> 125c
    l2 = lib.checkout(LIB, book.id, member.id, today=date(2026, 1, 1))
    lib.return_loan(LIB, l2.id, today=date(2026, 1, 18))  # 3 late -> 75c
    assert lib.unpaid_fine_total(member.id) == 125 + 75

    f1, f2 = lib.member_fines(LIB, member.id)
    lib.pay_fine(LIB, f1.id)
    lib.waive_fine(LIB, f2.id)
    assert lib.unpaid_fine_total(member.id) == 0
