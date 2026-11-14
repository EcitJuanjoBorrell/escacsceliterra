'use strict';
import './updates.css';

const STORE_KEY = 'ecit.updates.v1';

/* ============================================================
   CONTINGUT — escriu aquí les novetats, en llenguatge pla.
   Per afegir una entrada nova, copia un bloc i posa'l AL PRINCIPI
   de la llista UPDATES. L'id ha de ser únic i no s'ha de canviar
   mai un cop publicat (és la clau de les marques del tester).
   kind: 'feature' | 'fix' | 'design' | 'internal'
   items[].m: 'new' | 'up' | 'fix' | 'off'
   ============================================================ */
const UPDATES = [
  {
    id: '2026-11-14-motor-tests',
    date: '2026-11-14',
    kind: 'internal',
    title: 'Més proves internes del motor (res visible)',
    lead: 'Hem afegit 114 comprovacions automàtiques que vigilen que les regles no es trenquin quan toquem el codi. El joc s\'ha de comportar exactament igual que ahir.',
    items: [
      { m: 'up', text: 'Cada regla delicada (fantasmes, enroc entre nivells, escac vertical, peons que es queden bloquejats al Cel) ara té una prova que avisa si es trenca.' },
      { m: 'up', text: 'El mode clàssic s\'ha comparat amb un motor d\'escacs de referència en 38.687 posicions: cap diferència.' },
      { m: 'up', text: 'S\'han congelat els recomptes de jugades de les sis variants internes, per detectar canvis involuntaris.' }
    ],
    test: [
      'Juga una partida sencera i comprova que tot segueix igual: captures que pugen al Cel, pujades i baixades, enroc internivell, promoció baixant.'
    ]
  },
  {
    id: '2026-11-14-login-fix',
    date: '2026-11-14',
    kind: 'fix',
    title: 'Entrar i sortir del compte ja funciona',
    lead: 'Hi havia un formulari antic amagat a la pantalla d\'entrada que interceptava la contrasenya i recarregava la pàgina. Ja no hi és.',
    items: [
      { m: 'fix', text: 'Escriure la contrasenya i prémer Enter ja no recarrega la pàgina ni et deixa encallat.' },
      { m: 'fix', text: 'Sortir i tornar a entrar funciona: abans de vegades et tornava a demanar les dades sense avançar.' },
      { m: 'fix', text: 'La pantalla d\'entrada ja no deixa veure el joc una fracció de segon abans de mostrar-se.' },
      { m: 'off', text: 'Ha desaparegut qualsevol camp de correu o contrasenya de la nostra pantalla: ara tot es fa a la finestra del proveïdor de comptes.' }
    ],
    test: [
      'Entra, juga una estona, surt amb «Sortir» i torna a entrar.',
      'Prova-ho també en un altre navegador o al mòbil amb el mateix compte.',
      'Si en algun moment et quedes a «Comprovant la sessió» més de dos o tres segons, marca-ho com a problema.'
    ]
  },
  {
    id: '2026-11-13-compte',
    date: '2026-11-13',
    kind: 'feature',
    title: 'Un compte per entrar des de qualsevol lloc',
    lead: 'El joc ara fa servir un sistema de comptes de veritat. Et registres una vegada i pots entrar des de l\'ordinador, el mòbil o un altre navegador.',
    items: [
      { m: 'new', text: 'Registre amb correu i contrasenya, amb verificació per correu.' },
      { m: 'new', text: 'Botons «Entrar» i «Crear compte» a la pantalla d\'inici.' },
      { m: 'up', text: 'La sessió es recorda: no cal tornar a escriure la contrasenya cada dia.' },
      { m: 'off', text: 'Ha desaparegut «Continuar sense compte · només aquest navegador». Ara cal un compte per jugar.' }
    ],
    test: [
      'Crea un compte amb el teu correu i confirma\'l.',
      'Obre el joc en un altre navegador i entra amb el mateix compte: has de poder jugar igual.',
      'Comprova que a dalt a l\'esquerra hi surt el teu correu i la marca «en línia».'
    ]
  },
  {
    id: '2026-11-13-pantalla',
    date: '2026-11-13',
    kind: 'design',
    title: 'Pantalla d\'entrada nova',
    lead: 'La pantalla per entrar ara mostra els dos taulells amb un feix de llum blau entre ells i un fons que es mou lentament.',
    items: [
      { m: 'new', text: 'Emblema del Cel i la Terra amb el feix blau que respira.' },
      { m: 'new', text: 'Títol amb el degradat de colors del joc.' },
      { m: 'up', text: 'Botons més grans i més clars, un damunt de l\'altre.' },
      { m: 'off', text: 'Fora el text petit de sota els botons: queda més net.' }
    ],
    test: [
      'Mira la pantalla d\'entrada al mòbil i a l\'ordinador.',
      'Comprova que els dos botons es veuen sencers i es poden clicar sense encertar-hi massa.'
    ]
  }
];

const KNOWN = [
  {
    id: 'known-ia-cel',
    sev: 'high',
    title: 'La màquina no persegueix el rei que es refugia al Cel',
    text: 'Si jugues a dificultat Fàcil i el teu rei puja al Cel, de vegades la màquina es distreu pujant peces sense sentit en lloc d\'anar a per ell. És el problema principal que estem arreglant ara.',
    repro: 'Posa dificultat Fàcil, juga ràpid i puja el rei al Cel. Mira si les blanques s\'hi acosten o si van fent jugades intranscendents.'
  },
  {
    id: 'known-partida-llarga',
    sev: 'high',
    title: 'Hi ha partides que no s\'acaben mai',
    text: 'Encara no hi ha regla de repetició de posició. Si les peces van tornant als mateixos llocs, la partida es pot allargar moltíssim fins que salta el límit de 50 jugades.',
    repro: 'Quan quedin poques peces, mou el rei o la torre endavant i endarrere. Fixa\'t si la partida es declara taules en algun moment.'
  },
  {
    id: 'known-horitzo',
    sev: 'mid',
    title: 'L\'horitzó de la foto de fons queda massa amunt',
    text: 'Si puges una foto de paisatge com a fons, quan gires la càmera per veure bé els taulells l\'horitzó marxa cap amunt i deixes de veure el paisatge.',
    repro: 'Personalitza → posa una foto teva de paisatge. Després gira i inclina la càmera per mirar els dos taulells de costat.'
  },
  {
    id: 'known-costura',
    sev: 'mid',
    title: 'Es veu una línia vertical a la foto de fons',
    text: 'Allà on la foto es tanca sobre ella mateixa (el costat esquerre tocant el dret) apareix una línia de tall gens natural.',
    repro: 'Amb una foto de fons posada, gira la càmera lentament fins a trobar la línia. Sol ser darrere del punt de partida.'
  },
  {
    id: 'known-correu-tallat',
    sev: 'low',
    title: 'El correu de dalt pot quedar tallat',
    text: 'A la barra de dalt, si el teu correu és llarg, el text del torn («Blanques (tu)») pot quedar tapat o sobresortir per sota.',
    repro: 'Entra amb un correu llarg i mira la cantonada de dalt. Redueix l\'amplada de la finestra i torna a mirar.'
  },
  {
    id: 'known-dev',
    sev: 'low',
    title: 'Avís de «development keys» a la consola',
    text: 'El sistema de comptes encara està en mode de proves. Si obres la consola del navegador veuràs un avís en anglès. No afecta el joc ni les teves dades.',
    repro: 'No cal fer res. Si veus algun ALTRE error en vermell a la consola, copia\'l i envia\'l.'
  }
];

const KIND_LABEL = { feature: 'Novetat', fix: 'Arreglat', design: 'Aspecte', internal: 'Feina interna' };
const MARK_GLYPH = { new: '✦', up: '↑', fix: '✓', off: '−' };
const SEV_LABEL = { high: 'Important', mid: 'Mitjà', low: 'Menor' };
const MONTHS = ['gen', 'feb', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'des'];

const SVG = {
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M8 7.5h7M8 11h5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 11l5 5 5-5M4 20h16"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6a2 2 0 0 0-2 2v7"/></svg>'
};

/* ---------------- estat ---------------- */
function blank() { return { read: {}, fb: {}, seen: {}, seenNote: {} }; }
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return blank();
    const p = JSON.parse(raw);
    return {
      read: p && typeof p.read === 'object' && p.read ? p.read : {},
      fb: p && typeof p.fb === 'object' && p.fb ? p.fb : {},
      seen: p && typeof p.seen === 'object' && p.seen ? p.seen : {},
      seenNote: p && typeof p.seenNote === 'object' && p.seenNote ? p.seenNote : {}
    };
  } catch { return blank(); }
}
let state = load();
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* storage bloquejat */ } }

let root = null, card = null, body = null, btn = null, badge = null, toast = null;
let isOpen = false, tab = 'news', filter = 'all', query = '';
let lastFocus = null, undoSnap = null, toastTimer = null;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const unread = () => UPDATES.filter(u => !state.read[u.id]).length;
const tested = () => UPDATES.filter(u => state.fb[u.id] && state.fb[u.id].status).length;
const seenCount = () => KNOWN.filter(k => state.seen[k.id]).length;

function fmtDate(iso) {
  const p = String(iso).split('-');
  if (p.length !== 3) return iso;
  const m = MONTHS[Number(p[1]) - 1] || p[1];
  return `${Number(p[2])} ${m} ${p[0]}`;
}
function testerName() {
  const el = document.getElementById('user-chip-mail');
  const t = el && el.textContent ? el.textContent.trim() : '';
  return t || 'Tester anònim';
}

/* ---------------- muntatge ---------------- */
function findAnchor() {
  const hook = document.querySelector('[data-updates-anchor]');
  if (hook) return hook;
  for (const id of ['btn-rules', 'btn-rules-open', 'rules-btn', 'btn-help']) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  const btns = Array.from(document.querySelectorAll('button'));
  return btns.find(b => /regles/i.test(b.textContent || ''))
      || btns.find(b => /personalitza/i.test(b.textContent || ''))
      || null;
}

function mountButton() {
  btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'btn-updates';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.title = 'Què ha canviat al joc';
  const anchor = findAnchor();
  if (anchor) {
    btn.className = String(anchor.className || '').replace(/\bis-(active|open|selected)\b/g, '').trim();
    btn.classList.add('ecu-btn');
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
  } else {
    btn.className = 'ecu-btn ecu-btn--floating';
    document.body.appendChild(btn);
  }
  btn.innerHTML = `<span aria-hidden="true">🗒</span><span>Actualitzacions</span><span class="ecu-badge" hidden></span>`;
  badge = btn.querySelector('.ecu-badge');
  btn.addEventListener('click', openPanel);
  syncBadge();
}

function syncBadge() {
  if (!badge) return;
  const n = unread();
  badge.hidden = n === 0;
  badge.textContent = n > 9 ? '9+' : String(n);
  btn.setAttribute('aria-label', n ? `Actualitzacions: ${n} sense llegir` : 'Actualitzacions');
}

function mountPanel() {
  root = document.createElement('div');
  root.className = 'ecu-root';
  root.id = 'updates-panel';
  root.hidden = true;
  root.innerHTML = `
    <div class="ecu-scrim" data-close="1"></div>
    <div class="ecu-card" role="dialog" aria-modal="true" aria-labelledby="ecu-title">
      <div class="ecu-head">
        <div class="ecu-head-row">
          <div class="ecu-emblem" aria-hidden="true">${SVG.book}</div>
          <div class="ecu-titles">
            <h2 class="ecu-title" id="ecu-title">Actualitzacions</h2>
            <p class="ecu-sub">Què ha canviat al joc, explicat en pla — i què pots provar tu.</p>
          </div>
          <button type="button" class="ecu-x" data-close="1" aria-label="Tanca">${SVG.x}</button>
        </div>
        <div class="ecu-meta" data-meta="1"></div>
      </div>
      <div class="ecu-tabs" role="tablist">
        <button type="button" class="ecu-tab" role="tab" data-tab="news" aria-selected="true">
          Novetats <span class="ecu-tab-count" data-c-news="1">0</span>
        </button>
        <button type="button" class="ecu-tab" role="tab" data-tab="known" aria-selected="false">
          Coses pendents <span class="ecu-tab-count" data-c-known="1">0</span>
        </button>
      </div>
      <div class="ecu-tools" data-tools="1"></div>
      <div class="ecu-body" data-body="1" tabindex="-1"></div>
      <div class="ecu-foot">
        <div class="ecu-who">Informe de proves de<b data-who="1">—</b></div>
        <button type="button" class="ecu-cta ecu-cta--ghost" data-act="copy">${SVG.copy} Copia</button>
        <button type="button" class="ecu-cta ecu-cta--main" data-act="export">${SVG.down} Envia l'informe</button>
        <button type="button" class="ecu-cta ecu-cta--warn" data-act="reset">Esborra marques</button>
      </div>
      <div class="ecu-toast" hidden data-toast="1">
        <span data-toast-msg="1"></span>
        <button type="button" class="ecu-undo" data-act="undo">Desfés</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  card = root.querySelector('.ecu-card');
  body = root.querySelector('[data-body]');
  toast = root.querySelector('[data-toast]');

  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onInput);
  document.addEventListener('keydown', onKey, true);
}

/* ---------------- render ---------------- */
function renderMeta() {
  const n = unread(), t = tested(), s = seenCount();
  root.querySelector('[data-meta]').innerHTML = `
    <span class="ecu-pill"><b>${n}</b> ${n === 1 ? 'novetat sense llegir' : 'novetats sense llegir'}</span>
    <span class="ecu-pill ecu-pill--ok"><b>${t}</b> de ${UPDATES.length} provades</span>
    <span class="ecu-pill ecu-pill--warn"><b>${s}</b> de ${KNOWN.length} problemes vistos</span>`;
  root.querySelector('[data-c-news]').textContent = n ? String(n) : String(UPDATES.length);
  root.querySelector('[data-c-known]').textContent = String(KNOWN.length);
  root.querySelector('[data-who]').textContent = testerName();
  root.querySelectorAll('.ecu-tab').forEach(el => {
    el.setAttribute('aria-selected', String(el.dataset.tab === tab));
  });
}

function renderTools() {
  const tools = root.querySelector('[data-tools]');
  if (tab === 'news') {
    const chips = [['all', 'Tot'], ['feature', 'Novetats'], ['fix', 'Arreglat'], ['design', 'Aspecte'], ['internal', 'Intern'], ['todo', 'Per provar']]
      .map(([k, label]) => `<button type="button" class="ecu-chip" data-filter="${k}" aria-pressed="${filter === k}">${label}</button>`).join('');
    tools.innerHTML = `
      <label class="ecu-search">${SVG.search}
        <input type="search" data-q="1" placeholder="Cerca a les novetats…" value="${esc(query)}" aria-label="Cerca a les novetats">
      </label>
      <div class="ecu-chips">${chips}</div>
      <button type="button" class="ecu-mini" data-act="readall">Marca tot llegit</button>`;
  } else {
    tools.innerHTML = `
      <div class="ecu-search" style="flex:1 1 auto">
        <span style="font-size:.8rem;color:var(--ink-dim)">Marca el que hagis vist. Aquesta llista és el que sabem que encara no va bé.</span>
      </div>
      <button type="button" class="ecu-mini" data-act="seenall">Marca-ho tot vist</button>`;
  }
}

function matchQuery(u) {
  if (!query) return true;
  const q = query.toLowerCase();
  const hay = [u.title, u.lead, ...(u.items || []).map(i => i.text), ...(u.test || [])].join(' ').toLowerCase();
  return hay.includes(q);
}

function renderNews() {
  let list = UPDATES.filter(matchQuery);
  if (filter === 'todo') list = list.filter(u => !(state.fb[u.id] && state.fb[u.id].status));
  else if (filter !== 'all') list = list.filter(u => u.kind === filter);

  if (!list.length) {
    body.innerHTML = `<div class="ecu-empty"><strong>Res per aquí</strong>Cap novetat coincideix amb el filtre o la cerca.</div>`;
    return;
  }

  body.innerHTML = `<div class="ecu-line">${list.map((u, i) => {
    const un = !state.read[u.id];
    const fb = state.fb[u.id] || {};
    const items = (u.items || []).map(it =>
      `<li><span class="ecu-mark" data-m="${it.m}" aria-hidden="true">${MARK_GLYPH[it.m] || '•'}</span><span>${esc(it.text)}</span></li>`).join('');
    const tries = (u.test || []).map(t => `<li>${esc(t)}</li>`).join('');
    return `
      <article class="ecu-entry" data-kind="${u.kind}" data-unread="${un ? 1 : 0}" style="animation-delay:${Math.min(i * 45, 260)}ms">
        <div class="ecu-entry-head">
          <span class="ecu-date">${esc(fmtDate(u.date))}</span>
          <span class="ecu-kind" data-k="${u.kind}">${KIND_LABEL[u.kind] || u.kind}</span>
          ${un ? '<span class="ecu-new">NOU</span>' : ''}
        </div>
        <h3>${esc(u.title)}</h3>
        <p class="ecu-lead">${esc(u.lead)}</p>
        <ul class="ecu-items">${items}</ul>
        ${tries ? `<div class="ecu-try"><div class="ecu-try-t"><span aria-hidden="true">🎯</span> Què pots provar</div><ol>${tries}</ol></div>` : ''}
        <div class="ecu-fb">
          <div class="ecu-fb-row">
            <button type="button" class="ecu-fbtn" data-fb="ok" data-id="${u.id}" ${fb.status === 'ok' ? 'data-on="ok"' : ''}>
              <span aria-hidden="true">✓</span> Provat, funciona
            </button>
            <button type="button" class="ecu-fbtn" data-fb="bad" data-id="${u.id}" ${fb.status === 'bad' ? 'data-on="bad"' : ''}>
              <span aria-hidden="true">⚠</span> Hi he vist un problema
            </button>
          </div>
          <textarea class="ecu-note" data-note="${u.id}" placeholder="Què has fet, què esperaves i què ha passat. Qualsevol detall ajuda.">${esc(fb.note || '')}</textarea>
          <div class="ecu-saved" data-saved="${u.id}"></div>
        </div>
      </article>`;
  }).join('')}</div>`;
}

function renderKnown() {
  body.innerHTML = KNOWN.map((k, i) => `
    <article class="ecu-issue" data-sev="${k.sev}" data-seen="${state.seen[k.id] ? 1 : 0}" style="animation-delay:${Math.min(i * 45, 260)}ms">
      <div class="ecu-issue-top">
        <span class="ecu-sev">${SEV_LABEL[k.sev]}</span>
        <button type="button" class="ecu-fbtn" data-seen-id="${k.id}" ${state.seen[k.id] ? 'data-on="ok"' : ''}>
          <span aria-hidden="true">${state.seen[k.id] ? '✓' : '○'}</span> ${state.seen[k.id] ? 'Ho he vist' : 'Marca si ho veus'}
        </button>
      </div>
      <h4>${esc(k.title)}</h4>
      <p>${esc(k.text)}</p>
      <div class="ecu-repro"><b>Com reproduir-ho:</b> ${esc(k.repro)}</div>
      <textarea class="ecu-note" data-seen-note="${k.id}" placeholder="Si ho has vist, explica què has fet exactament i què ha passat.">${esc(state.seenNote[k.id] || '')}</textarea>
      <div class="ecu-saved" data-saved="k-${k.id}"></div>
    </article>`).join('');
}

function render() {
  renderMeta();
  renderTools();
  if (tab === 'news') renderNews(); else renderKnown();
  syncBadge();
}

/* ---------------- accions ---------------- */
function flashSaved(key, msg) {
  const el = root.querySelector(`[data-saved="${key}"]`);
  if (!el) return;
  el.textContent = msg || 'Desat al navegador ✓';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.textContent = ''; }, 1800);
}

function showToast(msg, withUndo) {
  root.querySelector('[data-toast-msg]').textContent = msg;
  root.querySelector('[data-act="undo"]').hidden = !withUndo;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; undoSnap = null; }, 6000);
}

function snapshot() { undoSnap = JSON.stringify(state); }

function markAllRead() {
  snapshot();
  const now = Date.now();
  UPDATES.forEach(u => { if (!state.read[u.id]) state.read[u.id] = now; });
  save(); render();
  showToast('Tot marcat com a llegit.', true);
}
function markAllSeen() {
  snapshot();
  KNOWN.forEach(k => { state.seen[k.id] = Date.now(); });
  save(); render();
  showToast('Tots els problemes marcats com a vistos.', true);
}
function resetAll() {
  snapshot();
  state = blank();
  save(); render();
  showToast('Marques esborrades.', true);
}
function undo() {
  if (!undoSnap) return;
  try { state = JSON.parse(undoSnap); } catch { return; }
  undoSnap = null;
  save(); render();
  toast.hidden = true;
}

function buildReport() {
  const L = [];
  L.push('INFORME DE PROVES — Escacs Cel i Terra');
  L.push('Tester: ' + testerName());
  L.push('Generat: ' + new Date().toLocaleString('ca-ES'));
  L.push('');
  L.push('=== NOVETATS ===');
  UPDATES.forEach(u => {
    const fb = state.fb[u.id] || {};
    const st = fb.status === 'ok' ? 'PROVAT, FUNCIONA' : fb.status === 'bad' ? 'HI HA UN PROBLEMA' : 'sense provar';
    L.push('');
    L.push(`[${fmtDate(u.date)}] ${u.title}`);
    L.push(`  Estat: ${st}${state.read[u.id] ? ' · llegit' : ' · NO llegit'}`);
    if (fb.note && fb.note.trim()) L.push('  Nota: ' + fb.note.trim().replace(/\n/g, '\n        '));
  });
  L.push('');
  L.push('=== PROBLEMES CONEGUTS ===');
  KNOWN.forEach(k => {
    L.push('');
    L.push(`[${SEV_LABEL[k.sev]}] ${k.title}`);
    L.push(`  Vist pel tester: ${state.seen[k.id] ? 'SÍ' : 'no'}`);
    const n = state.seenNote[k.id];
    if (n && n.trim()) L.push('  Nota: ' + n.trim().replace(/\n/g, '\n        '));
  });
  L.push('');
  L.push('=== RESUM ===');
  L.push(`Novetats: ${tested()}/${UPDATES.length} provades · ${unread()} sense llegir`);
  L.push(`Problemes confirmats pel tester: ${seenCount()}/${KNOWN.length}`);
  const bad = UPDATES.filter(u => state.fb[u.id] && state.fb[u.id].status === 'bad').length;
  if (bad) L.push(`ATENCIÓ: ${bad} novetat(s) amb problema reportat.`);
  return L.join('\n');
}

function exportReport() {
  const text = buildReport();
  try {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `informe-proves-ecit-${d}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast('Informe descarregat. Envia el fitxer al Sasha.', false);
  } catch {
    copyReport();
  }
}

async function copyReport() {
  const text = buildReport();
  try {
    await navigator.clipboard.writeText(text);
    showToast('Informe copiat. Enganxa-lo a un missatge.', false);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    showToast(ok ? 'Informe copiat.' : 'No s\'ha pogut copiar. Fes servir «Envia l\'informe».', false);
  }
}

/* ---------------- esdeveniments ---------------- */
function onClick(e) {
  const t = e.target;
  const closest = sel => t.closest(sel);

  if (closest('[data-close]')) { closePanel(); return; }

  const tabBtn = closest('[data-tab]');
  if (tabBtn) { tab = tabBtn.dataset.tab; body.scrollTop = 0; render(); return; }

  const chip = closest('[data-filter]');
  if (chip) { filter = chip.dataset.filter; body.scrollTop = 0; render(); return; }

  const fb = closest('[data-fb]');
  if (fb) {
    const id = fb.dataset.id, val = fb.dataset.fb;
    const cur = state.fb[id] || {};
    state.fb[id] = { status: cur.status === val ? '' : val, note: cur.note || '', at: Date.now() };
    state.read[id] = state.read[id] || Date.now();
    save(); render();
    flashSaved(id, state.fb[id].status ? 'Marcat ✓' : 'Marca treta');
    return;
  }

  const seen = closest('[data-seen-id]');
  if (seen) {
    const id = seen.dataset.seenId;
    if (state.seen[id]) delete state.seen[id]; else state.seen[id] = Date.now();
    save(); render();
    flashSaved('k-' + id, state.seen[id] ? 'Marcat com a vist ✓' : 'Marca treta');
    return;
  }

  const act = closest('[data-act]');
  if (!act) return;
  switch (act.dataset.act) {
    case 'readall': markAllRead(); break;
    case 'seenall': markAllSeen(); break;
    case 'reset': resetAll(); break;
    case 'undo': undo(); break;
    case 'export': exportReport(); break;
    case 'copy': copyReport(); break;
  }
}

function onInput(e) {
  const t = e.target;
  if (t.matches('[data-q]')) { query = t.value; renderNews(); return; }
  const nid = t.getAttribute('data-note');
  if (nid) {
    const cur = state.fb[nid] || {};
    state.fb[nid] = { status: cur.status || '', note: t.value, at: Date.now() };
    save(); flashSaved(nid);
    return;
  }
  const sid = t.getAttribute('data-seen-note');
  if (sid) {
    state.seenNote[sid] = t.value;
    save(); flashSaved('k-' + sid);
  }
}

function onKey(e) {
  if (!isOpen) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePanel(); return; }
  if (e.key === 'Tab') {
    const f = Array.from(card.querySelectorAll('button:not([hidden]):not([disabled]), input, textarea, [tabindex="-1"]'))
      .filter(el => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    e.stopPropagation();
    return;
  }
  if (card.contains(e.target)) e.stopPropagation();
}

/* ---------------- obertura ---------------- */
function openPanel() {
  if (!root) return;
  lastFocus = document.activeElement;
  isOpen = true;
  root.hidden = false;
  render();
  const first = card.querySelector('.ecu-tab[aria-selected="true"]');
  setTimeout(() => { (first || card).focus(); }, 40);
}
function closePanel() {
  if (!root || !isOpen) return;
  isOpen = false;
  root.hidden = true;
  toast.hidden = true;
  clearTimeout(toastTimer);
  undoSnap = null;
  syncBadge();
  if (lastFocus && document.contains(lastFocus)) { try { lastFocus.focus(); } catch { /* noop */ } }
}

export function initUpdates() {
  if (document.getElementById('updates-panel')) return;
  mountButton();
  mountPanel();
}
export function openUpdates() { openPanel(); }
export { UPDATES, KNOWN };

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUpdates, { once: true });
} else {
  initUpdates();
}

