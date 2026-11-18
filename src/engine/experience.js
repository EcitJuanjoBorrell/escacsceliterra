// src/engine/experience.js
'use strict';
/* Biblioteca d'experiència per a Escacs Cel i Terra.

   Aquest joc no té teoria publicada: cap llibre d'obertures, cap base de
   partides. L'experiència s'ha de fabricar. Aquest mòdul és la peça que
   l'acumula: rep partides en notació de coordenades, les repassa sobre els
   dos taulells, i converteix cada posició en estadístiques de moviment.

   No valida la legalitat: confia que les jugades venen del motor o d'una
   partida real. Sí que reprodueix el llibre de regles del joc (conversió en
   fantasmes, mort definitiva al Cel, promoció de descens, enrocs) perquè la
   clau de posició sigui fidel als dos mons. */

import seed from './experience.data.json';

const K_LIB = 'ecit.exp.library.v1';
const K_VIEWS = 'ecit.exp.views.v1';

export const TYPES = ['p', 'n', 'b', 'r', 'q', 'k'];
const GLYPH = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };
export const glyph = t => GLYPH[t] || '?';

const clone = o => JSON.parse(JSON.stringify(o));
const today = () => new Date().toISOString().slice(0, 10);
const uid = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const FILES = 'abcdefgh';

/* ---------- taulell inicial ---------- */

export function initialBoards() {
  const b = [Array.from({ length: 8 }, () => Array(8).fill(null)),
             Array.from({ length: 8 }, () => Array(8).fill(null))];
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let f = 0; f < 8; f++) {
    b[0][0][f] = { t: back[f], s: 'w', g: 0 };
    b[0][1][f] = { t: 'p', s: 'w', g: 0 };
    b[0][6][f] = { t: 'p', s: 'b', g: 0 };
    b[0][7][f] = { t: back[f], s: 'b', g: 0 };
  }
  return b;
}

/* ---------- clau de posició ---------- */

function cell(p) { return p ? p.t + p.s + (p.g ? 'g' : '') : '.'; }

export function positionKey(boards, turn, rights, ep) {
  const rows = [];
  for (let l = 0; l < 2; l++) {
    for (let r = 7; r >= 0; r--) rows.push(boards[l][r].map(cell).join(''));
  }
  return rows.join('/') + '|' + turn + '|' + (rights || '-') + '|' + (ep || '-');
}

export function shortKey(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36).slice(0, 7);
}

/* ---------- notació ---------- */

const MOVE_RE = /^([01])?([a-h])([1-8])\s*(<>|[-=>]+)\s*([01])?([a-h])([1-8])(?:=([nbrq]))?$/i;

export function parseMove(token) {
  const m = MOVE_RE.exec(String(token).trim());
  if (!m) return null;
  const fromL = m[1] === undefined ? 0 : Number(m[1]);
  const toL = m[4] === undefined ? fromL : Number(m[4]);
  return {
    from: { l: fromL, f: FILES.indexOf(m[2].toLowerCase()), r: Number(m[3]) - 1 },
    to: { l: toL, f: FILES.indexOf(m[5].toLowerCase()), r: Number(m[6]) - 1 },
    swap: m[4] === undefined ? false : m[3 + 1] === '<>',
    promo: m[7] ? m[7].toLowerCase() : null
  };
}

export function moveText(mv) {
  const a = mv.from.l + FILES[mv.from.f] + (mv.from.r + 1);
  const b = mv.to.l + FILES[mv.to.f] + (mv.to.r + 1);
  return a + (mv.swap ? '<>' : '>') + b + (mv.promo ? '=' + mv.promo : '');
}

export function moveKind(boards, mv) {
  if (mv.swap) return 'enroc';
  if (mv.from.l !== mv.to.l) return 'vertical';
  const p = boards[mv.from.l][mv.from.r][mv.from.f];
  const target = boards[mv.to.l][mv.to.r][mv.to.f];
  if (target) return 'captura';
  if (p && p.t === 'p' && mv.from.f !== mv.to.f) return 'al pas';
  return 'clàssic';
}

/* ---------- repàs de la partida ---------- */

function rightsAfter(rights, boards, mv, piece) {
  let R = { wK: rights.wK, wQ: rights.wQ, bK: rights.bK, bQ: rights.bQ, x: rights.x };
  if (!piece) return R;
  if (piece.t === 'k') {
    if (piece.s === 'w') { R.wK = false; R.wQ = false; } else { R.bK = false; R.bQ = false; }
    R.x = false;
  }
  if (piece.t === 'r' && mv.from.l === 0) {
    if (piece.s === 'w' && mv.from.r === 0) { if (mv.from.f === 0) R.wQ = false; if (mv.from.f === 7) R.wK = false; }
    if (piece.s === 'b' && mv.from.r === 7) { if (mv.from.f === 0) R.bQ = false; if (mv.from.f === 7) R.bK = false; }
  }
  return R;
}

function rightsToken(R) {
  const s = (R.wK ? 'K' : '') + (R.wQ ? 'Q' : '') + (R.bK ? 'k' : '') + (R.bQ ? 'q' : '') + (R.x ? 'x' : '');
  return s || '-';
}

/** Aplica una jugada seguint el reglament v1.1. Retorna el tipus o null si és impossible. */
export function applyMove(boards, mv, turn) {
  const src = boards[mv.from.l][mv.from.r][mv.from.f];
  if (!src) return null;

  if (mv.swap) {
    const dst = boards[mv.to.l][mv.to.r][mv.to.f];
    if (!dst || mv.from.l === mv.to.l) return null;
    boards[mv.from.l][mv.from.r][mv.from.f] = dst;
    boards[mv.to.l][mv.to.r][mv.to.f] = src;
    return 'enroc';
  }

  const kind = moveKind(boards, mv);
  const victim = boards[mv.to.l][mv.to.r][mv.to.f];

  /* Mort al Cel: surt dels dos taulells per sempre. */
  if (victim && mv.to.l === 1) boards[1][mv.to.r][mv.to.f] = null;

  /* Conversió: capturem a la Terra i la peça puja al Cel canviant de bàndol. */
  if (victim && mv.to.l === 0) {
    const above = boards[1][mv.to.r][mv.to.f];
    if (!above) boards[1][mv.to.r][mv.to.f] = { t: victim.t, s: victim.s === 'w' ? 'b' : 'w', g: 1 };
    boards[0][mv.to.r][mv.to.f] = null;
  }

  /* Captura al pas: la víctima és el peó veí que acaba de fer el doble pas. */
  if (kind === 'al pas') {
    const vr = mv.to.r + (src.s === 'w' ? -1 : 1);
    const v = boards[0][vr]?.[mv.to.f];
    if (v && v.t === 'p') {
      boards[0][vr][mv.to.f] = null;
      if (!boards[1][vr][mv.to.f]) boards[1][vr][mv.to.f] = { t: 'p', s: v.s === 'w' ? 'b' : 'w', g: 1 };
    }
  }

  boards[mv.from.l][mv.from.r][mv.from.f] = null;
  let moved = { t: src.t, s: src.s, g: src.g };

  /* Promoció només a l'última fila de la Terra. Els fantasmes no promocionen. */
  if (moved.t === 'p' && !moved.g && mv.to.l === 0 && (mv.to.r === 7 || mv.to.r === 0)) {
    moved.t = mv.promo || 'q';
  }
  boards[mv.to.l][mv.to.r][mv.to.f] = moved;

  /* Enroc clàssic: la torre acompanya el rei. */
  if (kind === 'clàssic' && src.t === 'k' && Math.abs(mv.to.f - mv.from.f) === 2 && mv.from.l === mv.to.l) {
    const r = mv.from.r;
    const short = mv.to.f > mv.from.f;
    const rf = short ? 7 : 0, nf = short ? 5 : 3;
    const rook = boards[mv.from.l][r][rf];
    if (rook && rook.t === 'r') {
      boards[mv.from.l][r][rf] = null;
      boards[mv.from.l][r][nf] = rook;
    }
  }
  return kind;
}

function epToken(boards, mv, piece) {
  if (!piece || piece.t !== 'p' || mv.from.l !== 0 || mv.to.l !== 0) return '-';
  if (Math.abs(mv.to.r - mv.from.r) !== 2) return '-';
  return FILES[mv.from.f] + (mv.from.r + (piece.s === 'w' ? 3 : 6));
}

/** Repassa una partida i retorna totes les posicions amb la jugada feta. */
export function replay(moves) {
  const boards = initialBoards();
  let turn = 'w';
  let rights = { wK: true, wQ: true, bK: true, bQ: true, x: true };
  let ep = '-';
  const trail = [];
  const errors = [];

  moves.forEach((mv, i) => {
    const piece = boards[mv.from.l][mv.from.r][mv.from.f];
    if (!piece) { errors.push({ ply: i + 1, move: moveText(mv), why: 'casella d’origen buida' }); return; }
    if (piece.s !== turn) { errors.push({ ply: i + 1, move: moveText(mv), why: 'no és el torn d’aquest bàndol' }); return; }
    const key = positionKey(boards, turn, rightsToken(rights), ep);
    const kind = applyMove(boards, mv, turn);
    if (!kind) { errors.push({ ply: i + 1, move: moveText(mv), why: 'jugada no reproduïble' }); return; }
    trail.push({ key, move: moveText(mv), kind, ply: i + 1, turn, snapshot: clone(boards) });
    rights = rightsAfter(rights, boards, mv, piece);
    ep = epToken(boards, mv, piece);
    turn = turn === 'w' ? 'b' : 'w';
  });

  return { trail, errors, boards, turn };
}

/* ---------- lectura de partides en text ---------- */

const RESULTS = { '1-0': 'w', '0-1': 'b', '1/2-1/2': 'd', '1/2': 'd', '½-½': 'd', 'draw': 'd', 'white': 'w', 'black': 'b', 'blanques': 'w', 'negres': 'b', 'taules': 'd' };

export function parseGames(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!raw) return { ok: false, errors: ['Enganxa almenys una partida.'] };

  let docs;
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const j = JSON.parse(raw);
      docs = Array.isArray(j) ? j : (Array.isArray(j.games) ? j.games : [j]);
    } catch (e) { return { ok: false, errors: ['JSON no vàlid: ' + e.message] }; }
    docs = docs.map(d => ({
      result: RESULTS[String(d.result ?? d.outcome ?? d.winner ?? '').toLowerCase()] || 'd',
      moves: Array.isArray(d.moves) ? d.moves : (Array.isArray(d.history) ? d.history : []),
      source: d.source || 'importat',
      date: d.date || today(),
      label: d.label || d.id || ''
    }));
  } else {
    docs = [];
    raw.split(/\n\s*\n/).forEach(block => {
      const lines = block.split('\n').filter(l => l.trim() && !/^\s*#(?!\s*result)/.test(l));
      if (!lines.length) return;
      let result = 'd', source = 'manual', label = '', date = today();
      const body = [];
      lines.forEach(l => {
        const meta = /^\s*#\s*(result|resultat|source|font|label|etiqueta|date|data)\s*:\s*(.+)$/i.exec(l);
        if (meta) {
          const k = meta[1].toLowerCase(), v = meta[2].trim();
          if (k === 'result' || k === 'resultat') result = RESULTS[v.toLowerCase()] || 'd';
          else if (k === 'source' || k === 'font') source = v;
          else if (k === 'label' || k === 'etiqueta') label = v;
          else date = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : today();
          return;
        }
        body.push(l);
      });
      let text2 = body.join(' ').replace(/\b\d+\.(\.\.)?/g, ' ');
      const tail = /(1-0|0-1|1\/2-1\/2|1\/2|½-½)\s*$/.exec(text2);
      if (tail) { result = RESULTS[tail[1]] || result; text2 = text2.slice(0, tail.index); }
      const moves = text2.split(/[\s,;]+/).filter(Boolean);
      if (moves.length) docs.push({ result, moves, source, date, label });
    });
  }

  const games = [], errors = [];
  docs.forEach((d, i) => {
    const moves = [];
    d.moves.forEach((tk, j) => {
      const mv = typeof tk === 'string' ? parseMove(tk) : tk;
      if (!mv) errors.push('Partida ' + (i + 1) + ', jugada ' + (j + 1) + ': no entenc «' + tk + '».');
      else moves.push(mv);
    });
    if (!moves.length) { errors.push('Partida ' + (i + 1) + ': cap jugada llegible.'); return; }
    const { trail, errors: repErr } = replay(moves);
    if (!trail.length) { errors.push('Partida ' + (i + 1) + ': no s’ha pogut repassar (' + (repErr[0]?.why || 'buit') + ').'); return; }
    games.push({
      id: uid('g'), date: d.date, result: d.result, source: d.source,
      label: d.label || 'Partida ' + (i + 1), plies: trail.length,
      hash: fingerprint(moves, d.result), trail, warnings: repErr
    });
  });

  if (!games.length) return { ok: false, errors: errors.length ? errors : ['Cap partida aprofitable.'] };
  return { ok: true, games, errors };
}

function fingerprint(moves, result) {
  const s = moves.map(moveText).join(' ') + '|' + result;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/* ---------- estadística ---------- */

/** Límit inferior de Wilson: penalitza les jugades amb poques observacions. */
export function wilson(wins, draws, n, z = 1.96) {
  if (!n) return 0;
  const p = (wins + draws * 0.5) / n;
  const d = 1 + z * z / n;
  const centre = p + z * z / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p) + draws * 0.25 / n) / n);
  return Math.max(0, (centre - spread) / d);
}

export function moveScore(rec, resultWeight) {
  const n = rec.w + rec.d + rec.l;
  if (!n) return 0;
  const raw = (rec.w + rec.d * 0.5) / n;
  const conf = wilson(rec.w, rec.d, n);
  return resultWeight * conf + (1 - resultWeight) * raw;
}

function blankRec() { return { w: 0, d: 0, l: 0, plies: [], last: null, kinds: {} }; }

function aggregate(games, maxPly) {
  const positions = {};
  games.forEach(g => {
    g.trail.forEach(step => {
      if (step.ply > maxPly) return;
      const P = positions[step.key] || (positions[step.key] = {
        key: step.key, id: shortKey(step.key), turn: step.turn,
        firstPly: step.ply, snapshot: step.snapshot, moves: {}, seen: 0
      });
      P.seen++;
      P.firstPly = Math.min(P.firstPly, step.ply);
      const rec = P.moves[step.move] || (P.moves[step.move] = blankRec());
      const mover = step.turn;
      if (g.result === 'd') rec.d++;
      else if (g.result === mover) rec.w++;
      else rec.l++;
      rec.plies.push(step.ply);
      rec.last = g.date;
      rec.kinds[step.kind] = (rec.kinds[step.kind] || 0) + 1;
    });
  });
  return positions;
}

/* ---------- llibre d'obertures ---------- */

/** Esquelet del primer moviment, calculat del taulell inicial. Sense dades encara. */
function openingSkeleton() {
  const boards = initialBoards();
  const key = positionKey(boards, 'w', 'KQkqx', '-');
  const moves = {};
  const add = mv => { moves[moveText(mv)] = Object.assign(blankRec(), { kinds: { [moveKind(boards, mv)]: 0 } }); };

  for (let f = 0; f < 8; f++) {
    add({ from: { l: 0, f, r: 1 }, to: { l: 0, f, r: 2 }, swap: false, promo: null });
    add({ from: { l: 0, f, r: 1 }, to: { l: 0, f, r: 3 }, swap: false, promo: null });
  }
  [[1, 0], [1, 2], [6, 5], [6, 7]].forEach(([f, tf]) =>
    add({ from: { l: 0, f, r: 0 }, to: { l: 0, f: tf, r: 2 }, swap: false, promo: null }));

  for (let r = 0; r < 2; r++) for (let f = 0; f < 8; f++) {
    if (boards[0][r][f]) add({ from: { l: 0, f, r }, to: { l: 1, f, r }, swap: false, promo: null });
  }
  return { [key]: { key, id: shortKey(key), turn: 'w', firstPly: 1, snapshot: boards, moves, seen: 0 } };
}

/* ---------- estat ---------- */

function normalise(doc) {
  const d = clone(doc);
  d.meta = Object.assign({ schema: 1, project: 'Escacs Cel i Terra', rules: '1.1', created: today() }, d.meta || {});
  d.meta.updated = today();
  d.settings = Object.assign({ minObservations: 3, minConfidence: 0.35, maxPly: 24, resultWeight: 0.7, pruneBelow: 0.2 }, d.settings || {});
  d.games = Array.isArray(d.games) ? d.games : [];
  d.positions = d.positions && typeof d.positions === 'object' ? d.positions : {};
  return d;
}

let canonical = normalise(seed);
if (!Object.keys(canonical.positions).length) canonical.positions = openingSkeleton();

let draft = null;
try {
  const raw = localStorage.getItem(K_LIB);
  if (raw) { const p = JSON.parse(raw); if (p && p.positions) draft = normalise(p); }
} catch { draft = null; }

const DEFAULT_F = { q: '', sort: 'observacions', kind: 'tots', onlyData: false, dense: false, level: 'tots' };
let filters = Object.assign({}, DEFAULT_F);
let views = [];
try { views = JSON.parse(localStorage.getItem(K_VIEWS) || '[]'); } catch { views = []; }

let selection = new Set();
let undoStack = [];
let listeners = new Set();
let lastToast = null;
let activeKey = null;

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error('[exp]', e); } }); }

const store = () => draft || canonical;
export function library() { return store(); }
export function isDraft() { return Boolean(draft); }
export function settings() { return Object.assign({}, store().settings); }
export function getFilters() { return Object.assign({}, filters); }
export function getViews() { return views.slice(); }
export function getSelection() { return new Set(selection); }
export function activePosition() { return activeKey ? store().positions[activeKey] || null : null; }
export function setActive(key) { activeKey = key; emit(); }
export function canUndo() { return undoStack.length > 0; }
export function toast() { return lastToast; }
export function dismissToast() { lastToast = null; emit(); }

function persist() {
  try { localStorage.setItem(K_LIB, JSON.stringify(draft)); } catch { /* storage ple */ }
}

export function mutate(label, fn) {
  const before = clone(store());
  const next = draft ? draft : clone(canonical);
  draft = next;
  fn(draft);
  draft.meta.updated = today();
  undoStack.push({ label, snapshot: before });
  if (undoStack.length > 25) undoStack.shift();
  persist();
  lastToast = { text: label, undo: true };
  emit();
  return { ok: true };
}

export function undo() {
  const step = undoStack.pop();
  if (!step) return { ok: false, message: 'No hi ha res per desfer.' };
  draft = step.snapshot;
  persist(); selection.clear();
  lastToast = { text: 'Desfet: ' + step.label, undo: false };
  emit();
  return { ok: true };
}

export function resetDraft() {
  draft = null; undoStack = []; selection.clear(); activeKey = null;
  try { localStorage.removeItem(K_LIB); } catch { /* res */ }
  lastToast = { text: 'Esborrany descartat. Es mostra la biblioteca publicada.', undo: false };
  emit();
}

export function setSetting(key, value) {
  if (!(key in store().settings)) return;
  const v = Number(value);
  if (!Number.isFinite(v)) return;
  mutate('Paràmetre ajustat', d => { d.settings[key] = v; rebuild(d); });
}

export function setFilter(key, value) {
  if (!(key in filters)) return;
  filters[key] = value; emit();
}
export function clearFilters() { filters = Object.assign({}, DEFAULT_F); emit(); }

export function saveView(name) {
  const n = String(name || '').trim();
  if (!n) return { ok: false, message: 'Posa un nom a la vista.' };
  views = views.filter(v => v.name !== n);
  views.push({ name: n, filters: Object.assign({}, filters) });
  try { localStorage.setItem(K_VIEWS, JSON.stringify(views)); } catch { /* res */ }
  emit(); return { ok: true };
}
export function applyView(name) {
  const v = views.find(x => x.name === name);
  if (v) { filters = Object.assign({}, DEFAULT_F, v.filters); emit(); }
}
export function dropView(name) {
  views = views.filter(v => v.name !== name);
  try { localStorage.setItem(K_VIEWS, JSON.stringify(views)); } catch { /* res */ }
  emit();
}

/* ---------- reconstrucció ---------- */

function rebuild(d) {
  const kept = d.games.map(g => ({
    id: g.id, date: g.date, result: g.result, source: g.source, label: g.label,
    plies: g.plies, hash: g.hash,
    trail: g.trail || replay((g.moves || []).map(m => typeof m === 'string' ? parseMove(m) : m).filter(Boolean)).trail
  })).filter(g => g.trail && g.trail.length);
  d.games = kept;
  const agg = aggregate(kept, d.settings.maxPly);
  const skeleton = openingSkeleton();
  Object.keys(skeleton).forEach(k => {
    if (!agg[k]) { agg[k] = skeleton[k]; return; }
    Object.keys(skeleton[k].moves).forEach(m => { if (!agg[k].moves[m]) agg[k].moves[m] = skeleton[k].moves[m]; });
  });
  d.positions = agg;
}

export function ingest(games) {
  const d = store();
  const known = new Set(d.games.map(g => g.hash));
  const fresh = games.filter(g => !known.has(g.hash));
  if (!fresh.length) return { ok: false, message: 'Totes aquestes partides ja eren a la biblioteca.' };
  mutate(fresh.length + (fresh.length === 1 ? ' partida incorporada' : ' partides incorporades'), lib => {
    fresh.forEach(g => lib.games.push({
      id: g.id, date: g.date, result: g.result, source: g.source, label: g.label,
      plies: g.plies, hash: g.hash, trail: g.trail
    }));
    rebuild(lib);
  });
  return { ok: true, added: fresh.length, skipped: games.length - fresh.length };
}

export function dropGames(ids) {
  const set = new Set(ids);
  return mutate(set.size + ' partides retirades', d => {
    d.games = d.games.filter(g => !set.has(g.id));
    rebuild(d);
  });
}

export function dropMove(key, move) {
  return mutate('Jugada retirada de la posició', d => {
    const P = d.positions[key];
    if (!P) return;
    delete P.moves[move];
    if (!Object.keys(P.moves).length) delete d.positions[key];
  });
}

export function prune() {
  const s = store().settings;
  let removedMoves = 0, removedPos = 0;
  mutate('Poda aplicada', d => {
    Object.keys(d.positions).forEach(k => {
      const P = d.positions[k];
      Object.keys(P.moves).forEach(m => {
        const rec = P.moves[m];
        const n = rec.w + rec.d + rec.l;
        if (n === 0) return;
        if (n < s.minObservations || moveScore(rec, s.resultWeight) < s.pruneBelow) { delete P.moves[m]; removedMoves++; }
      });
      const alive = Object.values(P.moves).some(r => r.w + r.d + r.l > 0);
      if (!alive && P.seen > 0) { delete d.positions[k]; removedPos++; }
    });
  });
  lastToast = { text: 'Poda: ' + removedMoves + ' jugades i ' + removedPos + ' posicions fora', undo: true };
  emit();
  return { removedMoves, removedPos };
}

export function toggleSelect(key) {
  if (selection.has(key)) selection.delete(key); else selection.add(key);
  emit();
}
export function selectMany(keys, on) { keys.forEach(k => on ? selection.add(k) : selection.delete(k)); emit(); }
export function dropPositions(keys) {
  const set = new Set(keys);
  return mutate(set.size + ' posicions esborrades', d => { set.forEach(k => delete d.positions[k]); });
}
export function reorder(fromKey, toKey) {
  return mutate('Ordre manual canviat', d => {
    const keys = Object.keys(d.positions);
    const a = keys.indexOf(fromKey), b = keys.indexOf(toKey);
    if (a < 0 || b < 0 || a === b) return;
    const entries = keys.map(k => [k, d.positions[k]]);
    entries.splice(b, 0, entries.splice(a, 1)[0]);
    d.positions = Object.fromEntries(entries);
  });
}

/* ---------- consulta ---------- */

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function moveRows(P, s) {
  return Object.entries(P.moves).map(([move, rec]) => {
    const n = rec.w + rec.d + rec.l;
    const kind = Object.keys(rec.kinds || {})[0] || 'clàssic';
    return {
      move, rec, n, kind,
      score: moveScore(rec, s.resultWeight),
      conf: wilson(rec.w, rec.d, n),
      raw: n ? (rec.w + rec.d * 0.5) / n : 0,
      avgPly: rec.plies.length ? rec.plies.reduce((a, b) => a + b, 0) / rec.plies.length : 0,
      eligible: n >= s.minObservations && wilson(rec.w, rec.d, n) >= s.minConfidence
    };
  }).sort((a, b) => b.score - a.score || b.n - a.n);
}

export function query() {
  const d = store(), s = d.settings, f = filters;
  let rows = Object.values(d.positions).map(P => {
    const mr = moveRows(P, s);
    const observed = mr.filter(r => r.n > 0);
    const best = observed[0] || null;
    const obs = observed.reduce((a, r) => a + r.n, 0);
    return {
      P, rows: mr, best, observations: obs,
      candidates: mr.length, played: observed.length,
      eligible: observed.filter(r => r.eligible).length,
      confidence: best ? best.conf : 0,
      levelMix: mr.some(r => r.kind === 'vertical') ? 'mix' : 'pla'
    };
  });

  if (f.q) {
    const q = norm(f.q);
    rows = rows.filter(r => norm(r.P.id + ' ' + Object.keys(r.P.moves).join(' ')).includes(q));
  }
  if (f.onlyData) rows = rows.filter(r => r.observations > 0);
  if (f.kind !== 'tots') rows = rows.filter(r => r.rows.some(x => x.kind === f.kind && x.n > 0));
  if (f.level !== 'tots') rows = rows.filter(r => f.level === 'mix' ? r.levelMix === 'mix' : r.levelMix === 'pla');

  const cmp = {
    observacions: (a, b) => b.observations - a.observations,
    confiança: (a, b) => b.confidence - a.confidence,
    puntuacio: (a, b) => (b.best?.score || 0) - (a.best?.score || 0),
    profunditat: (a, b) => a.P.firstPly - b.P.firstPly,
    candidats: (a, b) => b.candidates - a.candidates,
    id: (a, b) => a.P.id.localeCompare(b.P.id)
  }[f.sort] || ((a, b) => b.observations - a.observations);
  rows.sort(cmp);

  const totalObs = rows.reduce((a, r) => a + r.observations, 0);
  const withData = rows.filter(r => r.observations > 0).length;
  const eligible = rows.reduce((a, r) => a + r.eligible, 0);
  const confSum = rows.filter(r => r.best).reduce((a, r) => a + r.confidence, 0);
  const results = { w: 0, b: 0, d: 0 };
  d.games.forEach(g => { results[g.result] = (results[g.result] || 0) + 1; });

  return {
    rows, settings: s, results,
    games: d.games.length,
    positions: Object.keys(d.positions).length,
    withData, totalObs, eligible,
    coverage: rows.length ? Math.round(withData / rows.length * 100) : 0,
    avgConfidence: withData ? confSum / withData : 0,
    updated: d.meta.updated,
    maxPlySeen: d.games.reduce((a, g) => Math.max(a, g.plies), 0)
  };
}

/** Jugada recomanada per a una posició, o null si l’experiència no és prou sòlida. */
export function suggest(key) {
  const d = store(), P = d.positions[key];
  if (!P) return null;
  const rows = moveRows(P, d.settings).filter(r => r.eligible);
  if (!rows.length) return null;
  const top = rows[0];
  return { move: top.move, score: top.score, confidence: top.conf, n: top.n, alternatives: rows.slice(1, 4).map(r => r.move) };
}

/* ---------- import / export ---------- */

export function exportText() {
  const d = clone(store());
  d.meta.updated = today();
  const light = clone(d);
  Object.values(light.positions).forEach(P => { delete P.snapshot; });
  light.games.forEach(g => { g.moves = g.trail.map(t => t.move); delete g.trail; });
  return JSON.stringify(light, null, 2);
}

export function parseLibrary(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!raw) return { ok: false, errors: ['Enganxa el contingut del fitxer de biblioteca.'] };
  let j;
  try { j = JSON.parse(raw); } catch (e) { return { ok: false, errors: ['JSON no vàlid: ' + e.message] }; }
  if (!j.positions && !j.games) return { ok: false, errors: ['No conté «positions» ni «games».'] };
  const d = normalise(j);
  rebuild(d);
  const before = store();
  return {
    ok: true, doc: d,
    diff: {
      games: d.games.length - before.games.length,
      positions: Object.keys(d.positions).length - Object.keys(before.positions).length
    }
  };
}

export function applyLibrary(doc) {
  return mutate('Biblioteca importada', d => {
    d.meta = clone(doc.meta); d.settings = clone(doc.settings);
    d.games = clone(doc.games); d.positions = clone(doc.positions);
    rebuild(d);
  });
}

/* Pont perquè el motor consulti l’experiència sense dependre de la interfície. */
if (typeof window !== 'undefined') {
  window.ECIT_EXPERIENCE = { suggest, positionKey, initialBoards, replay, parseMove, moveText, library, query, subscribe, version: 1 };
}