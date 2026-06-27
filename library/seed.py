"""Build a populated Library from the committed seed CSVs under data/.

``seed()`` returns a fresh in-memory (or on-disk) Library with the catalog and
members loaded, plus one librarian on staff. Used by demo.py and handy in a
REPL. Tests build their own fixtures and do not depend on this.
"""

from __future__ import annotations

import os

from .library import Actor, Library, LoanRules

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")


def seed(db_path: str = ":memory:", rules: LoanRules | None = None) -> Library:
    lib = Library(db_path, rules=rules)
    librarian = Actor.librarian()
    lib.add_staff(librarian, "Head Librarian", "desk@example.edu")

    with open(os.path.join(DATA_DIR, "catalog.csv"), encoding="utf-8") as fh:
        lib.import_catalog_csv(librarian, fh.read())
    with open(os.path.join(DATA_DIR, "members.csv"), encoding="utf-8") as fh:
        lib.import_members_csv(librarian, fh.read())
    return lib
