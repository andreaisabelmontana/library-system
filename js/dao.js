/* dao.js — Persistable<T> contract + LocalStorage DAOs.
 * Same as Java's interface Persistable<T> { findById, findAll, save, delete }
 * ------------------------------------------------------------------------- */
'use strict';
(function () {

const Ex = window.LibEx;
const M  = window.LibModels;
const NS = 'library-system::';

class Storage {
  static read(key) {
    try { const raw = localStorage.getItem(NS + key); return raw ? JSON.parse(raw) : null; }
    catch (e) { throw new Ex.LibraryException(`Cannot read "${key}"`, e); }
  }
  static write(key, value) { localStorage.setItem(NS + key, JSON.stringify(value)); }
  static clear() {
    for (const k of Object.keys(localStorage)) if (k.startsWith(NS)) localStorage.removeItem(k);
  }
}

class Persistable {
  findById(id) { throw new Ex.LibraryException('findById is abstract'); }
  findAll()    { throw new Ex.LibraryException('findAll is abstract'); }
  save(e)      { throw new Ex.LibraryException('save is abstract'); }
  delete(id)   { throw new Ex.LibraryException('delete is abstract'); }
  count()      { return this.findAll().length; }
}

class LocalStorageDao extends Persistable {
  constructor(key, mapRow) { super(); this.key = key; this.mapRow = mapRow; }
  #load() { return Storage.read(this.key) || []; }
  #write(rows) { Storage.write(this.key, rows); }
  findAll() { return this.#load().map(this.mapRow); }
  findById(id) {
    const r = this.#load().find(x => x.id === id);
    if (!r) throw new Ex.NotFoundException(this.key, id);
    return this.mapRow(r);
  }
  save(entity) {
    const rows = this.#load();
    const j = entity.toJSON();
    const i = rows.findIndex(r => r.id === j.id);
    if (i >= 0) rows[i] = j; else rows.push(j);
    this.#write(rows);
    return entity;
  }
  delete(id) {
    const rows = this.#load();
    const i = rows.findIndex(r => r.id === id);
    if (i < 0) throw new Ex.NotFoundException(this.key, id);
    rows.splice(i, 1);
    this.#write(rows);
  }
  filter(pred) { return this.findAll().filter(pred); }
  findFirst(pred) {
    const row = this.#load().find(r => pred(this.mapRow(r)));
    return row ? this.mapRow(row) : null;
  }
}

/* ---- concrete DAOs ---- */
class UserDao extends LocalStorageDao {
  constructor() { super('users', M.userFromPlain); }
  findByUsername(u) { return this.findFirst(x => x.username === (u || '').toLowerCase().trim()); }
  save(user) {
    const existing = this.findByUsername(user.username);
    if (existing && existing.id !== user.id) throw new Ex.DuplicateException('User', user.username);
    return super.save(user);
  }
}
class AuthorDao extends LocalStorageDao { constructor() { super('authors', o => new M.Author(o)); } }
class BookDao extends LocalStorageDao {
  constructor() { super('books', o => new M.Book(o)); }
  findByIsbn(isbn) { return this.findFirst(b => b.isbn === isbn); }
}
class LoanDao extends LocalStorageDao {
  constructor() { super('loans', o => new M.Loan(o)); }
  forMember(memberId) { return this.filter(l => l.memberId === memberId); }
  activeForMember(memberId) { return this.filter(l => l.memberId === memberId && !l.isReturned()); }
  activeForBook(bookId) { return this.filter(l => l.bookId === bookId && !l.isReturned()); }
}
class FineDao extends LocalStorageDao {
  constructor() { super('fines', o => new M.Fine(o)); }
  forLoan(loanId) { return this.findFirst(f => f.loanId === loanId); }
  forMember(memberId, loanDao) {
    const loanIds = new Set(loanDao.forMember(memberId).map(l => l.id));
    return this.filter(f => loanIds.has(f.loanId));
  }
}

window.LibDao = { Storage, Persistable, LocalStorageDao, UserDao, AuthorDao, BookDao, LoanDao, FineDao };
})();
