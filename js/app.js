/* app.js — UI controllers + router. Keeps DOM logic out of services. */
'use strict';
(function () {
const Ex = window.LibEx;
const M  = window.LibModels;
const D  = window.LibDao;
const S  = window.LibServices;
const C  = window.LibCatalog;

const userDao = new D.UserDao();
const bookDao = new D.BookDao();
const authorDao = new D.AuthorDao();
const loanDao = new D.LoanDao();
const fineDao = new D.FineDao();
const session = new S.SessionManager(userDao);
const auth = new S.AuthService(userDao, session);
const library = new S.LibraryService(bookDao, loanDao, fineDao, userDao, authorDao);

/* ---- Seed ---- */
function seed() {
  if (userDao.count() === 0) for (const u of C.USERS) try { auth.register(u); } catch (_) {}
  if (authorDao.count() === 0) for (const a of C.AUTHORS) authorDao.save(new M.Author(a));
  if (bookDao.count() === 0) for (const b of C.BOOKS) {
    try { library.saveBook(b); } catch (_) {}
  }
}
seed();

/* ---- Helpers ---- */
const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[<>&"']/g,
  c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const Toast = {
  show(message, kind = 'info', ttl = 3000) {
    const el = document.createElement('div'); el.className = `toast ${kind}`; el.textContent = message;
    $('#toast-root').appendChild(el); setTimeout(() => el.remove(), ttl);
  },
  success(m) { this.show(m, 'success'); }, error(m) { this.show(m, 'error'); },
};

const Modal = {
  open(node, title) {
    const body = $('#modal-body'); body.innerHTML = '';
    if (title) { const h = document.createElement('h2'); h.textContent = title; body.appendChild(h); }
    if (typeof node === 'string') body.insertAdjacentHTML('beforeend', node);
    else body.appendChild(node);
    $('#modal-root').hidden = false;
    document.body.style.overflow = 'hidden';
  },
  close() { $('#modal-root').hidden = true; document.body.style.overflow = ''; },
};

function colorClass(book) {
  let h = 0;
  for (let i = 0; i < book.id.length; i++) h = (h * 31 + book.id.charCodeAt(i)) | 0;
  return 'color-' + ((Math.abs(h) % 5) + 1);
}

function fmtDate(iso) { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString(); }
function authorNames(book) {
  return book.authorIds.map(id => library.getAuthor(id)?.name || '?').join(', ');
}

/* ============ Router ============ */
function go(view) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  $$('#topbar nav a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  if (view === 'catalog')   CatalogUI.render();
  if (view === 'dashboard') Dashboard.render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ============ Header ============ */
const Header = {
  refresh() {
    const u = session.current;
    $('#who').textContent  = u ? `${u.fullName || u.username} · ${u.getRole().toLowerCase()}` : '';
    $('#login-btn').hidden  = !!u;
    $('#logout-btn').hidden = !u;
    $('#nav-dash').hidden = !u;
  },
};

/* ============ Login ============ */
const LoginUI = {
  open() {
    const f = document.createElement('form');
    f.innerHTML = `
      <div class="form-grid">
        <label class="full">Username <input name="username" required autocomplete="username" /></label>
        <label class="full">Password <input name="password" type="password" required autocomplete="current-password" /></label>
      </div>
      <p style="font-size:.85rem;color:var(--ink-2);margin-top:1rem">
        Demo: <code>admin / admin123</code> · <code>librarian / lib123</code> · <code>member / mem123</code>
      </p>
      <div class="form-actions">
        <button type="button" id="lc">Cancel</button>
        <button class="primary" type="submit">Sign in</button>
      </div>`;
    f.addEventListener('submit', ev => {
      ev.preventDefault();
      const fd = new FormData(f);
      try {
        const u = auth.login(fd.get('username'), fd.get('password'));
        Modal.close(); Toast.success(`Welcome, ${u.fullName || u.username}`);
        Header.refresh();
        go(u.getRole() === M.Role.MEMBER ? 'catalog' : 'dashboard');
      } catch (e) {
        if (e instanceof Ex.LibraryException) Toast.error(e.message); else throw e;
      }
    });
    Modal.open(f, 'Sign in');
    $('#lc').addEventListener('click', () => Modal.close());
    setTimeout(() => f.querySelector('input').focus(), 50);
  },
};

/* ============ Catalogue ============ */
const CatalogUI = {
  render() {
    const params = {
      search: $('#f-search').value,
      status: $('#f-status').value,
      sort:   $('#f-sort').value,
    };
    const rows = library.listBooks(params);
    $('#result-count').textContent = `${rows.length} of ${bookDao.count()} books`;
    const grid = $('#book-grid');
    if (rows.length === 0) {
      grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--ink-2);padding:3rem 0">No books match.</p>`;
      return;
    }
    grid.innerHTML = rows.map(b => `
      <article class="book-card ${colorClass(b)}" data-id="${b.id}">
        <div class="cover">${esc(b.title)}</div>
        <h4>${esc(b.title)}</h4>
        <div class="sub">${esc(authorNames(b))} · ${b.year}</div>
        <div class="footer-row">
          <span class="tag ${b.status()}">${esc(b.status())}</span>
          <span style="font-size:.8rem;color:var(--ink-2)">${b.availableCopies}/${b.totalCopies}</span>
        </div>
      </article>`).join('');
    grid.querySelectorAll('.book-card').forEach(c =>
      c.addEventListener('click', () => CatalogUI.openDetail(c.dataset.id)));
  },
  openDetail(id) {
    let b; try { b = library.getBook(id); } catch (e) { Toast.error(e.message); return; }
    const u = session.current;
    const isMember = u && u.getRole() === M.Role.MEMBER;
    const canBorrow = isMember && b.availableCopies > 0;
    const node = document.createElement('div');
    node.className = 'book-detail';
    node.innerHTML = `
      <div class="cover">${esc(b.title)}</div>
      <div>
        <h2 style="margin:0">${esc(b.title)}</h2>
        <p style="color:var(--ink-2);margin:.2rem 0 1rem">${esc(authorNames(b))}</p>
        <dl>
          <dt>ISBN</dt><dd>${esc(b.isbn)}</dd>
          <dt>Year</dt><dd>${b.year}</dd>
          <dt>Genre</dt><dd>${esc(b.genre || '—')}</dd>
          <dt>Status</dt><dd><span class="tag ${b.status()}">${esc(b.status())}</span></dd>
          <dt>Copies</dt><dd>${b.availableCopies} available of ${b.totalCopies}</dd>
        </dl>
        <div class="actions">
          ${!u ? `<button class="primary" id="login-here">Sign in to borrow</button>` : ''}
          ${canBorrow ? `<button class="primary" id="borrow">Borrow this book</button>` : ''}
          ${isMember && !canBorrow ? `<button disabled>No copies available</button>` : ''}
        </div>
      </div>`;
    Modal.open(node, '');
    $('#login-here')?.addEventListener('click', () => { Modal.close(); LoginUI.open(); });
    $('#borrow')?.addEventListener('click', () => {
      try {
        const loan = library.borrow(b.id, u.id);
        Toast.success(`Borrowed — due ${fmtDate(loan.dueDate)}`);
        Modal.close(); CatalogUI.render();
        if (Router.current === 'dashboard') Dashboard.render();
      } catch (e) {
        if (e instanceof Ex.LibraryException) Toast.error(e.message); else throw e;
      }
    });
  },
};

const Router = { current: 'catalog' };

/* ============ Book / member forms ============ */
const BookForm = {
  open(existing = null) {
    const authors = authorDao.findAll();
    const node = document.createElement('form');
    node.innerHTML = `
      <div class="form-grid">
        <label class="full">Title <input name="title" required value="${esc(existing?.title || '')}"></label>
        <label>ISBN <input name="isbn" required value="${esc(existing?.isbn || '')}"></label>
        <label>Year <input name="year" type="number" required value="${existing?.year || new Date().getFullYear()}"></label>
        <label>Genre <input name="genre" value="${esc(existing?.genre || '')}"></label>
        <label>Total copies <input name="totalCopies" type="number" min="1" required value="${existing?.totalCopies || 1}"></label>
        <label class="full">Authors
          <select name="authorIds" multiple size="5">
            ${authors.map(a => `<option value="${a.id}" ${existing?.authorIds.includes(a.id) ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="form-actions">
        <button type="button" id="bc">Cancel</button>
        ${existing ? `<button type="button" id="bd" class="danger">Delete</button>` : ''}
        <button class="primary" type="submit">${existing ? 'Save' : 'Add'}</button>
      </div>`;
    node.addEventListener('submit', ev => {
      ev.preventDefault();
      const fd = new FormData(node);
      const authorIds = Array.from(node.elements['authorIds'].selectedOptions).map(o => o.value);
      try {
        auth.requireAction('manage-books');
        const data = {
          id: existing?.id, isbn: fd.get('isbn'), title: fd.get('title'), year: fd.get('year'),
          authorIds, genre: fd.get('genre'), totalCopies: fd.get('totalCopies'),
          availableCopies: existing ? Math.min(Number(fd.get('totalCopies')), existing.availableCopies + (Number(fd.get('totalCopies')) - existing.totalCopies)) : undefined,
        };
        library.saveBook(data);
        Toast.success(existing ? 'Saved' : 'Added');
        Modal.close(); CatalogUI.render(); Dashboard.render();
      } catch (e) {
        if (e instanceof Ex.LibraryException) Toast.error(e.message); else throw e;
      }
    });
    Modal.open(node, existing ? `Edit "${existing.title}"` : 'New book');
    $('#bc').addEventListener('click', () => Modal.close());
    $('#bd')?.addEventListener('click', () => {
      if (!confirm('Delete this book?')) return;
      try { library.deleteBook(existing.id); Toast.success('Deleted'); Modal.close(); CatalogUI.render(); Dashboard.render(); }
      catch (e) { Toast.error(e.message); }
    });
  },
};

const UserForm = {
  open(existing = null) {
    const node = document.createElement('form');
    node.innerHTML = `
      <div class="form-grid">
        <label>Role
          <select name="role" ${existing ? 'disabled' : ''}>
            ${['ADMIN','LIBRARIAN','MEMBER'].map(r =>
              `<option value="${r}" ${existing?.getRole() === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </label>
        <label>Username <input name="username" required value="${esc(existing?.username || '')}" ${existing ? 'readonly' : ''}></label>
        <label class="full">Full name <input name="fullName" value="${esc(existing?.fullName || '')}"></label>
        <label class="full">E-mail <input name="email" type="email" value="${esc(existing?.email || '')}"></label>
        <label class="full">${existing ? 'New password (blank to keep)' : 'Password'}
          <input name="password" type="password" ${existing ? '' : 'required'} minlength="6">
        </label>
      </div>
      <div class="form-actions">
        <button type="button" id="uc">Cancel</button>
        <button class="primary" type="submit">${existing ? 'Save' : 'Create'}</button>
      </div>`;
    node.addEventListener('submit', ev => {
      ev.preventDefault();
      const fd = new FormData(node);
      try {
        if (existing) {
          existing.setFullName(fd.get('fullName') || existing.fullName);
          existing.setEmail(fd.get('email') || '');
          const pw = fd.get('password'); if (pw) existing.setPasswordHash(S.PasswordHasher.hash(pw));
          userDao.save(existing);
        } else {
          auth.register({ role: fd.get('role'), username: fd.get('username'), password: fd.get('password'),
            fullName: fd.get('fullName'), email: fd.get('email') });
        }
        Toast.success('Saved');
        Modal.close(); Dashboard.render();
      } catch (e) {
        if (e instanceof Ex.LibraryException) Toast.error(e.message); else throw e;
      }
    });
    Modal.open(node, existing ? `Edit ${existing.username}` : 'New user');
    $('#uc').addEventListener('click', () => Modal.close());
  },
};

/* ============ Dashboard ============ */
const Dashboard = {
  tab: 'overview',
  tabsForRole(role) {
    if (role === M.Role.ADMIN)     return ['overview','loans','books','users','reports','csv'];
    if (role === M.Role.LIBRARIAN) return ['overview','loans','books','reports'];
    return ['my-loans','my-fines'];
  },
  tabLabel(t) {
    return { overview:'Overview', loans:'Loans', books:'Books', users:'Users', reports:'Reports', csv:'CSV',
      'my-loans':'My loans', 'my-fines':'My fines' }[t] || t;
  },
  render() {
    const u = session.current;
    if (!u) { go('catalog'); return; }
    const tabs = this.tabsForRole(u.getRole());
    if (!tabs.includes(this.tab)) this.tab = tabs[0];
    $('#dash-header').innerHTML = `
      <div>
        <h1>${u.getRole()[0]}${u.getRole().slice(1).toLowerCase()} dashboard</h1>
        <p style="color:var(--ink-2);margin:.2rem 0 0">${esc(u.fullName || u.username)} — ${esc(u.describePermissions())}</p>
      </div>
      <div class="dash-tabs">
        ${tabs.map(t => `<button data-tab="${t}" class="${t === this.tab ? 'active' : ''}">${this.tabLabel(t)}</button>`).join('')}
      </div>`;
    $$('#dash-header .dash-tabs button').forEach(b =>
      b.addEventListener('click', () => { this.tab = b.dataset.tab; this.render(); }));
    const body = $('#dash-body');
    body.innerHTML = '';
    switch (this.tab) {
      case 'overview':  body.appendChild(this.viewOverview(u)); break;
      case 'loans':     body.appendChild(this.viewLoans(u)); break;
      case 'books':     body.appendChild(this.viewBooks(u)); break;
      case 'users':     body.appendChild(this.viewUsers(u)); break;
      case 'reports':   body.appendChild(this.viewReports(u)); break;
      case 'csv':       body.appendChild(this.viewCsv(u)); break;
      case 'my-loans':  body.appendChild(this.viewMyLoans(u)); break;
      case 'my-fines':  body.appendChild(this.viewMyFines(u)); break;
    }
  },

  viewOverview(u) {
    const s = library.stats();
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi"><div class="label">Titles</div><div class="value">${s.titles}</div></div>
        <div class="kpi"><div class="label">Copies</div><div class="value">${s.totalCopies}</div></div>
        <div class="kpi"><div class="label">Available</div><div class="value">${s.availCopies}</div></div>
        <div class="kpi"><div class="label">Active loans</div><div class="value">${s.activeLoans}</div></div>
        <div class="kpi"><div class="label">Overdue</div><div class="value">${s.overdueLoans}</div></div>
        <div class="kpi"><div class="label">Members</div><div class="value">${s.members}</div></div>
        <div class="kpi"><div class="label">Open fines</div><div class="value">$${s.openFinesAmount.toFixed(2)}</div></div>
      </div>`;
    return root;
  },

  viewLoans(u) {
    const root = document.createElement('div');
    root.className = 'section-card';
    const loans = loanDao.findAll().sort((a, b) => (a.returnDate ? 1 : 0) - (b.returnDate ? 1 : 0) || (b.loanDate.localeCompare(a.loanDate)));
    root.innerHTML = `
      <div class="toolbar">
        <input id="lf" type="search" placeholder="Filter by book title or member…">
        <span class="spacer"></span>
        <button class="primary" id="new-loan">+ New loan</button>
      </div>
      <div style="max-height:60vh; overflow:auto"><table class="data">
        <thead><tr><th>Book</th><th>Member</th><th>Loaned</th><th>Due</th><th>Returned</th><th>Status</th><th></th></tr></thead>
        <tbody id="lr"></tbody>
      </table></div>`;
    const renderRows = (filter = '') => {
      const tbody = root.querySelector('#lr');
      const q = filter.toLowerCase();
      const rows = loans.filter(l => {
        if (!q) return true;
        const b = bookDao.findById(l.bookId);
        const m = userDao.findById(l.memberId);
        return b.title.toLowerCase().includes(q) || (m.fullName || '').toLowerCase().includes(q) || m.username.includes(q);
      });
      tbody.innerHTML = rows.map(l => {
        let book, member;
        try { book = bookDao.findById(l.bookId); } catch { book = { title: '(deleted)' }; }
        try { member = userDao.findById(l.memberId); } catch { member = { username: '(deleted)' }; }
        const overdue = !l.isReturned() && l.daysOverdue() > 0;
        return `
          <tr data-id="${l.id}">
            <td>${esc(book.title)}</td>
            <td>${esc(member.fullName || member.username)}</td>
            <td>${fmtDate(l.loanDate)}</td>
            <td class="${overdue ? 'overdue' : ''}">${fmtDate(l.dueDate)}${overdue ? ` (${l.daysOverdue()}d)` : ''}</td>
            <td>${fmtDate(l.returnDate)}</td>
            <td>${l.isReturned() ? 'returned' : overdue ? '<span class="overdue">overdue</span>' : 'active'}</td>
            <td class="row-actions">
              ${!l.isReturned() ? `<button data-action="return">Mark returned</button>` : ''}
            </td>
          </tr>`;
      }).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--ink-2);padding:1.2rem">No loans.</td></tr>`;
      tbody.querySelectorAll('button[data-action="return"]').forEach(b =>
        b.addEventListener('click', ev => {
          const id = ev.currentTarget.closest('tr').dataset.id;
          try {
            const r = library.returnLoan(id);
            if (r.fine) Toast.success(`Returned. Fine $${r.fine.amount.toFixed(2)} (${r.overdueDays}d overdue).`);
            else Toast.success('Returned on time — no fine.');
            Dashboard.render(); CatalogUI.render();
          } catch (e) { Toast.error(e.message); }
        }));
    };
    renderRows();
    root.querySelector('#lf').addEventListener('input', e => renderRows(e.target.value));
    root.querySelector('#new-loan').addEventListener('click', () => Dashboard._openNewLoan());
    return root;
  },

  _openNewLoan() {
    const members = userDao.findAll().filter(u => u.getRole() === M.Role.MEMBER);
    const availableBooks = bookDao.findAll().filter(b => b.availableCopies > 0).sort((a, b) => a.title.localeCompare(b.title));
    const node = document.createElement('form');
    node.innerHTML = `
      <div class="form-grid">
        <label class="full">Book
          <select name="bookId" required>
            ${availableBooks.map(b => `<option value="${b.id}">${esc(b.title)} — ${b.availableCopies}/${b.totalCopies} avail.</option>`).join('')}
          </select>
        </label>
        <label class="full">Member
          <select name="memberId" required>
            ${members.map(m => `<option value="${m.id}">${esc(m.fullName || m.username)}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="form-actions">
        <button type="button" id="nlc">Cancel</button>
        <button class="primary" type="submit">Issue loan</button>
      </div>`;
    node.addEventListener('submit', ev => {
      ev.preventDefault();
      const fd = new FormData(node);
      try {
        auth.requireAction('manage-loans');
        const l = library.borrow(fd.get('bookId'), fd.get('memberId'));
        Toast.success(`Loan issued, due ${fmtDate(l.dueDate)}`);
        Modal.close(); Dashboard.render(); CatalogUI.render();
      } catch (e) { Toast.error(e.message); }
    });
    Modal.open(node, 'Issue a loan');
    $('#nlc').addEventListener('click', () => Modal.close());
  },

  viewBooks(u) {
    const root = document.createElement('div');
    root.className = 'section-card';
    const books = bookDao.findAll().sort((a, b) => a.title.localeCompare(b.title));
    root.innerHTML = `
      <div class="toolbar">
        <input id="bf" type="search" placeholder="Filter by title…">
        <span class="spacer"></span>
        <button class="primary" id="new-book">+ New book</button>
      </div>
      <div style="max-height:60vh; overflow:auto"><table class="data">
        <thead><tr><th>Title</th><th>Authors</th><th>Year</th><th>Genre</th><th>Copies</th><th></th></tr></thead>
        <tbody id="br"></tbody>
      </table></div>`;
    const renderRows = (filter = '') => {
      const tbody = root.querySelector('#br');
      const q = filter.toLowerCase();
      const rows = books.filter(b => !q || b.title.toLowerCase().includes(q));
      tbody.innerHTML = rows.map(b => `
        <tr data-id="${b.id}">
          <td>${esc(b.title)}</td>
          <td>${esc(authorNames(b))}</td>
          <td>${b.year}</td>
          <td>${esc(b.genre)}</td>
          <td>${b.availableCopies}/${b.totalCopies}</td>
          <td class="row-actions">
            <button data-action="edit">Edit</button>
          </td>
        </tr>`).join('');
      tbody.querySelectorAll('button[data-action="edit"]').forEach(btn =>
        btn.addEventListener('click', ev => {
          const id = ev.currentTarget.closest('tr').dataset.id;
          BookForm.open(bookDao.findById(id));
        }));
    };
    renderRows();
    root.querySelector('#bf').addEventListener('input', e => renderRows(e.target.value));
    root.querySelector('#new-book').addEventListener('click', () => BookForm.open());
    return root;
  },

  viewUsers(u) {
    const root = document.createElement('div');
    root.className = 'section-card';
    try { auth.requireAction('manage-users'); }
    catch (e) { root.innerHTML = `<p>${esc(e.message)}</p>`; return root; }
    const users = userDao.findAll().sort((a, b) => a.username.localeCompare(b.username));
    root.innerHTML = `
      <div class="toolbar">
        <span class="spacer"></span>
        <button class="primary" id="new-user">+ New user</button>
      </div>
      <table class="data">
        <thead><tr><th>Username</th><th>Role</th><th>Name</th><th>E-mail</th><th>Active</th><th></th></tr></thead>
        <tbody>${users.map(x => `
          <tr data-id="${x.id}">
            <td>${esc(x.username)}</td><td>${esc(x.getRole())}</td>
            <td>${esc(x.fullName)}</td><td>${esc(x.email)}</td>
            <td>${x.active ? 'Yes' : 'No'}</td>
            <td class="row-actions"><button data-action="edit">Edit</button></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    root.querySelector('#new-user').addEventListener('click', () => UserForm.open());
    root.querySelectorAll('tbody button').forEach(b =>
      b.addEventListener('click', ev => {
        const id = ev.currentTarget.closest('tr').dataset.id;
        UserForm.open(userDao.findById(id));
      }));
    return root;
  },

  viewReports(u) {
    const s = library.stats();
    const root = document.createElement('div');
    const bar = (data, title) => {
      const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
      const max = Math.max(1, ...entries.map(([, v]) => v));
      return `<h3 style="margin-top:1.4rem">${esc(title)}</h3>
        <div class="bar-chart">
        ${entries.map(([k, v]) => `<div class="bar-row">
          <span>${esc(k || '—')}</span>
          <span class="bar-bg"><span class="bar-fill" style="width:${(v/max)*100}%"></span></span>
          <span style="text-align:right">${v}</span>
        </div>`).join('')}
        </div>`;
    };
    const popular = s.topBooks.length === 0 ? '<p class="hint">No loans yet.</p>' :
      '<ol>' + s.topBooks.map(t => `<li>${esc(t.book.title)} — ${t.loanCount} loan${t.loanCount > 1 ? 's' : ''}</li>`).join('') + '</ol>';
    root.className = 'section-card';
    root.innerHTML = `
      <h3 style="margin-top:0">Library snapshot</h3>
      <div class="kpi-grid">
        <div class="kpi"><div class="label">Titles</div><div class="value">${s.titles}</div></div>
        <div class="kpi"><div class="label">Open fines</div><div class="value">$${s.openFinesAmount.toFixed(2)}</div></div>
        <div class="kpi"><div class="label">Overdue</div><div class="value">${s.overdueLoans}</div></div>
      </div>
      ${bar(s.byGenre, 'By genre')}
      <h3 style="margin-top:1.4rem">Most borrowed</h3>
      ${popular}`;
    return root;
  },

  viewCsv(u) {
    const root = document.createElement('div'); root.className = 'section-card';
    root.innerHTML = `
      <p>Export the catalogue or reset the demo data.</p>
      <div class="toolbar">
        <button id="ec">⇣ Export books.csv</button>
        <span class="spacer"></span>
        <button class="danger" id="rc">Reset demo data</button>
      </div>`;
    root.querySelector('#ec').addEventListener('click', () => {
      const am = new Map(authorDao.findAll().map(a => [a.id, a]));
      const csv = S.CsvService.exportBooks(bookDao.findAll(), am);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'books.csv';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
      Toast.success('Exported books.csv');
    });
    root.querySelector('#rc').addEventListener('click', () => {
      if (!confirm('Wipe ALL library data and re-seed?')) return;
      D.Storage.clear(); session.clear(); seed(); Header.refresh(); go('catalog');
      Toast.success('Reset.');
    });
    return root;
  },

  viewMyLoans(u) {
    const root = document.createElement('div'); root.className = 'section-card';
    const loans = loanDao.forMember(u.id).sort((a, b) => b.loanDate.localeCompare(a.loanDate));
    if (loans.length === 0) {
      root.innerHTML = `<p>You have no loans yet. Borrow a book from the <a href="#catalog" data-view="catalog">catalogue</a>.</p>`;
      return root;
    }
    root.innerHTML = `<table class="data">
      <thead><tr><th>Book</th><th>Loaned</th><th>Due</th><th>Returned</th><th>Status</th></tr></thead>
      <tbody>${loans.map(l => {
        let book; try { book = bookDao.findById(l.bookId); } catch { book = { title: '(deleted)' }; }
        const overdue = !l.isReturned() && l.daysOverdue() > 0;
        return `<tr>
          <td>${esc(book.title)}</td>
          <td>${fmtDate(l.loanDate)}</td>
          <td class="${overdue ? 'overdue' : ''}">${fmtDate(l.dueDate)}${overdue ? ` (${l.daysOverdue()}d)` : ''}</td>
          <td>${fmtDate(l.returnDate)}</td>
          <td>${l.isReturned() ? 'returned' : overdue ? '<span class="overdue">overdue</span>' : 'active'}</td>
        </tr>`;
      }).join('')}
      </tbody></table>`;
    return root;
  },

  viewMyFines(u) {
    const root = document.createElement('div'); root.className = 'section-card';
    const fines = fineDao.forMember(u.id, loanDao);
    if (fines.length === 0) {
      root.innerHTML = `<p>No fines on your account.</p>`; return root;
    }
    const total = fines.filter(f => !f.paid).reduce((s, f) => s + f.amount, 0);
    root.innerHTML = `
      <p>Total outstanding: <strong>$${total.toFixed(2)}</strong></p>
      <table class="data">
      <thead><tr><th>Book</th><th>Issued</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>${fines.map(f => {
        let book = { title: '(deleted)' };
        try { const l = loanDao.findById(f.loanId); book = bookDao.findById(l.bookId); } catch (_) {}
        return `<tr class="${f.paid ? 'fine-paid' : ''}">
          <td>${esc(book.title)}</td>
          <td>${fmtDate(f.createdAt)}</td>
          <td>$${f.amount.toFixed(2)}</td>
          <td>${f.paid ? 'Paid' : 'Open'}</td>
        </tr>`;
      }).join('')}
      </tbody></table>`;
    return root;
  },
};

/* ============ Bootstrap ============ */
function bind() {
  document.body.addEventListener('click', ev => {
    const a = ev.target.closest('[data-view]');
    if (a && a.tagName === 'A') { ev.preventDefault(); go(a.dataset.view); }
  });
  $('#login-btn').addEventListener('click', () => LoginUI.open());
  $('#logout-btn').addEventListener('click', () => { auth.logout(); Header.refresh(); go('catalog'); Toast.success('Signed out'); });
  $('#modal-close').addEventListener('click', () => Modal.close());
  $('#modal-root .modal-backdrop').addEventListener('click', () => Modal.close());
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal-root').hidden) Modal.close(); });
  ['f-search','f-status','f-sort'].forEach(id => $('#'+id).addEventListener('input', () => CatalogUI.render()));
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    bind();
    Header.refresh();
    const initial = (location.hash || '#catalog').slice(1);
    Router.current = initial;
    go(['catalog','about','dashboard'].includes(initial) ? initial : 'catalog');
    window.addEventListener('hashchange', () => {
      const v = (location.hash || '#catalog').slice(1);
      Router.current = v;
      if (['catalog','about','dashboard'].includes(v)) go(v);
    });
  } catch (e) {
    console.error(e);
    Toast.error('Failed to start: ' + e.message);
  }
});
})();
