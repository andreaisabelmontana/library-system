"""End-to-end lifecycle demo of the library backend.

Run:  python demo.py

Exercises: seeding from CSV, role-gated checkout, an overdue return with a
computed fine, the FIFO reservation queue being served on return, paying a
fine to lift the borrow block, a librarian-only inventory report, and a
member being denied a librarian-only action.
"""

from datetime import date

from library import Actor
from library.errors import LibraryError
from library.seed import seed


def money(cents: int) -> str:
    return f"${cents / 100:.2f}"


def rule(title: str) -> None:
    print("\n" + title)
    print("-" * len(title))


def main() -> None:
    lib = seed(":memory:")
    librarian = Actor.librarian()

    rule("1. Seeded catalog (from data/catalog.csv)")
    books = lib.search("")
    print(f"{len(books)} titles loaded. A few:")
    for b in books[:4]:
        print(f"  - {b.title} by {b.author} [{b.category}] "
              f"-> {lib.available_count(b.id)} copies available")

    # Identify a couple of members and a title.
    andrea = next(m for m in (lib.get_member(i) for i in range(1, 6))
                  if m.email == "andrea@example.edu")
    marcus = next(m for m in (lib.get_member(i) for i in range(1, 6))
                  if m.email == "marcus@example.com")
    priya = next(m for m in (lib.get_member(i) for i in range(1, 6))
                 if m.email == "priya@example.edu")
    hobbit = next(b for b in books if b.title == "The Hobbit")

    rule("2. Search")
    for b in lib.search("tolkien"):
        print(f"  match: {b.title} ({b.isbn})")

    rule("3. Checkout (librarian issues a copy to Andrea)")
    loan = lib.checkout(librarian, hobbit.id, andrea.id, today=date(2026, 1, 10))
    print(f"  '{hobbit.title}' -> Andrea | due {loan.due_date} | "
          f"available now: {lib.available_count(hobbit.id)}")

    rule("4. Overdue return -> automatic fine")
    print(f"  due {loan.due_date}, returned 2026-02-09")
    returned = lib.return_loan(librarian, loan.id, today=date(2026, 2, 9))
    (fine,) = lib.member_fines(librarian, andrea.id)
    print(f"  {fine.reason} -> fine {money(fine.amount_cents)} "
          f"(rate {money(lib.rules.fine_cents_per_day)}/day)")

    rule("5. Fine cap blocks borrowing until paid")
    # Push Andrea over the cap with a second very-late return.
    dune = next(b for b in books if b.title == "Dune")
    l2 = lib.checkout(librarian, dune.id, andrea.id, today=date(2026, 1, 1))
    lib.return_loan(librarian, l2.id, today=date(2026, 3, 1))  # very late
    owed = lib.unpaid_fine_total(andrea.id)
    print(f"  Andrea now owes {money(owed)} (cap {money(lib.rules.max_unpaid_fine_cents)})")
    try:
        lib.checkout(librarian, dune.id, andrea.id, today=date(2026, 3, 2))
    except LibraryError as exc:
        print(f"  checkout blocked: {exc}")
    for f in lib.member_fines(librarian, andrea.id):
        lib.pay_fine(librarian, f.id)
    print(f"  after paying: balance {money(lib.unpaid_fine_total(andrea.id))}")

    rule("6. Reservation queue (FIFO) served on return")
    # One copy of a single-copy title, checked out; two members queue.
    algos = next(b for b in books if b.title.startswith("Introduction to Algorithms"))
    busy = lib.checkout(librarian, algos.id, marcus.id, today=date(2026, 1, 5))
    print(f"  '{algos.title}' checked out to Marcus "
          f"(available: {lib.available_count(algos.id)})")
    lib.reserve(Actor.member(priya.id), algos.id, priya.id, today=date(2026, 1, 6))
    lib.reserve(Actor.member(andrea.id), algos.id, andrea.id, today=date(2026, 1, 7))
    print(f"  queue: {[lib.get_member(r.member_id).name for r in lib.queue(algos.id)]}")
    lib.return_loan(librarian, busy.id, today=date(2026, 1, 8))
    nxt = lib.next_in_line(algos.id)
    print(f"  on return, next in line is {lib.get_member(nxt.member_id).name} "
          f"(status: {nxt.status})")
    lib.checkout(librarian, algos.id, priya.id, today=date(2026, 1, 9))
    print(f"  Priya collected her hold; queue now: "
          f"{[lib.get_member(r.member_id).name for r in lib.queue(algos.id)]}")

    rule("7. Role gating")
    member_actor = Actor.member(priya.id)
    print("  Priya (member) can search and reserve for herself.")
    try:
        member_actor_view = lib.member_loans(member_actor, priya.id)
        print(f"  Priya sees her own {len(member_actor_view)} loan(s).")
    except LibraryError as exc:
        print(f"  unexpected: {exc}")
    try:
        lib.checkout(member_actor, dune.id, priya.id, today=date(2026, 1, 10))
    except PermissionError as exc:
        print(f"  Priya CANNOT check out (librarian-only): {exc}")
    try:
        lib.member_loans(member_actor, marcus.id)
    except PermissionError as exc:
        print(f"  Priya CANNOT view Marcus's history: {exc}")

    rule("8. Inventory / availability report (librarian only)")
    for row in lib.availability_report(librarian):
        if row.total_copies:
            flag = f"  [{row.waiting_reservations} waiting]" if row.waiting_reservations else ""
            print(f"  {row.title:<34} {row.available_copies}/{row.total_copies} "
                  f"available{flag}")

    rule("9. CSV export round-trip")
    csv_text = lib.export_catalog_csv(librarian)
    print("  exported catalog (first 3 lines):")
    for line in csv_text.splitlines()[:3]:
        print(f"    {line}")
    print(f"  ({len(csv_text.splitlines()) - 1} catalog rows exported)")

    lib.close()


if __name__ == "__main__":
    main()
