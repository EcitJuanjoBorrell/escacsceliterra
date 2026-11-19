// src/engine/ecitAdapter.js
'use strict';
/* Pont entre el laboratori d'experiència i el motor real del joc.

   El motor d'Escacs Cel i Terra és propi i no segueix cap API estàndard.
   Aquest mòdul no endevina com es diuen les seves funcions: les descobreix,
   les prova jugant una partida curta, i només es dóna per connectat si la
   prova passa. Si no ho aconsegueix, diu exactament què falta. */

const CAND = {
  initial: ['initialState', 'initial', 'newGame', 'createGame', 'startState', 'initGame', 'setup', 'start', 'reset'],
  legal: ['legalMoves', 'generateMoves', 'genMoves', 'allMoves', 'moves', 'legal', 'enumerate', 'listMoves'],
  apply: ['applyMove', 'makeMove', 'doMove', 'play', 'move', 'push', 'commit'],
  status: ['gameStatus', 'status', 'outcome', 'result', 'terminal', 'evaluateStatus'],
  choose: ['chooseMove', 'bestMove', 'pickMove', 'aiMove', 'search', 'think', 'selectMove'],
  score: ['evaluate', 'score', 'evalPosition', 'staticEval', 'assess'],
  side: ['sideToMove', 'turnOf', 'currentTurn', 'whoseTurn']
};

const WHITE_TOKENS = ['w', 'white', 'WHITE', 'blanques', 0, '0'];
const BLACK_TOKENS = ['b', 'black', 'BLACK', 'negres', 1, '1'];

let api = null;
let manualAttempt = false;
let report = { tried: [], found: {}, missing: [], ok: false, detail: '' };
let listeners = new Set();

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach(f => { try { f(); } catch (e) { console.error('[adapter]', e); } }); }

export function status() { return { ...report, connected: Boolean(api) }; }
export function get() { return api; }

function sources() {
  const out = [];
  if (typeof window !== 'undefined') {
    ['Engine', 'ECIT', 'ecitEngine', 'Rules', 'engine'].forEach(k => {
      if (window[k] && typeof window[k] === 'object') out.push({ name: 'window.' + k, obj: window[k] });
    });
  }
  return out;
}

export function configure(manual) {
  manualAttempt = true;
  const need = ['initial', 'legal', 'apply', 'status'];
  const missing = need.filter(k => typeof manual?.[k] !== 'function');
  if (missing.length) {
    report = { ...report, ok: false, missing, detail: 'Falten funcions obligatòries: ' + missing.join(', ') };
    api = null; emit();
    return { ok: false, missing };
  }
  api = {
    initial: manual.initial,
    legal: manual.legal,
    apply: manual.apply,
    status: manual.status,
    choose: typeof manual.choose === 'function' ? manual.choose : null,
    score: typeof manual.score === 'function' ? manual.score : null,
    side: typeof manual.side === 'function' ? manual.side : null,
    toText: typeof manual.toText === 'function' ? manual.toText : deriveText,
    origin: 'manual'
  };
  const probe = trial(api);
  report = { tried: report.tried, found: { manual: true }, missing: [], ok: probe.ok, detail: probe.detail };
  if (!probe.ok) api = null;
  emit();
  return probe;
}

/* ---------- lectura de formes habituals ---------- */

function sideOf(v) {
  if (v === undefined || v === null) return null;
  if (WHITE_TOKENS.includes(v)) return 'w';
  if (BLACK_TOKENS.includes(v)) return 'b';
  if (typeof v === 'object') return sideOf(v.turn ?? v.side ?? v.toMove);
  return null;
}

function readSide(state) {
  return sideOf(state?.turn) ?? sideOf(state?.toMove) ?? sideOf(state?.side) ?? sideOf(state?.active) ?? null;
}

function readStatus(raw) {
  if (!raw) return { over: false, result: null, check: false };
  if (typeof raw === 'string') {
    const s = raw.toLowerCase();
    if (/mate|mat/.test(s)) return { over: true, result: null, check: true };
    if (/draw|taules|stalemate|ofegat|50|insufficient/.test(s)) return { over: true, result: 'd', check: false };
    if (/white|blanques/.test(s)) return { over: true, result: 'w', check: false };
    if (/black|negres/.test(s)) return { over: true, result: 'b', check: false };
    return { over: false, result: null, check: /check|escac/.test(s) };
  }
  const over = Boolean(raw.over ?? raw.finished ?? raw.ended ?? raw.terminal ?? raw.done ?? raw.gameOver);
  let result = null;
  const r = raw.result ?? raw.winner ?? raw.outcome;
  if (r === 'draw' || r === 'd' || r === 'taules' || r === '1/2') result = 'd';
  else if (sideOf(r)) result = sideOf(r);
  const check = Boolean(raw.check ?? raw.inCheck ?? raw.escac);
  const reason = String(raw.reason ?? raw.kind ?? raw.type ?? '').toLowerCase();
  if (!result && /stalemate|ofegat|draw|taules|fifty|50|insufficient|material/.test(reason)) result = 'd';
  return { over: over || Boolean(result), result, check, reason };
}

const F = 'abcdefgh';

function sq(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') {
    const m = /^([a-h])([1-8])$/i.exec(v.trim());
    if (m) return { f: F.indexOf(m[1].toLowerCase()), r: Number(m[2]) - 1, l: null };
    const n = Number(v);
    if (Number.isInteger(n)) return { f: n % 8, r: Math.floor(n / 8) % 8, l: Math.floor(n / 64) };
    return null;
  }
  if (typeof v === 'number') return { f: v % 8, r: Math.floor(v / 8) % 8, l: Math.floor(v / 64) };
  if (Array.isArray(v)) {
    if (v.length >= 3) return { l: v[0], f: v[1], r: v[2] };
    if (v.length === 2) return { f: v[0], r: v[1], l: null };
    return null;
  }
  const f = v.f ?? v.file ?? v.x ?? v.col;
  const r = v.r ?? v.rank ?? v.y ?? v.row;
  const l = v.l ?? v.level ?? v.z ?? v.n ?? v.board;
  if (f === undefined || r === undefined) return null;
  return { f: Number(f), r: Number(r), l: l === undefined ? null : Number(l) };
}

/** Converteix una jugada del motor a la notació del laboratori. */
export function deriveText(mv) {
  if (typeof mv === 'string') return mv;
  if (!mv || typeof mv !== 'object') return null;
  if (typeof mv.notation === 'string') return mv.notation;
  if (typeof mv.text === 'string') return mv.text;
  if (typeof mv.san === 'string' && /^[a-h][1-8]/.test(mv.san)) return mv.san;
  const a = sq(mv.from ?? mv.src ?? mv.a ?? [mv.fl, mv.fx, mv.fy].every(x => x !== undefined) ? { l: mv.fl, f: mv.fx, r: mv.fy } : undefined);
  const b = sq(mv.to ?? mv.dst ?? mv.b ?? [mv.tl, mv.tx, mv.ty].every(x => x !== undefined) ? { l: mv.tl, f: mv.tx, r: mv.ty } : undefined);
  if (!a || !b) return null;
  const al = a.l === null ? 0 : a.l;
  const bl = b.l === null ? al : b.l;
  if (![al, bl].every(x => x === 0 || x === 1)) return null;
  if (![a.f, a.r, b.f, b.r].every(x => Number.isInteger(x) && x >= 0 && x < 8)) return null;
  const promo = mv.promo ?? mv.promotion ?? mv.promote;
  const p = typeof promo === 'string' ? promo.toLowerCase()[0] : null;
  const swap = Boolean(mv.swap ?? mv.interlevelCastle);
  return al + F[a.f] + (a.r + 1) + (swap ? '<>' : '>') + bl + F[b.f] + (b.r + 1) + (p && 'nbrq'.includes(p) ? '=' + p : '');
}

/* ---------- prova real ---------- */

function trial(cand) {
  try {
    const s0 = cand.initial();
    if (!s0 || typeof s0 !== 'object') return { ok: false, detail: 'initial() no retorna un estat.' };
    const ms = cand.legal(s0);
    if (!Array.isArray(ms) || !ms.length) return { ok: false, detail: 'legal(estado inicial) no retorna jugades.' };
    const texts = ms.map(cand.toText).filter(Boolean);
    if (texts.length < ms.length * 0.6) return { ok: false, detail: 'no s’han pogut traduir les jugades a notació de coordenades.' };
    const s1 = cand.apply(s0, ms[0]);
    if (!s1 || typeof s1 !== 'object') return { ok: false, detail: 'apply() no retorna un estat nou.' };
    const st = readStatus(cand.status(s1));
    if (typeof st.over !== 'boolean') return { ok: false, detail: 'status() no informa si la partida ha acabat.' };
    const ms1 = cand.legal(s1);
    if (!Array.isArray(ms1)) return { ok: false, detail: 'legal() falla després d’una jugada.' };
    return { ok: true, detail: ms.length + ' jugades inicials llegides i una aplicada correctament.' };
  } catch (e) {
    return { ok: false, detail: 'Excepció durant la prova: ' + (e?.message || e) };
  }
}

/** Busca una combinació de funcions que funcioni de debò, provant-la. */
export function autoDetect() {
  if (api || manualAttempt) {
    return {
      ok: Boolean(api),
      detail: report.detail || (api ? 'Connexió manual activa.' : 'La connexió manual ha fallat.')
    };
  }
  const tried = [];
  const found = {};
  const srcs = sources();
  if (!srcs.length) {
    report = { tried, found, missing: Object.keys(CAND), ok: false, detail: 'No s’ha trobat cap objecte de motor a window. Cal connectar-lo manualment.' };
    api = null; emit();
    return { ok: false, detail: report.detail };
  }

  for (const src of srcs) {
    const picks = {};
    for (const role of Object.keys(CAND)) {
      const name = CAND[role].find(n => typeof src.obj[n] === 'function');
      if (name) { picks[role] = name; (found[src.name] ||= []).push(role + ' → ' + name); }
    }
    if (!picks.initial || !picks.legal || !picks.apply || !picks.status) {
      tried.push(src.name + ': incomplet (' + Object.keys(picks).join(', ') + ')');
      continue;
    }
    const bind = n => (...a) => src.obj[n](...a);
    const cand = {
      initial: bind(picks.initial),
      legal: bind(picks.legal),
      apply: bind(picks.apply),
      status: s => readStatus(bind(picks.status)(s)),
      choose: picks.choose ? bind(picks.choose) : null,
      score: picks.score ? bind(picks.score) : null,
      side: picks.side ? bind(picks.side) : null,
      toText: deriveText,
      origin: src.name
    };
    const t = trial(cand);
    tried.push(src.name + ': ' + (t.ok ? 'connectat' : t.detail));
    if (t.ok) {
      api = cand;
      report = { tried, found, missing: [], ok: true, detail: t.detail + ' Font: ' + src.name };
      emit();
      return { ok: true, detail: report.detail };
    }
  }

  const missing = ['initial', 'legal', 'apply', 'status'].filter(r => !Object.values(found).some(l => l.some(x => x.startsWith(r + ' '))));
  report = { tried, found, missing, ok: false, detail: 'Cap combinació ha passat la prova. ' + (tried[tried.length - 1] || '') };
  api = null; emit();
  return { ok: false, detail: report.detail };
}

export function disconnect() { api = null; manualAttempt = false; report = { ...report, ok: false, detail: 'Desconnectat manualment.' }; emit(); }

export function sideToMove(state) {
  if (api?.side) { const s = sideOf(api.side(state)); if (s) return s; }
  return readSide(state) || 'w';
}

export function gameStatus(state) { return readStatus(api.status(state)); }

export function wiringTemplate() {
  const names = Object.entries(report.found || {}).flatMap(([src, list]) => list.map(x => src + '.' + x.split(' → ')[1]));
  const guess = n => names.find(x => new RegExp(n, 'i').test(x)) || 'Engine.' + CAND[n][0];
  return `import { configure } from './ecitAdapter.js';
import * as Engine from './rules.js';   // ajusta la ruta al teu motor

configure({
  initial: () => ${guess('initial|newGame|createGame')}(),
  legal:   (s) => ${guess('legal|generate|genMoves')}(s),
  apply:   (s, m) => ${guess('apply|makeMove|doMove')}(s, m),
  status:  (s) => ${guess('gameStatus|status')}(s),
  side:    (s) => s.turn,
  score:   (s) => ${guess('evaluate|score')}(s),        // opcional
  choose:  (s, lvl) => ${guess('chooseMove|bestMove')}(s, lvl), // opcional
  toText:  (m) => m.from.l + 'abcdefgh'[m.from.f] + (m.from.r + 1)
              + '>' + m.to.l + 'abcdefgh'[m.to.f] + (m.to.r + 1)
});`;
}

if (typeof window !== 'undefined') {
  window.ECIT_ADAPTER = { configure, autoDetect, status, get, wiringTemplate };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => autoDetect(), { once: true });
  else setTimeout(() => autoDetect(), 0);
}