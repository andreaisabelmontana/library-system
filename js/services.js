/* services.js — application services. UI talks to services, services talk
 * to DAOs. Translates DataAccessExceptions into domain exceptions.
 * ------------------------------------------------------------------------- */
'use strict';
(function () {
const Ex = window.LibEx;
const M  = window.LibModels;
const D  = window.LibDao;

/* ---- Password hashing (salted FNV-1a; placeholder, like the syllabus). */
class PasswordHasher {
  static hash(pw, salt = 'library-salt-2026') {
    const input = salt + ':' + (pw || '');
    let h1 = 0x811c9dc5, h2 = 0x9dc5811c;
    for (let i = 0; i < input.length; i++) {
      const c = input.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 0x01000193);
      h2 ^= c << ((i % 4) * 2); h2 = Math.imul(h2, 0x01000193);
    }
    return ('00000000' + (h1 >>> 0).toString(16)).slice(-8) + ('00000000' + (h2 >>> 0).toString(16)).slice(-8);
  }
}

/* ---- SessionManager ---- */
class SessionManager {
  static KEY = 'session';
  #user = null;
  constructor(userDao) {
    const stored = D.Storage.read(SessionManager.KEY);
    if (stored && stored.username) {
      try { this.#user = userDao.findByUsername(stored.username); } catch { this.#user = null; }
    }
  }
  get current() { return this.#user; }
  setCurrent(u) { this.#user = u; D.Storage.write(SessionManager.KEY, { username: u.username }); }
  clear() { this.#user = null; D.Storage.write(SessionManager.KEY, null); }
}

/* ---- AuthService ---- */
class AuthService {
  #users; #session;
  constructor(userDao, session) { this.#users = userDao; this.#session = session; }
  login(username, password) {
    const u = this.#users.findByUsername(username);
    if (!u) throw new Ex.AuthenticationException();
    u.authenticate(PasswordHasher.hash(password));
    this.#session.setCurrent(u);
    return u;
  }
  logout() { this.#session.clear(); }
  register({ role, username, password, fullName, email }) {
    if (!password || password.length < 6) throw new Ex.ValidationException('Password ≥ 6 chars', 'password');
    const u = M.userFromPlain({ kind: role, username, fullName, email, passwordHash: PasswordHasher.hash(password) });
    return this.#users.save(u);
  }
  requireAction(action) {
    const u = this.#session.current;
    if (!u) throw new Ex.AuthorizationException('Sign in first');
    if (!u.can(action)) throw new Ex.AuthorizationException(`"${action}" not permitted for ${u.getRole()}`);
    return u;
  }
}

/* ---- LibraryService — loan workflow ---- */
class LibraryService {
  #books; #loans; #fines; #users; #authors;
  constructor(bookDao, loanDao, fineDao, userDao, authorDao) {
    this.#books = bookDao; this.#loans = loanDao; this.#fines = fineDao;
    this.#users = userDao; this.#authors = authorDao;
  }
  listBooks({ search = '', status = '', sort = 'title' } = {}) {
    const q = (search || '').toLowerCase();
    let rows = this.#books.findAll();
    if (q) {
      const authors = this.#authors.findAll();
      const matchAuthor = id => {
        const a = authors.find(x => x.id === id);
        return a && a.name.toLowerCase().includes(q);
      };
      rows = rows.filter(b => b.title.toLowerCase().includes(q) ||
        b.isbn.includes(q) || b.authorIds.some(matchAuthor));
    }
    if (status) rows = rows.filter(b => b.status() === status);
    const cmp = {
      'title':     (a,b) => a.title.localeCompare(b.title),
      'year-desc': (a,b) => b.year - a.year,
      'year-asc':  (a,b) => a.year - b.year,
    }[sort] || ((a,b)=>0);
    rows.sort(cmp);
    return rows;
  }
  getBook(id) { return this.#books.findById(id); }
  saveBook(data) {
    const existingByIsbn = this.#books.findByIsbn(String(data.isbn || '').replace(/[\s-]/g,''));
    if (existingByIsbn && existingByIsbn.id !== data.id) throw new Ex.DuplicateException('Book', data.isbn);
    const book = new M.Book(data);
    return this.#books.save(book);
  }
  deleteBook(id) {
    if (this.#loans.activeForBook(id).length > 0) throw new Ex.LoanRuleException('Book has active loans');
    this.#books.delete(id);
  }
  saveAuthor(data) { return this.#authors.save(new M.Author(data)); }
  getAuthor(id) { try { return this.#authors.findById(id); } catch { return null; } }

  /* ---- Loan workflow ---- */
  borrow(bookId, memberId) {
    const book = this.#books.findById(bookId);
    const member = this.#users.findById(memberId);
    if (member.getRole() !== M.Role.MEMBER) throw new Ex.LoanRuleException('Only members can borrow');
    if (this.#loans.activeForMember(memberId).length >= 5) throw new Ex.LoanRuleException('Member already has 5 active loans');
    book.reserveCopy();                                  // throws BookNotAvailableException
    this.#books.save(book);
    return this.#loans.save(new M.Loan({ bookId, memberId }));
  }
  returnLoan(loanId) {
    const loan = this.#loans.findById(loanId);
    if (loan.isReturned()) throw new Ex.LoanRuleException('Already returned');
    const overdueDays = loan.markReturned();
    this.#loans.save(loan);
    const book = this.#books.findById(loan.bookId);
    book.releaseCopy();
    this.#books.save(book);
    if (overdueDays > 0) {
      const fine = new M.Fine({ loanId: loan.id, amount: overdueDays * M.FINE_PER_DAY });
      this.#fines.save(fine);
      return { loan, fine, overdueDays };
    }
    return { loan, fine: null, overdueDays: 0 };
  }
  payFine(fineId) {
    const f = this.#fines.findById(fineId);
    f.markPaid();
    this.#fines.save(f);
    return f;
  }

  /* ---- Reports ---- */
  stats() {
    const books = this.#books.findAll();
    const loans = this.#loans.findAll();
    const fines = this.#fines.findAll();
    const totalCopies = books.reduce((s, b) => s + b.totalCopies, 0);
    const availCopies = books.reduce((s, b) => s + b.availableCopies, 0);
    const active = loans.filter(l => !l.isReturned());
    const overdue = active.filter(l => l.daysOverdue() > 0);
    const openFines = fines.filter(f => !f.paid).reduce((s, f) => s + f.amount, 0);
    const byGenre = {};
    for (const b of books) byGenre[b.genre || 'Other'] = (byGenre[b.genre || 'Other'] || 0) + 1;
    const popularity = {};
    for (const l of loans) popularity[l.bookId] = (popularity[l.bookId] || 0) + 1;
    const topBooks = Object.entries(popularity).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, n]) => ({ book: this.#books.findById(id), loanCount: n }));
    return {
      titles: books.length, totalCopies, availCopies,
      activeLoans: active.length, overdueLoans: overdue.length,
      members: this.#users.findAll().filter(u => u.getRole() === M.Role.MEMBER).length,
      openFinesAmount: Math.round(openFines * 100) / 100,
      byGenre, topBooks,
    };
  }
}

/* ---- CsvService ---- */
class CsvService {
  static escape(v) {
    if (v == null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  static parseCsv(text) {
    const out = [];
    let row = [], field = '', inQ = false, i = 0;
    while (i < text.length) {
      const c = text[i];
      if (inQ) {
        if (c === '"' && text[i+1] === '"') { field += '"'; i += 2; continue; }
        if (c === '"') { inQ = false; i++; continue; }
        field += c; i++;
      } else {
        if (c === '"') { inQ = true; i++; continue; }
        if (c === ',') { row.push(field); field = ''; i++; continue; }
        if (c === '\r') { i++; continue; }
        if (c === '\n') { row.push(field); out.push(row); row = []; field = ''; i++; continue; }
        field += c; i++;
      }
    }
    if (field.length || row.length) { row.push(field); out.push(row); }
    return out.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
  }
  static exportBooks(books, authorMap) {
    const head = 'isbn,title,year,authors,genre,total_copies,available_copies';
    const e = CsvService.escape;
    const rows = books.map(b => [
      e(b.isbn), e(b.title), b.year,
      e(b.authorIds.map(id => authorMap.get(id)?.name || '').filter(Boolean).join('|')),
      e(b.genre), b.totalCopies, b.availableCopies,
    ].join(','));
    return head + '\n' + rows.join('\n') + '\n';
  }
}

window.LibServices = { PasswordHasher, SessionManager, AuthService, LibraryService, CsvService };
})();
