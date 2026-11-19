'use strict';
/* Generador d'experiència per a un joc sense teoria publicada.

   Fa jugar el motor contra ell mateix i aboca cada partida al laboratori.
   Amb tres polítiques: aleatòria (explora sense prejudicis), materialista
   (un pas de vista, captura el que guanya material) i motor (la cerca real).
   La llavor és reproduïble: mateixa llavor i mateixos paràmetres, mateixes
   partides. Això permet repetir un experiment i comparar-lo. */

import * as A from './ecitAdapter.js';
import * as X from './experience.js';

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEFAULTS = {
  count: 24,
  policy: 'material',
  level: 2,
  maxPlies: 120,
  explore: 6,
  temperature: 0.35,
  seed: 20261118,
  cutoff: 'draw',
  stopOnMate: true,
  dedupe: true
};

let cfg = { ...DEFAULTS };
let run = null;
let feed = [];
let listeners = new Set();

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach(f => { try { f(); } catch (e) { console.error('[selfplay]', e); } }); }

export function config() { return { ...cfg }; }
export function setConfig(patch) {
  cfg = { ...cfg, ...patch };
  emit();
}
export function resetConfig() { cfg = { ...DEFAULTS }; emit(); }
export function randomizeSeed() { cfg.seed = Math.floor(Math.random() * 1e9); emit(); }
export function state() {
  return {
    running: Boolean(run && !run.cancelled && !run.finishedAt),
    progress: run ? run.done / Math.max(1, run.total) : 0,
    done: run?.done || 0,
    total: run?.total || cfg.count,
    startedAt: run?.startedAt || null,
    elapsed: run ? (run.finishedAt || Date.now()) - run.startedAt : 0,
    results: run?.results || { w: 0, b: 0, d: 0 },
    ingested: run?.ingested || 0,
    skipped: run?.skipped || 0,
    duplicates: run?.duplicates || 0,
    errors: run?.errors || [],
    lastMessage: run?.message || '',
    feed: feed.slice(0, 40)
  };
}
export function clearFeed() { feed = []; emit(); }

function boardOf(state) {
  const b = state?.boards ?? state?.board ?? state?.levels ?? null;
  if (!b) return null;
  if (Array.isArray(b) && Array.isArray(b[0]) && Array.isArray(b[0][0])) return b;
  return null;
}

function materialScore(state) {
  const api = A.get();
  if (api?.score) {
    try { const v = Number(api.score(state)); if (Number.isFinite(v)) return v; } catch { /* seguim amb el recompte */ }
  }
  const boards = boardOf(state);
  if (!boards) return null;
  let total = 0;
  for (let l = 0; l < Math.min(2, boards.length); l++) {
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const p = boards[l]?.[r]?.[f];
      if (!p) continue;
      const t = String(p.t ?? p.type ?? p.kind ?? '').toLowerCase()[0];
      const s = String(p.s ?? p.side ?? p.color ?? '').toLowerCase()[0];
      const v = VALUE[t] ?? 0;
      const ghost = p.g ?? p.ghost ? 0.6 : 1;
      const levelBonus = l === 1 ? 1.08 : 1;
      total += (s === 'w' ? 1 : -1) * v * ghost * levelBonus;
    }
  }
  return total;
}

function pickMove(api, state, moves, rnd, ply, mover) {
  if (ply <= cfg.explore || cfg.policy === 'aleatori') {
    return moves[Math.floor(rnd() * moves.length)];
  }
  if (cfg.policy === 'motor' && api.choose) {
    try {
      const m = api.choose(state, cfg.level);
      if (m && moves.includes(m)) return m;
      if (m) { const t = api.toText(m); const hit = moves.find(x => api.toText(x) === t); if (hit) return hit; }
    } catch { /* si la cerca falla, seguim amb material */ }
  }
  const scored = [];
  for (const m of moves) {
    let v = 0;
    try {
      const next = api.apply(state, m);
      const s = materialScore(next);
      if (s !== null) v = (mover === 'w' ? s : -s);
      const st = A.gameStatus(next);
      if (st.over && st.result === mover) v += 100000;
      if (st.over && st.result && st.result !== mover && st.result !== 'd') v -= 100000;
      if (st.check) v += 30;
    } catch { v = 0; }
    scored.push({ m, v });
  }
  if (!scored.length) return moves[0];
  scored.sort((a, b) => b.v - a.v);
  if (cfg.temperature <= 0.001) return scored[0].m;
  const span = Math.max(1, scored[0].v - scored[scored.length - 1].v);
  const weights = scored.map(s => Math.exp((s.v - scored[0].v) / (span * cfg.temperature * 0.25 + 1)));
  const sum = weights.reduce((a, b) => a + b, 0);
  let t = rnd() * sum;
  for (let i = 0; i < scored.length; i++) { t -= weights[i]; if (t <= 0) return scored[i].m; }
  return scored[0].m;
}

function playOne(api, rnd, index) {
  let state = api.initial();
  const texts = [];
  let result = null;
  let plies = 0;
  let mate = false;

  while (plies < cfg.maxPlies) {
    let moves;
    try { moves = api.legal(state); } catch (e) { return { error: 'legal() ha fallat a la jugada ' + (plies + 1) + ': ' + (e?.message || e) }; }
    if (!Array.isArray(moves) || !moves.length) break;
    const mover = A.sideToMove(state);
    const mv = pickMove(api, state, moves, rnd, plies + 1, mover);
    const txt = api.toText(mv);
    if (!txt) return { error: 'jugada sense notació a la jugada ' + (plies + 1) };
    texts.push(txt);
    try { state = api.apply(state, mv); } catch (e) { return { error: 'apply() ha fallat: ' + (e?.message || e) }; }
    plies++;
    const st = A.gameStatus(state);
    if (st.over) {
      result = st.result;
      mate = /mate|mat/.test(st.reason || '') || (st.check && Boolean(st.result && st.result !== 'd'));
      if (cfg.stopOnMate || result) break;
    }
  }

  if (!result) {
    if (cfg.cutoff === 'discard') return { discarded: true, plies };
    result = 'd';
  }
  const token = result === 'w' ? '1-0' : result === 'b' ? '0-1' : '1/2';
  const label = 'Auto ' + String(index + 1).padStart(3, '0') + ' · ' + cfg.policy;
  const text = '# result: ' + token + '\n# source: autopartida\n# label: ' + label +
    '\n# policy: ' + cfg.policy + '\n# level: ' + cfg.level + '\n# seed: ' + cfg.seed + '\n' + texts.join(' ');
  return { text, result, plies, mate, label, opening: texts.slice(0, 4).join(' ') };
}

const yieldFrame = () => new Promise(r => setTimeout(r, 0));

export async function start() {
  const api = A.get();
  if (!api) { emit(); return { ok: false, message: 'El motor no està connectat.' }; }
  if (run && !run.cancelled && !run.finishedAt) return { ok: false, message: 'Ja hi ha una tanda en curs.' };

  const rnd = mulberry32(cfg.seed);
  const usedSeed = cfg.seed;
  run = {
    total: Math.max(1, Math.floor(cfg.count)), done: 0, cancelled: false,
    startedAt: Date.now(), finishedAt: null,
    results: { w: 0, b: 0, d: 0 }, ingested: 0, skipped: 0, duplicates: 0, errors: [], message: ''
  };
  const seen = new Set();
  const batch = [];
  const flushBatch = () => {
    if (!batch.length) return;
    const parsed = X.parseGames(batch.map(b => b.text).join('\n\n'));
    if (parsed.ok) {
      const r = X.ingest(parsed.games);
      if (r.ok) run.ingested += r.added;
      run.skipped += (r.skipped || 0);
      run.duplicates += (r.skipped || 0);
    } else if (parsed.errors?.length && run.errors.length < 12) {
      run.errors.push(parsed.errors[0]);
    }
    batch.length = 0;
  };
  emit();

  for (let i = 0; i < run.total; i++) {
    if (run.cancelled) break;
    const g = playOne(api, rnd, i);
    run.done++;
    if (g.error) {
      if (run.errors.length < 12) run.errors.push(g.error);
    } else if (g.discarded) {
      run.skipped++;
    } else {
      run.results[g.result]++;
      const hashKey = g.text;
      if (cfg.dedupe && seen.has(hashKey)) { run.skipped++; run.duplicates++; }
      else {
        if (cfg.dedupe) seen.add(hashKey);
        batch.push(g);
        feed.unshift({ id: 'f' + i + '-' + Date.now(), label: g.label, result: g.result, plies: g.plies, mate: g.mate, opening: g.opening, text: g.text });
        if (feed.length > 120) feed.length = 120;
      }
    }
    if (batch.length >= 8 || i === run.total - 1) flushBatch();
    emit();
    await yieldFrame();
  }

  flushBatch();
  run.finishedAt = Date.now();
  cfg.seed = (Math.floor(usedSeed) + 1) % 1000000000 || 1;
  run.message = run.ingested === 0 && run.duplicates > 0
    ? 'Cap partida incorporada: ' + run.duplicates + ' duplicades (la llavor i la política han repetit partides ja desades).'
    : run.ingested === 0 && run.skipped > 0
      ? 'Cap partida incorporada: totes s’han descartat en arribar al límit màxim de jugades.'
      : run.ingested === 0 && run.errors.length > 0
        ? 'Cap partida incorporada: revisa els avisos del motor; no s’han pogut processar partides.'
        : run.ingested === 0
          ? 'Cap partida incorporada: no s’ha completat cap partida vàlida.'
          : run.cancelled
            ? 'Tanda aturada: ' + run.ingested + ' partides incorporades, ' + run.duplicates + ' duplicades.'
            : 'Tanda acabada: ' + run.ingested + ' incorporades, ' + run.duplicates + ' duplicades descartades.';
  emit();
  return { ok: true, ingested: run.ingested };
}

export function cancel() {
  if (run && !run.finishedAt) { run.cancelled = true; run.message = 'Aturant…'; emit(); }
}

export function exportNotation() {
  return feed.slice().reverse().map(f => f.text).join('\n\n') + '\n';
}

if (typeof window !== 'undefined') window.ECIT_SELFPLAY = { start, cancel, config, setConfig, state, exportNotation };