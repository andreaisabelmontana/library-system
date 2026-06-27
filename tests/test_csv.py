from library import Library, Actor

LIB = Actor.librarian()


def test_catalog_csv_round_trips():
    lib = Library(":memory:")
    # Includes a title with a comma to exercise RFC-4180 quoting.
    lib.add_book(LIB, "Thinking, Fast and Slow", "Kahneman", "ISBN-K", "Psych", 2)
    lib.add_book(LIB, "Dune", "Herbert", "ISBN-D", "SciFi", 3)
    lib.add_book(LIB, "1984", "Orwell", "ISBN-O", "Dystopia", 1)

    exported = lib.export_catalog_csv(LIB)

    # Import into a brand-new library and compare the catalogs.
    lib2 = Library(":memory:")
    count = lib2.import_catalog_csv(LIB, exported)
    assert count == 3

    a = {(b.title, b.author, b.isbn, b.category): lib.available_count(b.id)
         for b in lib.search("")}
    b = {(x.title, x.author, x.isbn, x.category): lib2.available_count(x.id)
         for x in lib2.search("")}
    assert a == b
    # The comma-containing title survived the round-trip intact.
    assert any(k[0] == "Thinking, Fast and Slow" for k in b)


def test_catalog_export_is_stable_under_reexport():
    lib = Library(":memory:")
    lib.add_book(LIB, "A", "Auth", "ISBN-A", "X", 2)
    lib.add_book(LIB, "B", "Auth", "ISBN-B", "Y", 1)
    first = lib.export_catalog_csv(LIB)

    lib2 = Library(":memory:")
    lib2.import_catalog_csv(LIB, first)
    second = lib2.export_catalog_csv(LIB)
    assert first == second


def test_members_csv_round_trips():
    lib = Library(":memory:")
    lib.add_member(LIB, "Andrea Montana", "a@x.edu", "student")
    lib.add_member(LIB, "Marcus Webb", "m@x.com", "standard")
    exported = lib.export_members_csv(LIB)

    lib2 = Library(":memory:")
    n = lib2.import_members_csv(LIB, exported)
    assert n == 2
    assert lib2.export_members_csv(LIB) == exported
