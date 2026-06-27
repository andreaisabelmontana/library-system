"""Exception hierarchy for the library backend.

Authorization failures raise the built-in ``PermissionError`` (re-exported here
as ``AuthError`` for symmetry) so callers can ``except PermissionError`` exactly
as the task requires. Everything else descends from ``LibraryError``.
"""


class LibraryError(Exception):
    """Base class for all domain errors raised by the library backend."""


# Authorization uses the built-in PermissionError so that
# `except PermissionError` works as specified.
AuthError = PermissionError


class NotAvailableError(LibraryError):
    """Raised when a checkout is attempted but no copy is free."""


class LoanLimitError(LibraryError):
    """Raised when a member is already at their active-loan limit."""


class FineCapError(LibraryError):
    """Raised when a member's unpaid fines exceed the borrow cap."""


class NotFoundError(LibraryError):
    """Raised when a referenced row (book, member, loan, ...) does not exist."""


class DuplicateError(LibraryError):
    """Raised when inserting a row that violates a uniqueness rule (e.g. ISBN)."""
