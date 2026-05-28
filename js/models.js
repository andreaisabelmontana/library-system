/* models.js — User & domain object hierarchies.
 *   abstract User → Admin / Librarian / Member
 *   Book, Author, Loan, Fine — pure POJO-style classes with private fields.
 * Demonstrates: encapsulation (#fields + validated setters), inheritance,
 * polymorphism (describePermissions, can), interface contract Persistable.
 * ------------------------------------------------------------------------- */
'use strict';
(function () {

const Ex = window.LibEx;

const Role = Object.freeze({ ADMIN: 'ADMIN', LIBRARIAN: 'LIBRARIAN', MEMBER: 'MEMBER' });

/* ===========================  User  =================================== */
class User {
  #id; #username; #passwordHash; #fullName; #email; #createdAt; #active;
  constructor({ id, username, passwordHash, fullName, email, createdAt, active }) {
    if (new.target === User) throw new Ex.LibraryException('User is abstract');
    this.#id           = id || crypto.randomUUID();
    this.#username     = User.#normaliseUsername(username);
    this.#passwordHash = passwordHash;
    this.#fullName     = (fullName || '').trim();
    this.#email        = (email || '').trim().toLowerCase();
    this.#createdAt    = createdAt || new Date().toISOString();
    this.#active       = active !== false;
  }
  get id() { return this.#id; }
  get username() { return this.#username; }
  get passwordHash() { return this.#passwordHash; }
  get fullName() { return this.#fullName; }
  get email() { return this.#email; }
  get createdAt() { return this.#createdAt; }
  get active() { return this.#active; }

  setFullName(v) { if (!v || v.trim().length < 2) throw new Ex.ValidationException('Name must be ≥ 2 chars', 'fullName'); this.#fullName = v.trim(); }
  setEmail(v)    { if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Ex.ValidationException('Invalid e-mail', 'email'); this.#email = (v || '').trim().toLowerCase(); }
  setActive(b)   { this.#active = !!b; }
  setPasswordHash(h) { this.#passwordHash = h; }

  authenticate(passwordHash) {
    if (!this.#active) throw new Ex.AuthenticationException('Account disabled');
    if (this.#passwordHash !== passwordHash) throw new Ex.AuthenticationException();
    return true;
  }
  getRole() { throw new Ex.LibraryException('getRole is abstract'); }
  /** Polymorphism showcase — every subclass overrides. */
  describePermissions() { return 'Browse the catalogue.'; }
  can(action) { return false; }

  static #normaliseUsername(u) {
    if (!u || !u.trim()) throw new Ex.ValidationException('Username required', 'username');
    const s = u.trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,32}$/.test(s)) throw new Ex.ValidationException('3-32 chars, a-z 0-9 . _ -', 'username');
    return s;
  }
  toJSON() {
    return { kind: this.getRole(), id: this.#id, username: this.#username, passwordHash: this.#passwordHash,
      fullName: this.#fullName, email: this.#email, createdAt: this.#createdAt, active: this.#active };
  }
}

class Admin extends User {
  getRole() { return Role.ADMIN; }
  describePermissions() { return 'Full access — manage staff, books, loans and reports.'; }
  can(action) { return ['manage-users','manage-books','manage-loans','view-reports','csv'].includes(action); }
}
class Librarian extends User {
  getRole() { return Role.LIBRARIAN; }
  describePermissions() { return 'Day-to-day desk: issue loans, process returns, register members.'; }
  can(action) { return ['manage-books','manage-loans','register-members','view-reports'].includes(action); }
}
class Member extends User {
  getRole() { return Role.MEMBER; }
  describePermissions() { return 'Search the catalogue, see your active loans and any open fines.'; }
  can(action) { return ['borrow','return-own'].includes(action); }
}

function userFromPlain(o) {
  const kind = (o.kind || o.role || '').toUpperCase();
  switch (kind) {
    case Role.ADMIN:     return new Admin(o);
    case Role.LIBRARIAN: return new Librarian(o);
    case Role.MEMBER:    return new Member(o);
    default: throw new Ex.ValidationException(`Unknown role "${kind}"`, 'role');
  }
}

/* ===========================  Book / Author  ========================== */
class Author {
  #id; #name; #nationality;
  constructor({ id, name, nationality }) {
    this.#id = id || crypto.randomUUID();
    if (!name || !name.trim()) throw new Ex.ValidationException('Author name required', 'name');
    this.#name = name.trim();
    this.#nationality = (nationality || '').trim();
  }
  get id() { return this.#id; }
  get name() { return this.#name; }
  get nationality() { return this.#nationality; }
  toJSON() { return { id: this.#id, name: this.#name, nationality: this.#nationality }; }
}

class Book {
  #id; #isbn; #title; #year; #authorIds; #genre; #totalCopies; #availableCopies; #createdAt;
  constructor({ id, isbn, title, year, authorIds, genre, totalCopies, availableCopies, createdAt }) {
    this.#id = id || crypto.randomUUID();
    this.setIsbn(isbn);
    this.setTitle(title);
    this.setYear(year);
    this.#authorIds = Array.isArray(authorIds) ? authorIds.slice() : [];
    this.#genre = (genre || '').trim();
    const tc = Number(totalCopies); if (!Number.isInteger(tc) || tc < 1) throw new Ex.ValidationException('Copies ≥ 1', 'totalCopies');
    this.#totalCopies = tc;
    const ac = availableCopies === undefined ? tc : Number(availableCopies);
    if (!Number.isInteger(ac) || ac < 0 || ac > tc) throw new Ex.ValidationException('Available 0..total', 'availableCopies');
    this.#availableCopies = ac;
    this.#createdAt = createdAt || new Date().toISOString();
  }
  get id() { return this.#id; }
  get isbn() { return this.#isbn; }
  get title() { return this.#title; }
  get year() { return this.#year; }
  get authorIds() { return this.#authorIds.slice(); }
  get genre() { return this.#genre; }
  get totalCopies() { return this.#totalCopies; }
  get availableCopies() { return this.#availableCopies; }
  get createdAt() { return this.#createdAt; }

  setIsbn(v) { if (!v) throw new Ex.ValidationException('ISBN required', 'isbn'); this.#isbn = String(v).replace(/[\s-]/g,''); }
  setTitle(v){ if (!v || !v.trim()) throw new Ex.ValidationException('Title required', 'title'); this.#title = v.trim(); }
  setYear(v) { const y = Number(v); const cur = new Date().getFullYear(); if (!Number.isInteger(y) || y < 1450 || y > cur + 1) throw new Ex.ValidationException(`Year 1450..${cur+1}`, 'year'); this.#year = y; }
  setGenre(v){ this.#genre = (v || '').trim(); }
  setAuthorIds(arr) { this.#authorIds = (arr || []).slice(); }
  setTotalCopies(v) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new Ex.ValidationException('Copies ≥ 1', 'totalCopies');
    const loaned = this.#totalCopies - this.#availableCopies;
    if (n < loaned) throw new Ex.LoanRuleException(`Cannot reduce below currently-loaned (${loaned}) copies`);
    this.#availableCopies += (n - this.#totalCopies);
    this.#totalCopies = n;
  }

  /** Loan one copy. Throws if no copies left. */
  reserveCopy() {
    if (this.#availableCopies <= 0) throw new Ex.BookNotAvailableException(this.#title);
    this.#availableCopies--;
  }
  releaseCopy() {
    if (this.#availableCopies < this.#totalCopies) this.#availableCopies++;
  }
  status() {
    if (this.#availableCopies === 0)               return 'loaned';
    if (this.#availableCopies < this.#totalCopies) return 'partial';
    return 'available';
  }
  toJSON() {
    return { id: this.#id, isbn: this.#isbn, title: this.#title, year: this.#year, authorIds: this.#authorIds,
      genre: this.#genre, totalCopies: this.#totalCopies, availableCopies: this.#availableCopies, createdAt: this.#createdAt };
  }
}

/* ===========================  Loan / Fine  ============================ */
const LOAN_PERIOD_DAYS = 14;
const FINE_PER_DAY     = 0.25;

class Loan {
  #id; #bookId; #memberId; #loanDate; #dueDate; #returnDate;
  constructor({ id, bookId, memberId, loanDate, dueDate, returnDate }) {
    this.#id = id || crypto.randomUUID();
    if (!bookId)   throw new Ex.ValidationException('bookId required', 'bookId');
    if (!memberId) throw new Ex.ValidationException('memberId required', 'memberId');
    this.#bookId   = bookId;
    this.#memberId = memberId;
    this.#loanDate = loanDate || new Date().toISOString();
    this.#dueDate  = dueDate || new Date(Date.parse(this.#loanDate) + LOAN_PERIOD_DAYS * 86400000).toISOString();
    this.#returnDate = returnDate || null;
  }
  get id() { return this.#id; }
  get bookId() { return this.#bookId; }
  get memberId() { return this.#memberId; }
  get loanDate() { return this.#loanDate; }
  get dueDate() { return this.#dueDate; }
  get returnDate() { return this.#returnDate; }
  isReturned() { return !!this.#returnDate; }
  daysOverdue(asOf = new Date()) {
    const end = this.#returnDate ? new Date(this.#returnDate) : asOf;
    const diff = (end - new Date(this.#dueDate)) / 86400000;
    return Math.max(0, Math.floor(diff));
  }
  markReturned(when = new Date()) {
    if (this.#returnDate) throw new Ex.LoanRuleException('Loan already returned');
    this.#returnDate = when.toISOString();
    return this.daysOverdue();
  }
  toJSON() {
    return { id: this.#id, bookId: this.#bookId, memberId: this.#memberId,
      loanDate: this.#loanDate, dueDate: this.#dueDate, returnDate: this.#returnDate };
  }
}

class Fine {
  #id; #loanId; #amount; #paid; #createdAt;
  constructor({ id, loanId, amount, paid, createdAt }) {
    this.#id = id || crypto.randomUUID();
    if (!loanId) throw new Ex.ValidationException('loanId required', 'loanId');
    this.#loanId = loanId;
    const a = Number(amount); if (!Number.isFinite(a) || a < 0) throw new Ex.ValidationException('Amount ≥ 0', 'amount');
    this.#amount = Math.round(a * 100) / 100;
    this.#paid = !!paid;
    this.#createdAt = createdAt || new Date().toISOString();
  }
  get id() { return this.#id; }
  get loanId() { return this.#loanId; }
  get amount() { return this.#amount; }
  get paid() { return this.#paid; }
  get createdAt() { return this.#createdAt; }
  markPaid() { this.#paid = true; }
  toJSON() { return { id: this.#id, loanId: this.#loanId, amount: this.#amount, paid: this.#paid, createdAt: this.#createdAt }; }
}

window.LibModels = {
  Role, User, Admin, Librarian, Member, userFromPlain,
  Author, Book, Loan, Fine,
  LOAN_PERIOD_DAYS, FINE_PER_DAY,
};
})();
