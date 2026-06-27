"""Multi-role library management backend (SQLite-backed).

Public surface:

    from library import Library, Role
    from library.errors import (
        LibraryError, PermissionError_, NotAvailableError,
        LoanLimitError, FineCapError, NotFoundError, DuplicateError,
    )

`Library` is the single entry point: open it on a database path, then call
operations as a given actor (member or librarian). Role gating, loan-limit
and fine-cap enforcement, overdue-fine accrual and the FIFO reservation queue
all live behind that object.
"""

from .errors import (
    LibraryError,
    AuthError,
    NotAvailableError,
    LoanLimitError,
    FineCapError,
    NotFoundError,
    DuplicateError,
)
from .models import Role, LoanStatus, CopyStatus, ReservationStatus
from .library import Library, LoanRules, Actor

__all__ = [
    "Library",
    "LoanRules",
    "Actor",
    "Role",
    "LoanStatus",
    "CopyStatus",
    "ReservationStatus",
    "LibraryError",
    "AuthError",
    "NotAvailableError",
    "LoanLimitError",
    "FineCapError",
    "NotFoundError",
    "DuplicateError",
]
