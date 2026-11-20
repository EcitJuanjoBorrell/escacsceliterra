// src/ui/labPanel.js
'use strict';
import './labPanel.css';
import * as X from '../engine/experience.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = v => Math.round(v * 100);
const fmt = iso => {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  const M = ['gen', 'feb', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'des'];
  const mi = Number(m) - 1;
  const month = Number.isInteger(mi) && mi >= 0 && mi < 12 ? M[mi] : m;
  return d && y ? `${Number(d)} ${month} ${y}` : String(iso);
};

const I = {
  flask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 3h6M10 3v5.2L5.4 17A3 3 0 0 0 8 21h8a3 3 0 0 0 2.6-4L14 8.2V3"/><path d="M7.5 15h9"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 4v12M6 12l6 6 6-6M4 21h16"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 20V8M6 12l6-6 6 6M4 3h16"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 9h10a5 5 0 0 1 0 10H8M4 9l4-4M4 9l4 4"/></svg>',
  cut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><path d="M8 7.6L20 18M8 16.4L20 6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/></svg>'
};

let host, sheet, launcher, drawer;
let open = false, mobileTab = 'posicions';
let importMode = null, importText = '', preview = null, msg = '';
let dragKey = null;
let openDrop = null;
let currentView = '';
let stats = null, gamesPage = 0;
const GAMES_PER_PAGE = 50;

function mount() {
  if (document.getElementById('lab-launcher')) return;
  launcher = document.createElement('button');
  launcher.id = 'lab-launcher';
  launcher.type = 'button';
  launcher.className = 'lab-launch';
  launcher.setAttribute('aria-label', 'Obre el laboratori d’experiència');
  document.body.appendChild(launcher);

  host = document.createElement('div');
  host.className = 'lab-host';
  host.hidden = true;
  host.innerHTML = '<div class="lab-scrim" data-close="1"></div><section class="lab-sheet" role="dialog" aria-modal="true" aria-label="Laboratori d’experiència"></section>';
  document.body.appendChild(host);
  sheet = host.querySelector('.lab-sheet');
  sheet.addEventListener('click', onDropSheetClick);
  document.addEventListener('click', onDropDocClick);

  drawer = document.createElement('aside');
  drawer.className = 'lab-drawer';
  drawer.hidden = true;
  document.body.appendChild(drawer);

  launcher.addEventListener('click', () => setOpen(true));
  host.addEventListener('click', e => { if (e.target.dataset.close) setOpen(false); });
  document.addEventListener('keydown', onKey);
  X.subscribe(() => { stats = null; render(); });
  render();
}

function setOpen(v) {
  if (!v) openDrop = null;
  open = v; host.hidden = !v;
  document.body.classList.toggle('lab-locked', v);
  if (!v) { importMode = null; preview = null; X.setActive(null); }
  render();
  if (v) setTimeout(() => sheet.querySelector('#lab-q')?.focus(), 80);
}

function onKey(e) {
  if (e.key === 'Escape') {
    if (X.activePosition()) return X.setActive(null);
    if (importMode) { importMode = null; preview = null; return render(); }
    if (open) return setOpen(false);
  }
  if (!open) return;
  if (e.key === '/' && !/input|textarea|select/i.test(e.target.tagName)) { e.preventDefault(); sheet.querySelector('#lab-q')?.focus(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); X.undo(); }
}

/* ---------- mini taulells ---------- */

function miniBoard(boards, level) {
  let cells = '';
  for (let r = 7; r >= 0; r--) {
    for (let f = 0; f < 8; f++) {
      const p = boards[level][r][f];
      const dark = (r + f) % 2 === 0;
      cells += `<i class="lab-cell" data-dark="${dark}" ${p ? `data-side="${p.s}" data-ghost="${p.g}"` : ''}>${p ? X.glyph(p.t) : ''}</i>`;
    }
  }
  return `<div class="lab-mini" data-level="${level}"><span>${level ? 'Cel · N1' : 'Terra · N0'}</span><div class="lab-grid">${cells}</div></div>`;
}

/* ---------- render ---------- */

function render() {
  const index = X.getLibraryIndex();
  const q = stats;
  const positions = q?.rows || [];
  const pageCount = Math.max(1, Math.ceil(index.totalGames / GAMES_PER_PAGE));
  gamesPage = Math.min(gamesPage, pageCount - 1);
  const gameOffset = Math.max(0, index.totalGames - (gamesPage + 1) * GAMES_PER_PAGE);
  const games = X.getGamesPage(gameOffset, GAMES_PER_PAGE).reverse();
  const save = X.persistenceStatus();
  const saveLabel = save.state === 'saving' ? 'Desant…' : save.state === 'error' ? 'Error' : 'Desat';
  const saveSize = save.bytes < 1024 ? `${save.bytes} B` : `${(save.bytes / 1024).toFixed(1)} KB`;
  launcher.innerHTML = `${I.flask}<span>Experiència</span><b>${index.totalGames}</b><small class="lab-launch-save" data-state="${esc(save.state)}">${saveLabel} · ${save.games} · ~${saveSize}</small>`;
  launcher.dataset.draft = X.isDraft() ? '1' : '0';
  launcher.dataset.saveState = save.state;
  launcher.title = save.state === 'error' ? 'Error desant la biblioteca: ' + save.message : 'Estat del desat: ' + save.state;
  if (!open) { renderDrawer(); return; }

  const f = X.getFilters(), s = X.settings(), sel = X.getSelection(), views = X.getViews();
  const prevScroll = sheet.querySelector('.lab-cols')?.scrollTop || 0;

  sheet.innerHTML = `
    <header class="lab-head">
      <div class="lab-head-l">
        <span class="lab-mark">${I.flask}</span>
        <div>
          <h2>Laboratori d’experiència</h2>
          <p>Escacs Cel i Terra · reglament 1.1 · ${index.totalGames} partides · ${q ? `${q.positions} posicions · actualitzat ${fmt(q.updated)}` : `~${formatBytes(index.approxBytes)}`}</p>
        </div>
      </div>
      <div class="lab-head-r">
        ${X.isDraft() ? '<span class="lab-flag" title="Només ho veus tu en aquest navegador">esborrany local</span>' : ''}
        <button type="button" class="lab-x" data-close="1" aria-label="Tanca">${I.x}</button>
      </div>
    </header>

    ${saveIndicator(save)}

    <div class="lab-stats">
      ${stat('Partides', index.totalGames, 'sky')}
      ${stat('Posicions', q?.positions ?? '—', 'violet')}
      ${stat('Amb dades', q?.withData ?? '—', 'leaf')}
      ${stat('Observacions', q?.totalObs ?? '—', 'earth')}
      ${stat('Jugades sòlides', q?.eligible ?? '—', 'sky')}
      ${stat('Confiança mitjana', q ? pct(q.avgConfidence) + '%' : '—', 'leaf')}
      ${q ? `<div class="lab-ring" style="--p:${q.coverage}">
        <svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18"/><circle cx="22" cy="22" r="18" class="fill"/></svg>
        <div><b>${q.coverage}%</b><span>cobertura</span></div>
      </div>` : ''}
      <div class="lab-results" title="Resultats de les partides acumulades">
        <span data-s="w">1-0 <b>${q ? q.results.w || 0 : '—'}</b></span>
        <span data-s="d">½ <b>${q ? q.results.d || 0 : '—'}</b></span>
        <span data-s="b">0-1 <b>${q ? q.results.b || 0 : '—'}</b></span>
      </div>
      <button type="button" class="lab-ghost" data-calcstats="1">${q ? 'Actualitza estadístiques' : 'Calcula estadístiques'}</button>
    </div>

    <div class="lab-rail">
      <div class="lab-search">${I.search}<input id="lab-q" type="search" placeholder="Cerca posició o jugada…  ( / )" value="${esc(f.q)}" data-f="q"></div>
      ${sel2('sort', 'Ordena', [['observacions', 'Observacions'], ['confiança', 'Confiança'], ['puntuacio', 'Puntuació'], ['profunditat', 'Profunditat'], ['candidats', 'Candidats'], ['id', 'Identificador']], f.sort)}
      ${sel2('kind', 'Tipus de jugada', [['tots', 'Tots'], ['clàssic', 'Clàssic'], ['vertical', 'Vertical'], ['captura', 'Captura'], ['al pas', 'Al pas'], ['enroc', 'Enroc']], f.kind)}
      ${sel2('level', 'Nivells', [['tots', 'Tots'], ['mix', 'Amb jugada vertical'], ['pla', 'Només un nivell']], f.level)}
      <button type="button" class="lab-toggle" data-t="onlyData" data-on="${f.onlyData}">Només amb dades</button>
      <button type="button" class="lab-toggle" data-t="dense" data-on="${f.dense}">Compacte</button>
      <button type="button" class="lab-ghost" data-clear="1">Neteja</button>
      <div class="lab-views">
        ${sel2('__views', 'Vistes', [['', 'Tria una vista…']].concat(views.map(v => [v.name, v.name])), currentView)}
        <button type="button" class="lab-ghost" data-saveview="1">Desa</button>
        ${views.length ? '<button type="button" class="lab-ghost" data-dropview="1">Elimina</button>' : ''}
      </div>
    </div>

    <div class="lab-tune">
      ${slider('minObservations', 'Observacions mínimes', s.minObservations, 1, 30, 1)}
      ${slider('minConfidence', 'Confiança mínima', s.minConfidence, 0, 0.9, 0.05)}
      ${slider('maxPly', 'Profunditat màxima (mitges jugades)', s.maxPly, 4, 80, 2)}
      ${slider('resultWeight', 'Pes del resultat vs freqüència', s.resultWeight, 0, 1, 0.05)}
      ${slider('pruneBelow', 'Poda per sota de', s.pruneBelow, 0, 0.9, 0.05)}
      <div class="lab-tune-act">
        <button type="button" class="lab-solid" data-ingest="1">${I.up}<span>Afegeix partides</span></button>
        <button type="button" class="lab-ghost" data-notation-import="1">Importa notació</button>
        <button type="button" class="lab-ghost" data-libimport="1">Importa biblioteca</button>
        <button type="button" class="lab-ghost" data-prune="1">${I.cut}<span>Poda</span></button>
        <button type="button" class="lab-ghost" data-undo="1" ${X.canUndo() ? '' : 'disabled'}>${I.undo}<span>Desfés</span></button>
        <button type="button" class="lab-ghost" data-reset="1">Descarta esborrany</button>
        <button type="button" class="lab-solid" data-export="1">${I.down}<span>Exporta</span></button>
      </div>
    </div>

    ${sel.size ? `<div class="lab-bulk"><b>${sel.size} posicions</b>
      <button type="button" class="lab-danger" data-bulkdel="1">${I.trash}<span>Esborra</span></button>
      <button type="button" class="lab-ghost" data-unsel="1">Cap</button></div>` : ''}
    ${msg ? `<div class="lab-msg" role="alert">${esc(msg)}</div>` : ''}
    ${importMode ? importBox() : ''}

    <nav class="lab-tabs">
      <button type="button" data-tab="posicions" aria-selected="${mobileTab === 'posicions'}">Posicions <b>${positions.length}</b></button>
      <button type="button" data-tab="partides" aria-selected="${mobileTab === 'partides'}">Partides <b>${index.totalGames}</b></button>
    </nav>

    <div class="lab-cols" data-dense="${f.dense}" data-only="${mobileTab}">
      <section class="lab-col" data-col="posicions">
        <h3>Posicions apreses <span>${positions.length}</span></h3>
        <div class="lab-list">${q ? (positions.length ? positions.map(r => posCard(r, sel, s)).join('') : empty('Cap posició amb aquests filtres.', 'Afegeix partides o neteja els filtres.')) : empty('Estadístiques pendents.', 'Calcula-les només quan vulguis consultar les posicions apreses.')}</div>
      </section>
      <section class="lab-col" data-col="partides">
        <h3>Partides acumulades <span>${index.totalGames}</span></h3>
        <div class="lab-games">${games.length ? games.map(gameRow).join('') : empty('Encara no hi ha partides.', 'El esquelet d’obertura està calculat, però sense experiència. Afegeix partides per començar a omplir-lo.')}</div>
        ${index.totalGames > GAMES_PER_PAGE ? `<div class="lab-game-pages">
          <button type="button" class="lab-ghost" data-game-page="${gamesPage - 1}" ${gamesPage === 0 ? 'disabled' : ''}>Anterior</button>
          <span>Pàgina ${gamesPage + 1} de ${pageCount}</span>
          <button type="button" class="lab-ghost" data-game-page="${gamesPage + 1}" ${gamesPage >= pageCount - 1 ? 'disabled' : ''}>Següent</button>
        </div>` : ''}
      </section>
    </div>
    ${toastBar()}
  `;
  const nb = sheet.querySelector('.lab-cols'); if (nb) nb.scrollTop = prevScroll;
  wire();
  renderDrawer();
}

function stat(t, v, tone) { return `<div class="lab-stat" data-tone="${tone}"><span>${esc(t)}</span><b>${esc(v)}</b></div>`; }
function formatBytes(bytes) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function saveIndicator(save) {
  const state = save.state === 'saving' ? 'Desant…' : save.state === 'error' ? 'Error de desat' : 'Desat';
  const size = save.bytes < 1024 ? `${save.bytes} B` : `${(save.bytes / 1024).toFixed(1)} KB`;
  return `<div class="lab-save" data-state="${esc(save.state)}" role="status" aria-live="polite">
    <b>${state}</b><span>${save.games} partides · ~${size}</span>
    ${save.message ? `<span class="lab-save-message">${esc(save.message)}</span>` : ''}
    ${save.state === 'error' ? '<button type="button" class="lab-ghost" data-save-export="1">Exporta la biblioteca ara</button>' : ''}
  </div>`;
}
function sel2(k, l, opts, v) {
  const cur = opts.find(([a]) => String(a) === String(v)) || opts[0];
  const isOpen = openDrop === k;
  return `<div class="lab-sel">
    <span>${esc(l)}</span>
    <button type="button" class="lab-sel-trigger" data-dropf="${esc(k)}" aria-haspopup="listbox" aria-expanded="${isOpen}">
      <span class="lab-sel-value">${esc(cur ? cur[1] : '')}</span>
      <i class="lab-sel-arrow" aria-hidden="true"></i>
    </button>
    <div class="lab-sel-options${isOpen ? ' open' : ''}" role="listbox" style="display:${isOpen ? 'flex' : 'none'}">
      ${opts.map(([a, b]) => `<button type="button" role="option" class="lab-sel-option${String(a) === String(v) ? ' is-active' : ''}" data-dropf="${esc(k)}" data-value="${esc(a)}" aria-selected="${String(a) === String(v)}">${esc(b)}</button>`).join('')}
    </div>
  </div>`;
}

function onDropSheetClick(e) {
  const trig = e.target.closest('.lab-sel-trigger');
  if (trig) {
    e.preventDefault(); e.stopPropagation();
    const k = trig.dataset.dropf;
    openDrop = openDrop === k ? null : k;
    render();
    return;
  }
  const opt = e.target.closest('.lab-sel-option');
  if (opt) {
    e.preventDefault(); e.stopPropagation();
    const k = opt.dataset.dropf;
    const val = opt.dataset.value;
    openDrop = null;
    if (k === '__views') { currentView = val; if (val) X.applyView(val); else render(); }
    else X.setFilter(k, val);
    return;
  }
}

function onDropDocClick(e) {
  if (!openDrop) return;
  if (e.target.closest('.lab-sel')) return;
  openDrop = null;
  render();
}
function slider(k, l, v, min, max, step) {
  return `<div class="lab-slider"><span>${esc(l)}<b>${step < 1 ? Number(v).toFixed(2) : v}</b></span>
    <input type="range" data-s="${k}" min="${min}" max="${max}" step="${step}" value="${v}"></div>`;
}
function empty(t, s) { return `<div class="lab-empty"><b>${esc(t)}</b><span>${esc(s)}</span></div>`; }

function spectrum(rows) {
  const top = rows.filter(r => r.n > 0).slice(0, 6);
  if (!top.length) return '<div class="lab-spec" data-empty="1"><i style="--h:6%"></i><i style="--h:6%"></i><i style="--h:6%"></i></div>';
  const max = Math.max(...top.map(r => r.score), 0.01);
  return `<div class="lab-spec">${top.map(r => `<i style="--h:${Math.max(8, Math.round(r.score / max * 100))}%" data-ok="${r.eligible}" title="${esc(r.move)} · ${pct(r.score)}%"></i>`).join('')}</div>`;
}

function posCard(r, sel, s) {
  const b = r.best;
  return `<article class="lab-pos" data-key="${esc(r.P.key)}" draggable="true" data-open="${r.P.id}">
    <div class="lab-pos-top">
      <span class="lab-grip">${I.grip}</span>
      <input type="checkbox" class="lab-check" data-sel="${esc(r.P.key)}" ${sel.has(r.P.key) ? 'checked' : ''} aria-label="Selecciona ${esc(r.P.id)}">
      <b class="lab-id">${esc(r.P.id)}</b>
      <span class="lab-turn" data-s="${r.P.turn}">${r.P.turn === 'w' ? 'blanques' : 'negres'}</span>
      <span class="lab-ply">jugada ${r.P.firstPly}</span>
      ${r.observations ? '' : '<span class="lab-nodata">sense dades</span>'}
    </div>
    <div class="lab-pos-body">
      ${spectrum(r.rows)}
      <div class="lab-pos-nums">
        <span><b>${r.observations}</b> obs</span>
        <span><b>${r.played}</b>/${r.candidates} jugades</span>
        <span data-ok="${r.eligible > 0}"><b>${r.eligible}</b> sòlides</span>
        ${b ? `<span class="lab-best">${esc(b.move)} · ${pct(b.score)}%</span>` : '<span class="lab-best" data-none="1">cap recomanació</span>'}
      </div>
    </div>
  </article>`;
}

function gameRow(g) {
  return `<article class="lab-game" data-id="${g.id}">
    <span class="lab-res" data-s="${g.result}">${g.result === 'w' ? '1-0' : g.result === 'b' ? '0-1' : '½-½'}</span>
    <div class="lab-game-b">
      <b>${esc(g.label || g.id)}</b>
      <span>${fmt(g.date)} · ${g.plies} mitges jugades · ${esc(g.source)}</span>
    </div>
    <button type="button" class="lab-mini" data-delgame="${g.id}" aria-label="Retira">${I.trash}</button>
  </article>`;
}

function importBox() {
  const games = importMode !== 'library';
  const notation = importMode === 'notation';
  return `<div class="lab-import">
    <div class="lab-import-head">
      <b>${notation ? 'Importa notació' : games ? 'Afegeix partides' : 'Importa biblioteca'}</b>
      <span>${games
        ? 'Notació: 0e2>0e4 · vertical 0e2>1e2 · promoció 0e7>0e8=q · enroc internivell 0e1<>1e1. Una partida per bloc, amb «# result: 1-0».'
        : 'Enganxa el fitxer de biblioteca exportat, o tria’l del disc.'}</span>
      <button type="button" class="lab-mini" data-importcancel="1" aria-label="Tanca">${I.x}</button>
    </div>
    <div class="lab-import-body">
      <textarea id="lab-ta" spellcheck="false" placeholder="${games
        ? '# result: 1-0\n# source: autopartida\n# label: Auto 001 · material\n0e2>0e4 0e7>0e5 0g1>0f3 0b8>0c6\n0f1>1f1 0e5>1e5'
        : '{ "meta": {...}, "games": [...], "positions": {...} }'}">${esc(importText)}</textarea>
      <div class="lab-import-side">
        <input type="file" id="lab-file" accept="${notation ? '.txt,text/plain' : '.txt,.json,text/plain,application/json'}">
        <button type="button" class="lab-ghost" data-validate="1">Valida i previsualitza</button>
        ${preview ? `<div class="lab-diff" data-ok="${preview.ok}">
          ${preview.ok
            ? (games
              ? `<b>${preview.games.length} partides llegides</b>
                 <span>${preview.games.reduce((a, g) => a + g.plies, 0)} mitges jugades en total</span>
                 ${preview.errors.length ? `<span class="lab-warn">${preview.errors.length} avisos</span>` : ''}
                 <button type="button" class="lab-solid" data-apply="1">Incorpora</button>`
              : `<b>Biblioteca vàlida</b><span>Partides: ${preview.diff.games >= 0 ? '+' : ''}${preview.diff.games}</span>
                 <span>Posicions: ${preview.diff.positions >= 0 ? '+' : ''}${preview.diff.positions}</span>
                 <button type="button" class="lab-solid" data-apply="1">Aplica</button>`)
            : `<b>No s’ha pogut llegir</b><ul>${preview.errors.slice(0, 6).map(e => `<li>${esc(e)}</li>`).join('')}</ul>`}
        </div>` : ''}
        ${games ? `<details class="lab-help"><summary>Format acceptat</summary>
          <p>També acceptes JSON amb <code>moves</code> i <code>result</code>, o una llista de partides. Els números de jugada (<code>1.</code>) s’ignoren.</p>
          <p>El resultat es pot posar al final de la línia: <code>1-0</code>, <code>0-1</code>, <code>1/2</code>.</p></details>` : ''}
      </div>
    </div>
  </div>`;
}

function toastBar() {
  const t = X.toast();
  if (!t) return '';
  return `<div class="lab-toast" role="status"><span>${esc(t.text)}</span>
    ${t.undo ? '<button type="button" data-undo="1">Desfés</button>' : ''}
    <button type="button" class="lab-mini" data-toastx="1" aria-label="Tanca">${I.x}</button></div>`;
}

/* ---------- drawer ---------- */

function renderDrawer() {
  const P = X.activePosition();
  if (!P) { drawer.hidden = true; drawer.innerHTML = ''; return; }
  const s = X.settings();
  const rows = X.moveRows(P, s);
  const sug = X.suggest(P.key);
  drawer.hidden = false;
  drawer.innerHTML = `
    <header><div><b>Posició ${esc(P.id)}</b><span>torn ${P.turn === 'w' ? 'blanques' : 'negres'} · primera aparició a la jugada ${P.firstPly}</span></div>
      <button type="button" class="lab-mini" data-dclose="1" aria-label="Tanca">${I.x}</button></header>
    <div class="lab-boards">${miniBoard(P.snapshot, 1)}${miniBoard(P.snapshot, 0)}</div>
    ${sug ? `<div class="lab-sug"><span>Experiència recomana</span><b>${esc(sug.move)}</b>
      <i>${pct(sug.score)}% · confiança ${pct(sug.confidence)}% · ${sug.n} obs</i>
      ${sug.alternatives.length ? `<em>alternatives: ${sug.alternatives.map(esc).join(', ')}</em>` : ''}</div>`
      : `<div class="lab-sug" data-none="1"><span>Experiència insuficient</span><b>cap jugada sòlida</b>
      <i>Cal més observacions o baixar els llindars. El motor ha de decidir amb la seva avaluació.</i></div>`}
    <table class="lab-table">
      <thead><tr><th>Jugada</th><th>Tipus</th><th>N</th><th>G/E/P</th><th>Brut</th><th>Conf.</th><th>Punt</th><th></th></tr></thead>
      <tbody>${rows.map(r => `<tr data-ok="${r.eligible}" data-zero="${r.n === 0}">
        <td class="lab-mv">${esc(r.move)}</td>
        <td><span class="lab-kind" data-k="${esc(r.kind)}">${esc(r.kind)}</span></td>
        <td>${r.n}</td>
        <td class="lab-wdl">${r.rec.w}/${r.rec.d}/${r.rec.l}</td>
        <td>${r.n ? pct(r.raw) + '%' : '—'}</td>
        <td>${r.n ? pct(r.conf) + '%' : '—'}</td>
        <td><b>${r.n ? pct(r.score) + '%' : '—'}</b></td>
        <td>${r.n ? `<button type="button" class="lab-mini" data-delmove="${esc(r.move)}" aria-label="Retira">${I.trash}</button>` : ''}</td>
      </tr>`).join('')}</tbody>
    </table>
    <p class="lab-note">Les jugades amb N=0 són candidates calculades del reglament, encara sense experiència. «Brut» és el resultat directe; «Conf.» el penalitza quan hi ha poques mostres; «Punt» combina els dos segons el pes ajustat.</p>
    <button type="button" class="lab-danger" data-delpos="${esc(P.key)}">${I.trash}<span>Esborra la posició</span></button>
  `;
  drawer.querySelector('[data-dclose]').addEventListener('click', () => X.setActive(null));
  drawer.querySelectorAll('[data-delmove]').forEach(b => b.addEventListener('click', () => X.dropMove(P.key, b.dataset.delmove)));
  drawer.querySelector('[data-delpos]').addEventListener('click', () => { X.dropPositions([P.key]); X.setActive(null); });
}

/* ---------- events ---------- */

function wire() {
  sheet.querySelectorAll('[data-f]').forEach(el => {
    const live = el.dataset.f === 'q';
    el.addEventListener(live ? 'input' : 'change', () => {
      const pos = el.selectionStart;
      X.setFilter(el.dataset.f, el.value);
      if (live) { const n = sheet.querySelector('#lab-q'); n?.focus(); try { n?.setSelectionRange(pos, pos); } catch { /* search */ } }
    });
  });
  sheet.querySelectorAll('[data-s]').forEach(el => {
    el.addEventListener('input', () => {
      const b = el.closest('.lab-slider')?.querySelector('b');
      if (b) b.textContent = Number(el.step) < 1 ? Number(el.value).toFixed(2) : el.value;
    });
    el.addEventListener('change', () => X.setSetting(el.dataset.s, el.value));
  });
  sheet.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => X.setFilter(b.dataset.t, b.dataset.on !== 'true')));
  sheet.querySelector('[data-clear]')?.addEventListener('click', async () => {
    if (!window.confirm('Vols esborrar totes les partides de la biblioteca? Aquesta acció no es pot desfer.')) return;
    try {
      await X.clearAllGames();
      gamesPage = 0;
      stats = X.query();
      msg = '';
      render();
    } catch (error) {
      console.error('[lab] No s’ha pogut buidar la biblioteca:', error);
      window.alert('No s’ha pogut buidar la biblioteca: ' + (error?.message || error));
    }
  });
  sheet.querySelector('[data-close]')?.addEventListener('click', () => setOpen(false));
  sheet.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { mobileTab = b.dataset.tab; render(); }));
  sheet.querySelector('[data-calcstats]')?.addEventListener('click', () => { stats = X.query(); render(); });
  sheet.querySelectorAll('[data-game-page]').forEach(b => b.addEventListener('click', () => {
    gamesPage = Number(b.dataset.gamePage);
    render();
  }));

  sheet.querySelectorAll('[data-sel]').forEach(c => c.addEventListener('change', e => { e.stopPropagation(); X.toggleSelect(c.dataset.sel); }));
  sheet.querySelector('[data-unsel]')?.addEventListener('click', () => X.selectMany([...X.getSelection()], false));
  sheet.querySelector('[data-bulkdel]')?.addEventListener('click', () => X.dropPositions([...X.getSelection()]));
  sheet.querySelectorAll('[data-delgame]').forEach(b => b.addEventListener('click', () => X.dropGames([b.dataset.delgame])));

  sheet.querySelectorAll('.lab-pos').forEach(el => {
    el.addEventListener('click', e => { if (!e.target.closest('input,button,.lab-grip')) X.setActive(el.dataset.key); });
    el.addEventListener('dragstart', e => { dragKey = el.dataset.key; el.dataset.dragging = '1'; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragKey); } catch { /* Safari */ } });
    el.addEventListener('dragend', () => { delete el.dataset.dragging; dragKey = null; });
    el.addEventListener('dragover', e => { if (dragKey && el.dataset.key !== dragKey) { e.preventDefault(); el.dataset.over = '1'; } });
    el.addEventListener('dragleave', () => { delete el.dataset.over; });
    el.addEventListener('drop', e => { e.preventDefault(); delete el.dataset.over; if (dragKey) X.reorder(dragKey, el.dataset.key); });
  });

  sheet.querySelectorAll('[data-undo]').forEach(b => b.addEventListener('click', () => X.undo()));
  sheet.querySelector('[data-reset]')?.addEventListener('click', () => X.resetDraft());
  sheet.querySelector('[data-prune]')?.addEventListener('click', () => { const r = X.prune(); msg = ''; render(); void r; });
  sheet.querySelector('[data-toastx]')?.addEventListener('click', () => X.dismissToast());

  sheet.querySelector('[data-saveview]')?.addEventListener('click', () => {
    const n = prompt('Nom de la vista:');
    if (n) { const r = X.saveView(n); msg = r.ok ? '' : r.message; render(); }
  });
  sheet.querySelector('[data-dropview]')?.addEventListener('click', () => {
    if (currentView) { X.dropView(currentView); currentView = ''; }
  });

  sheet.querySelector('[data-export]')?.addEventListener('click', () => {
    exportLibrary();
  });
  sheet.querySelector('[data-save-export]')?.addEventListener('click', exportLibrary);

  sheet.querySelector('[data-ingest]')?.addEventListener('click', () => { importMode = 'games'; importText = ''; preview = null; render(); });
  sheet.querySelector('[data-notation-import]')?.addEventListener('click', () => { importMode = 'notation'; importText = ''; preview = null; msg = ''; render(); });
  sheet.querySelector('[data-libimport]')?.addEventListener('click', () => { importMode = 'library'; importText = ''; preview = null; render(); });
  sheet.querySelector('[data-importcancel]')?.addEventListener('click', () => { importMode = null; preview = null; render(); });
  sheet.querySelector('#lab-ta')?.addEventListener('input', e => { importText = e.target.value; });
  sheet.querySelector('#lab-file')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    importText = await file.text();
    preview = importMode === 'library' ? X.parseLibrary(importText) : X.parseGames(importText);
    render();
  });
  sheet.querySelector('[data-validate]')?.addEventListener('click', () => {
    importText = sheet.querySelector('#lab-ta')?.value || importText;
    preview = importMode === 'library' ? X.parseLibrary(importText) : X.parseGames(importText);
    render();
  });
  sheet.querySelector('[data-apply]')?.addEventListener('click', () => {
    if (!preview?.ok) return;
    if (importMode !== 'library') {
      const notation = importMode === 'notation';
      const r = X.ingest(preview.games);
      if (notation) {
        msg = `${r.added} partides incorporades, ${r.skipped} duplicades descartades.`;
        importMode = null; preview = null; importText = '';
      } else {
        msg = r.ok ? '' : r.message;
        if (r.ok) { importMode = null; preview = null; importText = ''; }
      }
    } else {
      X.applyLibrary(preview.doc);
      importMode = null; preview = null; importText = '';
    }
    render();
  });
}

function exportLibrary() {
  const text = X.exportText();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  a.download = 'ecit-experience.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
