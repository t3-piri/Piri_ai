/* Piri - yonetim paneli (dashboard kabugu + rol bazli yetki) */

const toastEl = document.getElementById('toast');
const loginWrap = document.getElementById('loginWrap');
const pwInput = document.getElementById('pw');
const userInput = document.getElementById('loginUser');

const TABS = ['overview', 'sources', 'knowledge', 'users'];
const TAB_TITLES = {
  overview: 'Genel Bakış',
  sources: 'Kaynak Havuzu',
  knowledge: 'Bilgi Güncelleme',
  users: 'Kullanıcılar ve Roller'
};

let token = sessionStorage.getItem('piri_admin_token') || null;
let me = null;
let allDocs = [];
let docStats = null;
let qStats = null;
let qList = [];
let sssList = [];
let competitionList = [];
let usersData = null;
let activeTab = 'overview';

/* ---------------------------------------------------------------- yardimci */

function toast(msg, kind = '') {
  toastEl.textContent = msg;
  toastEl.className = 'toast show ' + kind;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toastEl.className = 'toast ' + kind; }, 4200);
}

async function api(path, options = {}) {
  const opts = { ...options, headers: { ...(options.headers || {}) } };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(path, opts);
  if (res.status === 401) {
    token = null;
    sessionStorage.removeItem('piri_admin_token');
    showLogin();
    throw new Error('Oturum sona erdi, tekrar giriş yapın.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Sunucu hatası (${res.status})`);
  }
  return res.json();
}

async function apiJson(path, body) {
  return api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

const nf = n => Number(n).toLocaleString('tr');
const can = p => !!me && me.permissions.includes(p);

function initials(name) {
  const parts = (name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toLocaleUpperCase('tr') || '?';
}

/* ------------------------------------------------------------------ giris */

function showLogin() {
  me = null;
  loginWrap.hidden = false;
  userInput.focus();
}

async function showPanel() {
  loginWrap.hidden = true;
  try {
    const data = await api('/api/admin/me');
    me = data.user;
  } catch (e) {
    toast(e.message, 'err');
    return;
  }
  applyIdentity();
  applyPermissions();
  loadCompetitions();
  if (can('sources.view')) loadDocuments();
  if (can('questions.view')) loadUnanswered();
  if (can('users.view')) loadUsers();
}

function applyIdentity() {
  document.getElementById('sideName').textContent = me.display_name;
  document.getElementById('sideRole').textContent = me.role_label;
  document.getElementById('menuName').textContent = me.display_name;
  document.getElementById('menuRole').textContent = me.role_label + ' · @' + me.username;
  const av = initials(me.display_name);
  document.getElementById('sideAvatar').firstChild.textContent = av;
  document.getElementById('topAvatar').textContent = av;
}

/** Yetkisi olmayan bolumleri menuden ve sayfadan tamamen kaldirir. */
function applyPermissions() {
  document.querySelectorAll('.dash-nav-item[data-perm]').forEach(btn => {
    btn.hidden = !can(btn.dataset.perm);
  });
  document.querySelectorAll('.dash-sublinks button[data-jump]').forEach(btn => {
    const nav = document.querySelector(`.dash-nav-item[data-tab="${btn.dataset.jump}"]`);
    btn.hidden = !!nav && nav.hidden;
  });
  document.getElementById('uploadBlock').hidden = !can('sources.upload');
  document.getElementById('newUserBlock').hidden = !can('users.manage');
  document.getElementById('globalSearch').hidden = !can('sources.view');
  document.getElementById('docsBtn').hidden = !can('sources.view');
  document.getElementById('bellBtn').hidden = !can('questions.view');

  const current = document.querySelector(`.dash-nav-item[data-tab="${activeTab}"]`);
  activateTab(current && !current.hidden ? activeTab : 'overview');
}

document.getElementById('loginBtn').addEventListener('click', doLogin);
for (const el of [userInput, pwInput]) {
  el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

async function doLogin() {
  const username = userInput.value.trim();
  const password = pwInput.value;
  if (!username || !password) { toast('Kullanıcı adı ve şifre girin.', 'err'); return; }
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Giriş başarısız.');
    }
    const data = await res.json();
    token = data.token;
    sessionStorage.setItem('piri_admin_token', token);
    pwInput.value = '';
    toast(`Hoş geldiniz, ${data.user.display_name} (${data.user.role_label}).`, 'ok');
    showPanel();
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function logout() {
  closeAccountMenu();
  try { await api('/api/admin/logout', { method: 'POST' }); } catch { /* zaten dusmus */ }
  token = null;
  sessionStorage.removeItem('piri_admin_token');
  showLogin();
  toast('Oturum kapatıldı.');
}

document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('menuLogout').addEventListener('click', logout);

/* -------------------------------------------------------- kabuk: menu/topbar */

const body = document.body;
const burger = document.getElementById('burger');
const scrim = document.getElementById('navScrim');

// Dar ekranda menu varsayilan olarak kapali baslar.
if (window.innerWidth <= 1080) body.classList.remove('nav-open');

burger.addEventListener('click', () => body.classList.toggle('nav-open'));
scrim.addEventListener('click', () => body.classList.remove('nav-open'));

const accountBtn = document.getElementById('accountBtn');
const accountMenu = document.getElementById('accountMenu');

function closeAccountMenu() { accountMenu.hidden = true; }

accountBtn.addEventListener('click', e => {
  e.stopPropagation();
  accountMenu.hidden = !accountMenu.hidden;
});

document.addEventListener('click', e => {
  if (!accountMenu.hidden && !accountMenu.contains(e.target)) closeAccountMenu();
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAccountMenu(); });

/* ------------------------------------------------------------- sekme gecisi */

function activateTab(name) {
  if (!TABS.includes(name)) return;
  activeTab = name;
  document.querySelectorAll('.dash-nav-item[data-tab]').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  for (const tab of TABS) {
    document.getElementById('tab-' + tab).hidden = (tab !== name);
  }
  document.getElementById('pageTitle').textContent = TAB_TITLES[name];
  if (window.innerWidth <= 1080) body.classList.remove('nav-open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.dash-nav-item[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

document.querySelectorAll('.dash-sublinks button[data-jump]').forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.jump));
});

document.getElementById('bellBtn').addEventListener('click', () => activateTab('knowledge'));
document.getElementById('docsBtn').addEventListener('click', () => activateTab('sources'));

function refreshAll() {
  closeAccountMenu();
  if (can('sources.view')) loadDocuments();
  if (can('questions.view')) loadUnanswered();
  if (can('users.view')) loadUsers();
  toast('Veriler yenilendi.');
}

document.getElementById('refreshBtn').addEventListener('click', refreshAll);
document.getElementById('headRefresh').addEventListener('click', refreshAll);

const globalSearch = document.getElementById('globalSearch');
globalSearch.addEventListener('input', () => {
  document.getElementById('filter').value = globalSearch.value;
  if (activeTab !== 'sources') activateTab('sources');
  renderDocs();
});

/* --------------------------------------------------------- metrik seritleri */

const ICONS = {
  docs: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  check: '<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="M22 4 12 14.1l-3-3"/>',
  archive: '<rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'
};

function metric(tone, num, label, note, icon) {
  return `<div class="metric ${tone}">
    <div class="metric-body">
      <div class="metric-num">${num}</div>
      <div class="metric-lbl">${label}</div>
      <div class="metric-note">${note}</div>
    </div>
    <div class="metric-ic">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
           stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
    </div>
  </div>`;
}

function updateBadges() {
  const bell = document.getElementById('bellBadge');
  const docs = document.getElementById('docsBadge');
  if (qStats) {
    bell.textContent = qStats.unanswered;
    bell.hidden = qStats.unanswered === 0;
  }
  if (docStats) {
    docs.textContent = docStats.active;
    docs.hidden = docStats.active === 0;
  }
}

/* --------------------------------------------------------------- kaynaklar */

async function loadDocuments() {
  const area = document.getElementById('docsArea');
  try {
    const data = await api('/api/admin/documents');
    allDocs = data.documents;
    docStats = data.stats;

    const pct = docStats.total ? Math.round((docStats.active / docStats.total) * 100) : 0;
    const perDoc = docStats.active ? Math.round(docStats.chunks / docStats.active) : 0;

    document.getElementById('srcStats').innerHTML =
      metric('m-navy', nf(docStats.total), 'Toplam Kayıt', 'Tüm sürümler dahil', ICONS.docs) +
      metric('m-ok', nf(docStats.active), 'Aktif Sürüm', `Havuzun %${pct}'i aramada`, ICONS.check) +
      metric('m-warn', nf(docStats.inactive), 'Pasif Sürüm', 'Arşivde saklanıyor', ICONS.archive) +
      metric('m-red', nf(docStats.chunks), 'Vektör Parça', `Belge başına ~${perDoc} parça`, ICONS.chip);

    renderDocs();
    renderOverview();
    updateBadges();
  } catch (e) {
    area.innerHTML = `<div class="empty-box">${e.message}</div>`;
  }
}

/* Belgeler yarismaya gore gruplanir; genel kaynaklar (SSS / Genel ve Etik
   Kurallar) listenin basinda gosterilir. Acik gruplar yeniden cizimler
   arasinda korunur. */
const openGroups = new Set();

function groupDocs(docs) {
  const map = new Map();
  for (const d of docs) {
    const key = d.competition || 'Belirtilmemiş';
    if (!map.has(key)) map.set(key, { name: key, category: d.category, docs: [] });
    map.get(key).docs.push(d);
  }
  return [...map.values()].sort((a, b) => {
    const ga = a.category === 'general' ? 0 : 1;
    const gb = b.category === 'general' ? 0 : 1;
    if (ga !== gb) return ga - gb;
    return a.name.localeCompare(b.name, 'tr');
  });
}

function buildDocTable(docs) {
  const table = document.createElement('table');
  table.innerHTML = `<thead><tr>
    <th>BELGE</th><th>SÜRÜM</th><th>DURUM</th><th>YÜKLENME</th><th></th>
  </tr></thead>`;

  const tbody = document.createElement('tbody');
  const sorted = [...docs].sort((a, b) => a.file_name.localeCompare(b.file_name, 'tr'));

  for (const d of sorted) {
    const tr = document.createElement('tr');

    const tdFile = document.createElement('td');
    const nameDiv = document.createElement('div');
    nameDiv.className = 'cell-file';
    nameDiv.textContent = d.file_name;
    nameDiv.title = d.file_name;
    tdFile.appendChild(nameDiv);

    const tdVer = document.createElement('td');
    tdVer.innerHTML = `<span class="pill pill-version">v${d.version}</span>`;

    const tdStatus = document.createElement('td');
    tdStatus.innerHTML = d.status === 'active'
      ? '<span class="pill pill-active">AKTİF</span>'
      : '<span class="pill pill-inactive">PASİF</span>';

    const tdDate = document.createElement('td');
    tdDate.textContent = d.upload_date;

    const tdAct = document.createElement('td');
    if (can('sources.status')) {
      const toggle = document.createElement('button');
      toggle.className = 'btn-sm';
      toggle.textContent = d.status === 'active' ? 'Pasife al' : 'Aktifleştir';
      toggle.onclick = async () => {
        toggle.disabled = true;
        const next = d.status === 'active' ? 'inactive' : 'active';
        try {
          const r = await apiJson('/api/admin/documents/status', {
            document_id: d.document_id, version: d.version, status: next
          });
          toast(`${d.file_name} → ${next === 'active' ? 'aktif' : 'pasif'} (${r.updated_chunks} parça)`, 'ok');
          loadDocuments();
        } catch (e) {
          toast(e.message, 'err');
          toggle.disabled = false;
        }
      };
      tdAct.appendChild(toggle);
    }
    if (can('sources.delete')) {
      const del = document.createElement('button');
      del.className = 'btn-sm danger';
      del.textContent = 'Sil';
      del.style.marginLeft = '6px';
      del.onclick = async () => {
        if (!confirm(`"${d.file_name}" kalıcı olarak silinsin mi?\n\nDosya diskten, tüm sürümleri vektör veritabanından kaldırılır. Bu işlem geri alınamaz — yalnızca aramadan çıkarmak istiyorsanız "Pasife al" kullanın.`)) return;
        del.disabled = true;
        try {
          await apiJson('/api/admin/documents/delete', { document_id: d.document_id });
          toast(`${d.file_name} silindi.`, 'ok');
          loadDocuments();
        } catch (e) {
          toast(e.message, 'err');
          del.disabled = false;
        }
      };
      tdAct.appendChild(del);
    }

    tr.append(tdFile, tdVer, tdStatus, tdDate, tdAct);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  wrap.appendChild(table);
  return wrap;
}

const GROUP_ICON_GENERAL = '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>';
const GROUP_ICON_COMP = '<path d="M3 3h18v5a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z"/><path d="M8 21h8M12 13v8"/>';

function renderDocs() {
  const area = document.getElementById('docsArea');
  const q = document.getElementById('filter').value.trim().toLocaleLowerCase('tr');
  const docs = allDocs.filter(d =>
    !q ||
    d.file_name.toLocaleLowerCase('tr').includes(q) ||
    (d.competition || '').toLocaleLowerCase('tr').includes(q)
  );

  area.innerHTML = '';

  if (!docs.length) {
    area.innerHTML = '<div class="empty-box">Eşleşen kayıt yok.</div>';
    return;
  }

  const groups = groupDocs(docs);
  if (q) for (const g of groups) openGroups.add(g.name);

  const toolbar = document.createElement('div');
  toolbar.className = 'group-toolbar';
  const openAll = document.createElement('button');
  openAll.type = 'button';
  openAll.textContent = 'Tümünü aç';
  openAll.onclick = () => { for (const g of groups) openGroups.add(g.name); renderDocs(); };
  const closeAll = document.createElement('button');
  closeAll.type = 'button';
  closeAll.textContent = 'Tümünü kapat';
  closeAll.onclick = () => { openGroups.clear(); renderDocs(); };
  const sep = document.createElement('span');
  sep.className = 'sep';
  sep.textContent = '|';
  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = `${groups.length} grup · ${docs.length} belge`;
  toolbar.append(openAll, sep, closeAll, count);
  area.appendChild(toolbar);

  for (const g of groups) {
    const isGeneral = g.category === 'general';
    const active = g.docs.filter(d => d.status === 'active').length;
    const passive = g.docs.length - active;

    const box = document.createElement('div');
    box.className = 'group';

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'group-head';
    head.innerHTML = `
      <svg class="group-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
      <span class="group-icon${isGeneral ? ' gen' : ''}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${isGeneral ? GROUP_ICON_GENERAL : GROUP_ICON_COMP}</svg>
      </span>`;

    const title = document.createElement('div');
    title.className = 'group-title';
    const name = document.createElement('div');
    name.className = 'group-name';
    name.textContent = g.name;
    name.title = g.name;
    const sub = document.createElement('div');
    sub.className = 'group-sub';
    sub.textContent = `${g.docs.length} belge · ${isGeneral ? 'Genel kaynak' : 'Yarışmaya özel'}`;
    title.append(name, sub);

    const counts = document.createElement('div');
    counts.className = 'group-counts';
    counts.innerHTML =
      `<span class="pill pill-active">${active} AKTİF</span>` +
      (passive ? `<span class="pill pill-inactive">${passive} PASİF</span>` : '');

    head.append(title, counts);

    const bodyBox = document.createElement('div');
    bodyBox.className = 'group-body';
    bodyBox.hidden = true;

    const fill = () => {
      if (!bodyBox.dataset.filled) {
        bodyBox.appendChild(buildDocTable(g.docs));
        bodyBox.dataset.filled = '1';
      }
    };

    if (openGroups.has(g.name)) {
      box.classList.add('open');
      bodyBox.hidden = false;
      fill();
    }

    head.onclick = () => {
      const nowOpen = !box.classList.contains('open');
      box.classList.toggle('open', nowOpen);
      bodyBox.hidden = !nowOpen;
      if (nowOpen) { openGroups.add(g.name); fill(); } else { openGroups.delete(g.name); }
    };

    box.append(head, bodyBox);
    area.appendChild(box);
  }
}

document.getElementById('filter').addEventListener('input', renderDocs);

/* ------------------------------------------------------------- genel bakis */

function questionNode(e, withForm) {
  const item = document.createElement('div');
  item.className = 'q-item';

  const text = document.createElement('div');
  text.className = 'q-text';
  text.textContent = e.question;

  const meta = document.createElement('div');
  meta.className = 'q-meta';
  const parts = [e.timestamp, e.competition || 'Bağlam yok'];
  if (e.top_score != null) parts.push('En yakın skor: ' + e.top_score);
  for (const p of parts) {
    const s = document.createElement('span');
    s.textContent = p;
    meta.appendChild(s);
  }

  item.append(text, meta);
  if (withForm && can('questions.answer')) item.appendChild(answerBlock(e));
  return item;
}

/** "Yanıtla" düğmesi + cevabı SSS olarak modele işleyen form. */
function answerBlock(e) {
  const wrap = document.createElement('div');

  const actions = document.createElement('div');
  actions.className = 'q-actions';
  const openBtn = document.createElement('button');
  openBtn.className = 'btn-sm';
  openBtn.textContent = 'Yanıtla ve bilgi tabanına ekle';
  actions.appendChild(openBtn);

  const form = document.createElement('div');
  form.className = 'answer-form';
  form.hidden = true;

  const ta = document.createElement('textarea');
  ta.placeholder = 'Doğrulanmış, kısa bir cevap yazın. Bu metin kaynak olarak kaydedilecek ve model bundan sonra bu soruyu buna dayanarak yanıtlayacak.';

  const row = document.createElement('div');
  row.className = 'row';

  const sel = document.createElement('select');
  const optGeneral = document.createElement('option');
  optGeneral.value = '';
  optGeneral.textContent = 'Genel Kurallar / SSS (tüm yarışmalar)';
  sel.appendChild(optGeneral);
  for (const c of competitionList) {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = c;
    sel.appendChild(o);
  }
  if (e.competition && competitionList.includes(e.competition)) sel.value = e.competition;

  const save = document.createElement('button');
  save.className = 'btn-red';
  save.textContent = 'KAYDET VE İŞLE';

  const cancel = document.createElement('button');
  cancel.className = 'btn-sm';
  cancel.textContent = 'Vazgeç';

  row.append(sel, save, cancel);
  form.append(ta, row);

  openBtn.onclick = () => {
    form.hidden = !form.hidden;
    openBtn.textContent = form.hidden ? 'Yanıtla ve bilgi tabanına ekle' : 'Formu kapat';
    if (!form.hidden) ta.focus();
  };
  cancel.onclick = () => { form.hidden = true; openBtn.textContent = 'Yanıtla ve bilgi tabanına ekle'; };

  save.onclick = async () => {
    const answer = ta.value.trim();
    if (!answer) { toast('Cevap boş olamaz.', 'err'); return; }
    save.disabled = true;
    save.textContent = 'İŞLENİYOR…';
    try {
      const r = await apiJson('/api/admin/questions/answer', {
        question: e.question, answer, competition: sel.value || null
      });
      toast(`Cevap kaydedildi ve modele işlendi (${r.indexed_chunks} parça).`, 'ok');
      loadUnanswered();
      loadDocuments();
    } catch (err) {
      toast(err.message, 'err');
      save.disabled = false;
      save.textContent = 'KAYDET VE İŞLE';
    }
  };

  wrap.append(actions, form);
  return wrap;
}

function renderOverview() {
  const strip = document.getElementById('ovStats');
  if (docStats || qStats) {
    strip.innerHTML =
      (docStats
        ? metric('m-navy', nf(docStats.total), 'Toplam Kayıt', 'Kaynak havuzundaki belge', ICONS.docs) +
          metric('m-ok', nf(docStats.active), 'Aktif Sürüm', 'Aramaya dahil edilen', ICONS.check) +
          metric('m-red', nf(docStats.chunks), 'Vektör Parça', 'Chroma koleksiyonunda', ICONS.chip)
        : '') +
      (qStats
        ? metric('m-warn', nf(qStats.unanswered), 'Bekleyen Soru',
            `${nf(qStats.resolved)} soru yanıtlanıp işlendi`, ICONS.alert)
        : '');
  }

  // Yarismaya gore aktif belge dagilimi
  const barsArea = document.getElementById('ovBars');
  if (allDocs.length) {
    const counts = new Map();
    for (const d of allDocs) {
      if (d.status !== 'active') continue;
      const key = d.competition || 'Belirtilmemiş';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const max = top.length ? top[0][1] : 1;

    barsArea.innerHTML = '';
    for (const [name, count] of top) {
      const row = document.createElement('div');
      row.className = 'bar-row';

      const left = document.createElement('div');
      const label = document.createElement('div');
      label.className = 'bar-name';
      label.textContent = name;
      label.title = name;
      const track = document.createElement('div');
      track.className = 'bar-track';
      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      fill.style.width = Math.round((count / max) * 100) + '%';
      track.appendChild(fill);
      left.append(label, track);

      const val = document.createElement('div');
      val.className = 'bar-val';
      val.textContent = count;

      row.append(left, val);
      barsArea.appendChild(row);
    }
    if (!top.length) barsArea.innerHTML = '<div class="empty-box">Aktif kaynak yok.</div>';
  } else if (!can('sources.view')) {
    barsArea.innerHTML = '<div class="empty-box">Bu bölüm için yetkiniz yok.</div>';
  }

  // Bekleyen sorular ozeti
  const qArea = document.getElementById('ovQuestions');
  if (!can('questions.view')) {
    qArea.innerHTML = '<div class="empty-box">Bu bölüm için yetkiniz yok.</div>';
  } else if (qStats) {
    qArea.innerHTML = '';
    if (!qList.length) {
      qArea.innerHTML = '<div class="empty-box">Bekleyen soru yok. 🎉</div>';
    } else {
      for (const e of qList.slice(0, 4)) qArea.appendChild(questionNode(e, false));
      const more = document.createElement('button');
      more.className = 'btn-sm';
      more.textContent = qList.length > 4 ? `Tümünü gör ve yanıtla (${qList.length})` : 'Yanıtla';
      more.onclick = () => activateTab('knowledge');
      qArea.appendChild(more);
    }
  }
}

/* ------------------------------------------------- bilgi guncelleme sekmesi */

async function loadCompetitions() {
  const sel = document.getElementById('compSelect');
  try {
    const res = await fetch('/api/competitions');
    const data = await res.json();
    competitionList = data.competitions;
    sel.innerHTML = '<option value="">— Yarışma seçin —</option>';
    for (const c of competitionList) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      sel.appendChild(opt);
    }
  } catch {
    sel.innerHTML = '<option value="">Yüklenemedi</option>';
  }
}

document.getElementById('uploadBtn').addEventListener('click', async () => {
  const btn = document.getElementById('uploadBtn');
  const competition = document.getElementById('compSelect').value;
  const fileInput = document.getElementById('fileInput');
  const result = document.getElementById('uploadResult');

  if (!competition) { toast('Yarışma seçin.', 'err'); return; }
  if (!fileInput.files.length) { toast('Dosya seçin.', 'err'); return; }

  const fd = new FormData();
  fd.append('competition', competition);
  fd.append('file', fileInput.files[0]);

  btn.disabled = true;
  btn.textContent = 'İŞLENİYOR…';
  result.innerHTML = '<div class="loading-box">Belge ayrıştırılıyor, parçalanıyor ve GPU üzerinde embedleniyor…</div>';

  try {
    const data = await api('/api/admin/upload', { method: 'POST', body: fd });
    result.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'q-item done';
    const t = document.createElement('div');
    t.className = 'q-text';
    t.textContent = `${data.is_update ? 'Güncellendi' : 'Yüklendi'}: ${data.file}`;
    const m = document.createElement('div');
    m.className = 'q-meta';
    const bits = [`Sürüm: v${data.version}`, `Yeni parça: ${data.chunks}`, data.competition];
    if (data.deactivated_chunks) bits.splice(2, 0, `Pasife alınan: ${data.deactivated_chunks}`);
    for (const b of bits) {
      const s = document.createElement('span');
      s.textContent = b;
      m.appendChild(s);
    }
    box.append(t, m);
    result.appendChild(box);
    toast('Belge işlendi ve aramaya dahil edildi.', 'ok');
    fileInput.value = '';
    loadDocuments();
  } catch (e) {
    result.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'q-item';
    box.style.borderLeftColor = 'var(--red)';
    const t = document.createElement('div');
    t.className = 'q-text';
    t.textContent = 'Yükleme başarısız';
    const m = document.createElement('div');
    m.className = 'q-meta';
    m.textContent = e.message;
    box.append(t, m);
    result.appendChild(box);
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'YÜKLE VE İŞLE';
  }
});

async function loadUnanswered() {
  const area = document.getElementById('qArea');
  try {
    const data = await api('/api/admin/unanswered');
    qStats = data.stats;
    qList = data.unanswered;
    sssList = data.sss_entries;

    const rate = qStats.total_questions
      ? Math.round((qStats.answered / qStats.total_questions) * 100)
      : 0;

    document.getElementById('qStats').innerHTML =
      metric('m-navy', nf(qStats.total_questions), 'Toplam Soru', 'Kayıtlı tüm sorgular', ICONS.chat) +
      metric('m-ok', nf(qStats.answered), 'Kaynaktan Yanıtlanan', `Yanıtlama oranı %${rate}`, ICONS.check) +
      metric('m-warn', nf(qStats.unanswered), 'Bekleyen', 'Cevap yazılmayı bekliyor', ICONS.alert) +
      metric('m-red', nf(qStats.resolved), 'Modele İşlenen', 'Panelden eklenen SSS kaydı', ICONS.chip);

    area.innerHTML = '';
    if (!qList.length) {
      area.innerHTML = '<div class="empty-box">Bekleyen soru yok. 🎉</div>';
    } else {
      for (const e of qList) area.appendChild(questionNode(e, true));
    }

    renderSssEntries();
    renderOverview();
    updateBadges();
  } catch (e) {
    area.innerHTML = `<div class="empty-box">${e.message}</div>`;
  }
}

function renderSssEntries() {
  const area = document.getElementById('sssArea');
  area.innerHTML = '';
  if (!sssList.length) {
    area.innerHTML = '<div class="empty-box">Henüz panelden eklenmiş SSS kaydı yok.</div>';
    return;
  }
  for (const e of sssList) {
    const item = document.createElement('div');
    item.className = 'q-item done';

    const t = document.createElement('div');
    t.className = 'q-text';
    t.textContent = e.question;

    const a = document.createElement('div');
    a.className = 'q-answer';
    a.textContent = e.answer;

    const m = document.createElement('div');
    m.className = 'q-meta';
    for (const p of [e.timestamp, e.competition, e.locator, 'Ekleyen: @' + (e.author || '—')]) {
      const s = document.createElement('span');
      s.textContent = p;
      m.appendChild(s);
    }

    item.append(t, a, m);
    area.appendChild(item);
  }
}

/* -------------------------------------------------- kullanicilar ve roller */

async function loadUsers() {
  const area = document.getElementById('usersArea');
  try {
    usersData = await api('/api/admin/users');
    renderRoleCards();
    renderUsers();
    fillRoleSelect();
    document.getElementById('usersSub').textContent = usersData.can_manage
      ? 'Sistemde tanımlı yönetim hesapları. Rolü değiştirmek anında geçerli olur.'
      : 'Sistemde tanımlı yönetim hesapları. Değişiklik için sahip yetkisi gerekir.';
  } catch (e) {
    area.innerHTML = `<div class="empty-box">${e.message}</div>`;
  }
}

function renderRoleCards() {
  const box = document.getElementById('roleCards');
  box.innerHTML = '';
  for (const r of usersData.roles) {
    const card = document.createElement('div');
    card.className = 'role-card' + (r.assignable ? '' : ' owner');

    const h = document.createElement('h4');
    h.textContent = r.label + (r.assignable ? '' : ' · tek kişi');
    const p = document.createElement('p');
    p.textContent = r.description;

    const perms = document.createElement('div');
    perms.className = 'perm-list';
    for (const perm of r.permissions) {
      const s = document.createElement('span');
      s.className = 'perm';
      s.textContent = perm;
      perms.appendChild(s);
    }

    card.append(h, p, perms);
    box.appendChild(card);
  }
}

function fillRoleSelect() {
  const sel = document.getElementById('nuRole');
  sel.innerHTML = '';
  for (const r of usersData.roles.filter(r => r.assignable)) {
    const o = document.createElement('option');
    o.value = r.key;
    o.textContent = r.label;
    sel.appendChild(o);
  }
}

function renderUsers() {
  const area = document.getElementById('usersArea');
  const table = document.createElement('table');
  table.innerHTML = `<thead><tr>
    <th>KULLANICI</th><th>ROL</th><th>OLUŞTURMA</th><th>SON GİRİŞ</th><th></th>
  </tr></thead>`;

  const tbody = document.createElement('tbody');
  for (const u of usersData.users) {
    const isOwner = u.role === 'sahip';
    const isSelf = u.username === me.username;
    const tr = document.createElement('tr');

    const tdUser = document.createElement('td');
    const nm = document.createElement('div');
    nm.className = 'cell-file';
    nm.textContent = u.display_name + (isSelf ? ' (siz)' : '');
    const sub = document.createElement('div');
    sub.className = 'cell-sub';
    sub.textContent = '@' + u.username + (u.created_by ? ' · ekleyen @' + u.created_by : '');
    tdUser.append(nm, sub);

    const tdRole = document.createElement('td');
    if (usersData.can_manage && !isOwner && !isSelf) {
      const sel = document.createElement('select');
      sel.className = 'role-select';
      for (const r of usersData.roles.filter(r => r.assignable)) {
        const o = document.createElement('option');
        o.value = r.key;
        o.textContent = r.label;
        sel.appendChild(o);
      }
      sel.value = u.role;
      sel.onchange = async () => {
        sel.disabled = true;
        try {
          await apiJson('/api/admin/users/role', { username: u.username, role: sel.value });
          toast(`@${u.username} rolü güncellendi.`, 'ok');
          loadUsers();
        } catch (e) {
          toast(e.message, 'err');
          sel.value = u.role;
          sel.disabled = false;
        }
      };
      tdRole.appendChild(sel);
    } else {
      tdRole.innerHTML = `<span class="pill ${isOwner ? 'pill-owner' : 'pill-role'}">${u.role_label.toLocaleUpperCase('tr')}</span>`;
    }

    const tdCreated = document.createElement('td');
    tdCreated.textContent = u.created_at;

    const tdLogin = document.createElement('td');
    tdLogin.textContent = u.last_login || '—';

    const tdAct = document.createElement('td');
    if (usersData.can_manage && !isSelf) {
      if (!isOwner) {
        const pwBtn = document.createElement('button');
        pwBtn.className = 'btn-sm';
        pwBtn.textContent = 'Şifre';
        pwBtn.onclick = async () => {
          const np = prompt(`@${u.username} için yeni şifre (en az 4 karakter):`);
          if (!np) return;
          try {
            await apiJson('/api/admin/users/password', { username: u.username, password: np });
            toast('Şifre güncellendi.', 'ok');
          } catch (e) { toast(e.message, 'err'); }
        };

        const delBtn = document.createElement('button');
        delBtn.className = 'btn-sm danger';
        delBtn.textContent = 'Sil';
        delBtn.style.marginLeft = '6px';
        delBtn.onclick = async () => {
          if (!confirm(`@${u.username} hesabı silinsin mi?`)) return;
          try {
            await apiJson('/api/admin/users/delete', { username: u.username });
            toast('Hesap silindi.', 'ok');
            loadUsers();
          } catch (e) { toast(e.message, 'err'); }
        };
        tdAct.append(pwBtn, delBtn);

        if (usersData.is_owner) {
          const trBtn = document.createElement('button');
          trBtn.className = 'btn-sm';
          trBtn.textContent = 'Sahipliği devret';
          trBtn.style.marginLeft = '6px';
          trBtn.onclick = async () => {
            if (!confirm(`Sahiplik @${u.username} hesabına devredilsin mi? Siz "Yönetici" rolüne düşeceksiniz.`)) return;
            try {
              await apiJson('/api/admin/users/transfer', { username: u.username });
              toast('Sahiplik devredildi.', 'ok');
              showPanel();
            } catch (e) { toast(e.message, 'err'); }
          };
          tdAct.appendChild(trBtn);
        }
      }
    }

    tr.append(tdUser, tdRole, tdCreated, tdLogin, tdAct);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  wrap.appendChild(table);
  area.innerHTML = '';
  area.appendChild(wrap);
}

document.getElementById('createUserBtn').addEventListener('click', async () => {
  const btn = document.getElementById('createUserBtn');
  const username = document.getElementById('nuUsername').value.trim();
  const display_name = document.getElementById('nuDisplay').value.trim();
  const password = document.getElementById('nuPassword').value;
  const role = document.getElementById('nuRole').value;

  if (!username || !password) { toast('Kullanıcı adı ve şifre zorunlu.', 'err'); return; }

  btn.disabled = true;
  try {
    await apiJson('/api/admin/users', { username, password, role, display_name: display_name || null });
    toast(`@${username} oluşturuldu.`, 'ok');
    document.getElementById('nuUsername').value = '';
    document.getElementById('nuDisplay').value = '';
    document.getElementById('nuPassword').value = '';
    loadUsers();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
  }
});

/* ------------------------------------------------------------------ baslat */

if (token) showPanel(); else showLogin();
