/* Piri - yarismaci sohbet arayuzu (giris gerektirmez).

   Ekran her zaman sohbet ekranidir. Yarisma secimi ZORUNLU DEGILDIR:
   - Kullanici sorusunda bir yarisma adi gecerse sunucu dogrudan o yarismanin
     kaynaklarinda arar (genel kurallara gore degil).
   - Isterse composer'in ustundeki cubuktan bir yarisma secebilir; o zaman
     yarisma adini her soruda tekrar yazmasi gerekmez.
   - Hicbiri yoksa genel kurallar / etik / SSS kaynaklarina bakilir.
*/

const chatLog = document.getElementById('chatLog');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const suggestionsBox = document.getElementById('suggestions');
const toastEl = document.getElementById('toast');

const scopePop = document.getElementById('scopePop');
const scopeList = document.getElementById('scopeList');
const scopeSearch = document.getElementById('scopeSearch');
const scopeEmpty = document.getElementById('scopeEmpty');
const scopeActive = document.getElementById('scopeActive');
const scopeName = document.getElementById('scopeName');

const STORE_KEY = 'piri_competition';

let competition = null;   // istege bagli secili yarisma
let competitions = [];
let busy = false;

// Yarisma adlari cok uzun olabildigi icin oneriler her zaman KISA ve sabit
// tutulur; secili yarisma cubukta zaten yaziyor.
const SUGGESTIONS = [
  'Takımda kaç kişi olabilir?',
  'Başvuru koşulları neler?',
  'Etik kurallara aykırı davranışın yaptırımı nedir?'
];

const BOT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"
  stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/>
  <polygon points="15.8,8.2 10.6,10.6 8.2,15.8 13.4,13.4" fill="#fff" stroke="none"/></svg>`;

const DOC_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  <polyline points="14 2 14 8 20 8"/></svg>`;

/* ---------------------------------------------------------------- yardimci */

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/** Guvenli mini-markdown: once kacisla temizler, sonra **kalin**, madde ve satir sonlarini isler. */
function renderText(raw) {
  const lines = escapeHtml(raw).split('\n');
  let html = '';
  let inList = false;

  for (const line of lines) {
    const t = line.trim();
    const bullet = t.match(/^[*\-•]\s+(.*)$/);
    if (bullet) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${bullet[1]}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (t) html += `<p>${t}</p>`;
  }
  if (inList) html += '</ul>';

  return html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function toast(msg, kind = '') {
  toastEl.textContent = msg;
  toastEl.className = 'toast show ' + kind;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toastEl.className = 'toast ' + kind; }, 3600);
}

function scrollDown() {
  requestAnimationFrame(() => { chatLog.scrollTop = chatLog.scrollHeight; });
}

/* ------------------------------------------------------- yarisma secim cubugu */

function setCompetition(name) {
  competition = name || null;
  if (competition) {
    sessionStorage.setItem(STORE_KEY, competition);
    scopeName.textContent = competition;
    scopeName.title = competition;
    scopeEmpty.hidden = true;
    scopeActive.hidden = false;
  } else {
    sessionStorage.removeItem(STORE_KEY);
    scopeEmpty.hidden = false;
    scopeActive.hidden = true;
  }
  closeScope();
  input.focus();
}

function renderScopeList(filter = '') {
  const q = filter.trim().toLocaleLowerCase('tr');
  const shown = competitions.filter(c => !q || c.toLocaleLowerCase('tr').includes(q));

  scopeList.innerHTML = '';
  if (!competitions.length) {
    scopeList.innerHTML = '<div class="scope-none">Yarışma listesi yüklenemedi.</div>';
    return;
  }
  if (!shown.length) {
    scopeList.innerHTML = '<div class="scope-none">Eşleşen yarışma yok.</div>';
    return;
  }
  for (const name of shown.slice(0, 60)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'scope-item' + (name === competition ? ' on' : '');
    b.textContent = name;
    b.onclick = () => setCompetition(name);
    scopeList.appendChild(b);
  }
  if (shown.length > 60) {
    const note = document.createElement('div');
    note.className = 'scope-none';
    note.textContent = `${shown.length} sonuçtan ilk 60'ı gösteriliyor, aramayı daraltın.`;
    scopeList.appendChild(note);
  }
}

function openScope() {
  scopePop.hidden = false;
  scopeSearch.value = '';
  renderScopeList();
  scopeSearch.focus();
}

function closeScope() {
  scopePop.hidden = true;
}

document.getElementById('scopePick').addEventListener('click', openScope);
document.getElementById('scopeChange').addEventListener('click', openScope);
document.getElementById('scopeClose').addEventListener('click', closeScope);
document.getElementById('scopeClear').addEventListener('click', () => {
  setCompetition(null);
  toast('Yarışma seçimi kaldırıldı.');
});

scopeSearch.addEventListener('input', () => renderScopeList(scopeSearch.value));
scopeSearch.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeScope(); input.focus(); }
  if (e.key === 'Enter') {
    const first = scopeList.querySelector('.scope-item');
    if (first) first.click();
  }
});

document.addEventListener('click', e => {
  if (!scopePop.hidden && !scopePop.contains(e.target) && !e.target.closest('.scope-bar')) {
    closeScope();
  }
});

async function loadCompetitions() {
  try {
    const res = await fetch('/api/contexts');
    const data = await res.json();
    competitions = data.competitions || [];

    const saved = sessionStorage.getItem(STORE_KEY);
    if (saved && competitions.includes(saved)) setCompetition(saved);
  } catch {
    competitions = [];
  }
}

/* ---------------------------------------------------------------- mesajlar */

function renderSuggestions() {
  suggestionsBox.innerHTML = '';
  for (const s of SUGGESTIONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'suggestion';
    b.textContent = s;
    b.onclick = () => { input.value = s; submit(); };
    suggestionsBox.appendChild(b);
  }
}

function addUserMessage(text) {
  const empty = document.getElementById('emptyState');
  if (empty) empty.hidden = true;
  const el = document.createElement('div');
  el.className = 'msg msg-user';
  el.innerHTML = `<div class="msg-avatar">SİZ</div><div class="bubble"></div>`;
  el.querySelector('.bubble').textContent = text;
  chatLog.appendChild(el);
  scrollDown();
}

function addTyping() {
  const el = document.createElement('div');
  el.className = 'msg msg-bot';
  el.id = 'typing';
  el.innerHTML = `
    <div class="msg-avatar">${BOT_ICON}</div>
    <div class="bubble">
      <div class="typing"><span></span><span></span><span></span></div>
      <div class="typing-label">Doğrulanmış kaynaklar taranıyor…</div>
    </div>`;
  chatLog.appendChild(el);
  scrollDown();
  return el;
}

function confidenceClass(conf) {
  if (conf === 'Yüksek güven') return 'conf-high';
  if (conf === 'Orta güven') return 'conf-mid';
  return 'conf-low';
}

function addBotMessage(data, question) {
  const el = document.createElement('div');
  el.className = 'msg msg-bot';

  let tone = '';
  if (data.status === 'low_confidence') tone = ' tone-warn';
  if (data.status === 'needs_competition' || data.status === 'out_of_scope') tone = ' tone-ask';

  el.innerHTML = `<div class="msg-avatar">${BOT_ICON}</div><div class="bubble${tone}"></div>`;
  const bubble = el.querySelector('.bubble');
  bubble.innerHTML = renderText(data.answer);

  // Hangi kaynak kumesinden yanitlandi
  if (data.status === 'answered' && data.current_competition) {
    const badge = document.createElement('div');
    badge.className = 'answer-scope';
    badge.textContent = data.current_competition;
    badge.title = data.current_competition;
    bubble.insertBefore(badge, bubble.firstChild);
  }

  // Kaynaklar + guven seviyesi
  if (data.status === 'answered' && data.sources && data.sources.length) {
    const meta = document.createElement('div');
    meta.className = 'meta';

    const title = document.createElement('div');
    title.className = 'meta-title';
    title.textContent = 'KAYNAKLAR';
    meta.appendChild(title);

    const list = document.createElement('div');
    list.className = 'sources';
    for (const s of data.sources) {
      const chip = document.createElement('div');
      chip.className = 'source-chip';
      chip.innerHTML = DOC_ICON;
      const name = document.createElement('span');
      name.className = 'src-name';
      name.textContent = s.file;
      name.title = s.file;
      chip.appendChild(name);
      if (s.locator) {
        const loc = document.createElement('span');
        loc.className = 'src-loc';
        loc.textContent = s.locator;
        chip.appendChild(loc);
      }
      list.appendChild(chip);
    }
    meta.appendChild(list);

    if (data.confidence) {
      const conf = document.createElement('div');
      conf.className = 'confidence ' + confidenceClass(data.confidence);
      conf.textContent = data.confidence;
      meta.appendChild(conf);
    }
    bubble.appendChild(meta);
  }

  // Sunucu yarismayi soruyorsa: balonun icinde aranabilir secim listesi
  if (data.status === 'needs_competition' && data.competition_options?.length) {
    bubble.appendChild(inlinePicker(data.competition_options, question));
  }

  chatLog.appendChild(el);
  scrollDown();
  return el;
}

/** needs_competition durumunda: yarismayi sec, soru otomatik tekrar sorulsun. */
function inlinePicker(options, question) {
  const wrap = document.createElement('div');

  const search = document.createElement('input');
  search.className = 'picker-search';
  search.type = 'text';
  search.placeholder = 'Yarışma ara…';

  const picker = document.createElement('div');
  picker.className = 'picker';

  const draw = (filter = '') => {
    const q = filter.toLocaleLowerCase('tr');
    picker.innerHTML = '';
    const shown = options.filter(o => o.toLocaleLowerCase('tr').includes(q)).slice(0, 10);
    if (!shown.length) {
      const none = document.createElement('span');
      none.className = 'scope-none';
      none.textContent = 'Eşleşen yarışma yok.';
      picker.appendChild(none);
      return;
    }
    for (const name of shown) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = name;
      b.title = name;
      b.onclick = () => {
        setCompetition(name);
        if (question) ask(question, false);
      };
      picker.appendChild(b);
    }
  };

  draw();
  search.addEventListener('input', () => draw(search.value));
  wrap.append(search, picker);
  return wrap;
}

/* ------------------------------------------------------------------- akis */

async function ask(question, echo = true) {
  if (busy) return;
  busy = true;
  sendBtn.disabled = true;
  if (echo) addUserMessage(question);
  const typing = addTyping();

  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, context: competition })
    });

    typing.remove();

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Sunucu hatası (${res.status})`);
    }

    addBotMessage(await res.json(), question);
  } catch (e) {
    document.getElementById('typing')?.remove();
    addBotMessage({
      answer: 'Bağlantı kurulamadı: ' + e.message + '\n\nSunucunun çalıştığından emin olup tekrar deneyin.',
      status: 'low_confidence',
      sources: []
    });
    toast(e.message, 'err');
  } finally {
    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

function submit() {
  const q = input.value.trim();
  if (!q || busy) return;
  input.value = '';
  input.style.height = 'auto';
  ask(q);
}

/* ------------------------------------------------------------------ olaylar */

sendBtn.addEventListener('click', submit);

input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
});

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 140) + 'px';
});

renderSuggestions();
loadCompetitions();
input.focus();
