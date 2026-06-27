"""SQLite connection + schema for the library backend.

One module so the schema lives in exactly one place. ``connect`` returns a
connection with foreign keys on and ``Row`` row factory; ``init_schema``
creates the tables if they do not already exist.
"""

from __future__ import annotations

import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS members (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    membership  TEXT    NOT NULL DEFAULT 'standard',
    loan_limit  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS staff (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT NOT NULL,
    email   TEXT NOT NULL UNIQUE,
    role    TEXT NOT NULL DEFAULT 'librarian'
);

CREATE TABLE IF NOT EXISTS books (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    title     TEXT NOT NULL,
    author    TEXT NOT NULL,
    isbn      TEXT NOT NULL UNIQUE,
    category  TEXT NOT NULL DEFAULT 'General'
);

CREATE TABLE IF NOT EXISTS copies (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id  INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    barcode  TEXT NOT NULL UNIQUE,
    status   TEXT NOT NULL DEFAULT 'available'
);

CREATE TABLE IF NOT EXISTS loans (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    copy_id       INTEGER NOT NULL REFERENCES copies(id),
    book_id       INTEGER NOT NULL REFERENCES books(id),
    member_id     INTEGER NOT NULL REFERENCES members(id),
    checkout_date TEXT NOT NULL,
    due_date      TEXT NOT NULL,
    return_date   TEXT,
    status        TEXT NOT NULL DEFAULT 'active',
    fine_id       INTEGER REFERENCES fines(id)
);

CREATE TABLE IF NOT EXISTS fines (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id      INTEGER NOT NULL REFERENCES loans(id),
    member_id    INTEGER NOT NULL REFERENCES members(id),
    amount_cents INTEGER NOT NULL,
    paid         INTEGER NOT NULL DEFAULT 0,
    reason       TEXT NOT NULL DEFAULT 'overdue'
);

CREATE TABLE IF NOT EXISTS reservations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    member_id  INTEGER NOT NULL REFERENCES members(id),
    created_at TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'waiting'
);

CREATE INDEX IF NOT EXISTS idx_copies_book   ON copies(book_id);
CREATE INDEX IF NOT EXISTS idx_loans_member  ON loans(member_id);
CREATE INDEX IF NOT EXISTS idx_loans_status  ON loans(status);
CREATE INDEX IF NOT EXISTS idx_resv_book     ON reservations(book_id, status, created_at, id);
CREATE INDEX IF NOT EXISTS idx_fines_member  ON fines(member_id, paid);
"""


def connect(path: str = ":memory:") -> sqlite3.Connection:
    """Open a connection with foreign keys enforced and Row access."""
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    """Create all tables/indexes if they do not exist."""
    conn.executescript(SCHEMA)
    conn.commit()
