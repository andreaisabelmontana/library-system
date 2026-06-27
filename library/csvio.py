"""CSV import/export helpers for the catalog and members.

Uses the stdlib ``csv`` module (RFC-4180 quoting) so titles/authors with commas
and quotes round-trip cleanly. Catalog rows carry a ``copies`` count column; on
import we materialise that many physical copies with generated barcodes.
"""

from __future__ import annotations

import csv
import io
from typing import Iterable

CATALOG_FIELDS = ["title", "author", "isbn", "category", "copies"]
MEMBER_FIELDS = ["name", "email", "membership"]


def write_catalog(rows: Iterable[dict]) -> str:
    """Serialise catalog rows (dicts with CATALOG_FIELDS) to a CSV string."""
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=CATALOG_FIELDS, lineterminator="\n")
    w.writeheader()
    for r in rows:
        w.writerow({k: r[k] for k in CATALOG_FIELDS})
    return buf.getvalue()


def read_catalog(text: str) -> list[dict]:
    """Parse a catalog CSV string into a list of normalised dicts."""
    reader = csv.DictReader(io.StringIO(text))
    missing = set(CATALOG_FIELDS) - set(reader.fieldnames or [])
    if missing:
        raise ValueError(f"catalog CSV missing columns: {sorted(missing)}")
    out = []
    for raw in reader:
        out.append(
            {
                "title": (raw["title"] or "").strip(),
                "author": (raw["author"] or "").strip(),
                "isbn": (raw["isbn"] or "").strip(),
                "category": (raw["category"] or "General").strip() or "General",
                "copies": int(raw["copies"] or 1),
            }
        )
    return out


def write_members(rows: Iterable[dict]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=MEMBER_FIELDS, lineterminator="\n")
    w.writeheader()
    for r in rows:
        w.writerow({k: r[k] for k in MEMBER_FIELDS})
    return buf.getvalue()


def read_members(text: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text))
    missing = set(MEMBER_FIELDS) - set(reader.fieldnames or [])
    if missing:
        raise ValueError(f"members CSV missing columns: {sorted(missing)}")
    out = []
    for raw in reader:
        out.append(
            {
                "name": (raw["name"] or "").strip(),
                "email": (raw["email"] or "").strip(),
                "membership": (raw["membership"] or "standard").strip() or "standard",
            }
        )
    return out
