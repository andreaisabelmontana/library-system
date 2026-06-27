from datetime import date

import pytest

from library import Library, Actor

LIB = Actor.librarian()


def _setup():
    lib = Library(":memory:")
    book = lib.add_book(LIB, "Shared", "Auth", "ISBN-S", "X", copies=1)
    member = lib.add_member(LIB, "Mem", "mem@x.com", "standard")
    return lib, book, member


def test_member_cannot_perform_librarian_actions():
    lib, book, member = _setup()
    me = Actor.member(member.id)

    with pytest.raises(PermissionError):
        lib.checkout(me, book.id, member.id, today=date(2026, 1, 1))
    with pytest.raises(PermissionError):
        lib.add_book(me, "Sneaky", "X", "ISBN-NEW", "X", 1)
    with pytest.raises(PermissionError):
        lib.add_member(me, "Ghost", "ghost@x.com", "standard")
    with pytest.raises(PermissionError):
        lib.availability_report(me)
    with pytest.raises(PermissionError):
        lib.export_catalog_csv(me)

    # A librarian can do all of those.
    loan = lib.checkout(LIB, book.id, member.id, today=date(2026, 1, 1))
    assert loan.status == "active"
    assert lib.availability_report(LIB)  # non-empty


def test_member_can_do_member_actions_for_self_only():
    lib, book, member = _setup()
    other = lib.add_member(LIB, "Other", "other@x.com", "standard")
    me = Actor.member(member.id)

    # Search is open to a member.
    assert any(b.isbn == "ISBN-S" for b in lib.search("Shared"))

    # Reserve own hold: allowed.
    r = lib.reserve(me, book.id, member.id, today=date(2026, 1, 1))
    assert r.member_id == member.id

    # View own history: allowed.
    assert isinstance(lib.member_loans(me, member.id), list)

    # Acting on someone else's record: blocked.
    with pytest.raises(PermissionError):
        lib.reserve(me, book.id, other.id, today=date(2026, 1, 1))
    with pytest.raises(PermissionError):
        lib.member_loans(me, other.id)


def test_member_can_waive_nothing_but_can_pay_own_fine():
    lib, book, member = _setup()
    me = Actor.member(member.id)
    loan = lib.checkout(LIB, book.id, member.id, today=date(2026, 1, 1))
    lib.return_loan(LIB, loan.id, today=date(2026, 1, 25))  # late -> fine
    (fine,) = lib.member_fines(LIB, member.id)

    with pytest.raises(PermissionError):
        lib.waive_fine(me, fine.id)  # waive is librarian-only

    paid = lib.pay_fine(me, fine.id)  # paying own fine is allowed
    assert paid.paid == 1
