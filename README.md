# Library Management System

A browser-only library management system — multi-role auth, catalogue with
loan / return workflow, automatic overdue fines, and CSV export. JavaScript
port of the Java OOP design from CP2 (Sessions 10–20).

## Demo accounts

| Role | Username | Password |
|------|---------|----------|
| Admin | `admin` | `admin123` |
| Librarian | `librarian` | `lib123` |
| Member | `member` | `mem123` |

(There is also `andrea / andrea123` as a sample second member.)

## What it does

- **Public catalogue** — browse 38 classic books across 9 genres. Search by
  title, author or ISBN; filter by availability.
- **Members** — borrow a book if any copy is available (max 5 active loans).
  See own active loans, due dates, returned dates, and any outstanding fines.
- **Librarians** — issue and process loans, add new books, search / filter
  all loans, see overdue items in red, run reports.
- **Admins** — everything librarians can do, plus user management, CSV
  export, demo reset.
- **Automatic fines** — returns past the due date generate a fine at
  $0.25 per day overdue, attached to the loan.

## Run locally

```bash
python -m http.server 8000
# http://localhost:8000
```

## Deploy to GitHub Pages

Push to a repo and set Pages source to `main / root`. `.nojekyll` is included.

## Java concept mapping

| Java concept | Where it is in the code |
|--------------|------------------------|
| Encapsulation | `js/models.js` — every model uses private `#` fields with validated setters |
| Inheritance | `User → Admin / Librarian / Member` |
| Polymorphism | `describePermissions()`, `can(action)`, `getRole()` overridden per subclass |
| Interface contract | `Persistable<T>` in `js/dao.js` |
| Exception hierarchy | `LibraryException → AuthenticationException, BookNotAvailableException, LoanRuleException, ValidationException, NotFoundException, DuplicateException, CsvFormatException` |
| File I/O | `CsvService` with RFC-4180-aware quoted-field handling |
| Multi-user with auth + authorisation | `AuthService.requireAction()`, role-tailored dashboards |
| Persistence | `LocalStorageDao` — same shape as a JDBC DAO |

## File layout

```
library-system/
├── index.html
├── .nojekyll
├── README.md
├── css/styles.css
└── js/
    ├── exceptions.js
    ├── models.js
    ├── dao.js
    ├── services.js
    ├── catalog.js
    └── app.js
```
