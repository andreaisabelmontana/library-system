from datetime import date

from library import Library, Actor

LIB = Actor.librarian()


def test_reservation_queue_is_fifo_and_served_on_return():
    lib = Library(":memory:")
    book = lib.add_book(LIB, "Hot Title", "Auth", "ISBN-H", "X", copies=1)
    holder = lib.add_member(LIB, "Holder", "h@x.com", "standard")
    first = lib.add_member(LIB, "First", "f@x.com", "standard")
    second = lib.add_member(LIB, "Second", "s@x.com", "standard")

    # The only copy is checked out.
    loan = lib.checkout(LIB, book.id, holder.id, today=date(2026, 1, 1))
    assert lib.available_count(book.id) == 0

    # Two members queue, in order.
    lib.reserve(Actor.member(first.id), book.id, first.id, today=date(2026, 1, 2))
    lib.reserve(Actor.member(second.id), book.id, second.id, today=date(2026, 1, 3))

    q = lib.queue(book.id)
    assert [r.member_id for r in q] == [first.id, second.id]

    # Returning the copy promotes the head (FIFO) to "ready".
    lib.return_loan(LIB, loan.id, today=date(2026, 1, 5))
    nxt = lib.next_in_line(book.id)
    assert nxt.member_id == first.id
    assert nxt.status == "ready"

    # A non-head member cannot jump the line for the freed copy.
    import pytest
    from library.errors import NotAvailableError
    with pytest.raises(NotAvailableError):
        lib.checkout(LIB, book.id, second.id, today=date(2026, 1, 6))

    # The head consumes their ready hold via checkout.
    lib.checkout(LIB, book.id, first.id, today=date(2026, 1, 6))
    # First is gone from the queue; second is now the head.
    q2 = lib.queue(book.id)
    assert [r.member_id for r in q2] == [second.id]


def test_returning_with_no_queue_just_frees_copy():
    lib = Library(":memory:")
    book = lib.add_book(LIB, "Quiet", "Auth", "ISBN-Q", "X", copies=1)
    m = lib.add_member(LIB, "M", "m@x.com", "standard")
    loan = lib.checkout(LIB, book.id, m.id, today=date(2026, 1, 1))
    lib.return_loan(LIB, loan.id, today=date(2026, 1, 2))
    assert lib.available_count(book.id) == 1
    assert lib.next_in_line(book.id) is None
