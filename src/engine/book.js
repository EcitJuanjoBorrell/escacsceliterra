'use strict';
import { Engine } from '../core/rules.js';

const BOOK_URL = '/book/ecit-book.json';
const META_URL = '/book/ecit-book.meta.json';
const STORAGE_KEY = 'ecit.book.enabled';
const CURRENT_BUILD = 'rules-50f401e0';

let status = 'loading';
let book = null;
let entryCount = 0;
let metadata = null;
let loadPromise = null;
let enabled = true;
try { enabled = localStorage.getItem(STORAGE_KEY) !== 'false'; } catch { /* emmagatzematge opcional */ }

function validBook(value) {
  return value && (value.schema === 1 || value.schema === 2) && value.variant === 'ecit' &&
    value.entries && typeof value.entries === 'object' &&
    value.criteria && (value.schema === 1
      ? typeof value.source?.games === 'number'
      : typeof value.source?.positions === 'number' && typeof value.source?.nodes === 'number');
}

export function loadBook() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const response = await fetch(BOOK_URL);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const value = await response.json();
      if (!validBook(value)) throw new Error('format de llibre invàlid');
      book = value;
      entryCount = Object.keys(value.entries).length;
      status = 'available';
      try {
        const metaResponse = await fetch(META_URL);
        if (metaResponse.ok) metadata = await metaResponse.json();
      } catch { /* Les metadades són opcionals; el llibre continua disponible. */ }
      return book;
    } catch (error) {
      book = null;
      status = 'unavailable';
      console.warn('[book] Llibre no disponible:', error?.message || error);
      return null;
    }
  })();
  return loadPromise;
}

export function bookInfo() {
  const stale = Boolean(book && book.build !== CURRENT_BUILD);
  return {
    status: !book ? status : stale ? 'stale' : 'available',
    schema: book?.schema || null,
    entries: entryCount,
    games: book?.source?.games || 0,
    criteria: book?.criteria || null,
    depth: book?.criteria?.depth || null,
    build: book?.build || null,
    plies: metadata?.plies || {},
    varietyPositions: metadata?.varietyPositions || 0
  };
}

function deterministicRandom(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  value += 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function tokenMove(E, token) {
  const match = /^([01])?([a-h])([1-8])\s*(<>|>)\s*([01])?([a-h])([1-8])(?:=([nbrq]))?$/i.exec(token);
  if (!match) return null;
  const fromLevel = match[1] === undefined ? 0 : Number(match[1]);
  const toLevel = match[5] === undefined ? fromLevel : Number(match[5]);
  const promotion = match[8] ? { n: E.KNIGHT, b: E.BISHOP, r: E.ROOK, q: E.QUEEN }[match[8].toLowerCase()] : 0;
  return {
    from: E.idxOf(fromLevel, 8 - Number(match[3]), match[2].toLowerCase().charCodeAt(0) - 97),
    to: E.idxOf(toLevel, 8 - Number(match[7]), match[6].toLowerCase().charCodeAt(0) - 97),
    flag: match[4] === '<>' ? E.F_IL : null,
    promo: promotion
  };
}

function wilson(wins, draws, n) {
  if (!n) return 0;
  const z = 1.96, p = (wins + draws * 0.5) / n, dd = 1 + z * z / n;
  const centre = p + z * z / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p) + draws * 0.25 / n) / n);
  return Math.max(0, (centre - spread) / dd);
}

function moveMatchesToken(E, move, parsed) {
  return move.from === parsed.from && move.to === parsed.to &&
    (parsed.flag === E.F_IL ? move.flag === E.F_IL : move.flag !== E.F_IL) &&
    move.promo === parsed.promo;
}

export function pickFromEntry(entry, legalMoves, margin, seedKey) {
  if (!Array.isArray(entry) || !Array.isArray(entry[2]) || !Array.isArray(legalMoves)) return null;
  const bestCp = entry[1];
  if (!Number.isFinite(bestCp) || !Number.isFinite(margin) || margin < 0) return null;
  const candidates = [];
  for (const [token, cp] of entry[2]) {
    if (typeof token !== 'string' || !Number.isFinite(cp) || cp < bestCp - margin) continue;
    const parsed = tokenMove(Engine, token);
    if (!parsed) continue;
    const move = legalMoves.find(candidate => moveMatchesToken(Engine, candidate, parsed));
    if (move) candidates.push({ move, cp, weight: Math.exp(cp - bestCp) });
  }
  if (!candidates.length) return null;
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  let choice = deterministicRandom(String(seedKey ?? '')) * total;
  for (const candidate of candidates) {
    choice -= candidate.weight;
    if (choice <= 0) return candidate.move;
  }
  return candidates[candidates.length - 1].move;
}

export function bookMove(state, opts = {}) {
  if (!enabled || !book) return null;
  const key = Engine.getKey(state).toString();
  const record = book.entries[key];
  if (!Array.isArray(record) || (book.schema === 1
    ? !Array.isArray(record[1])
    : !Number.isFinite(record[1]) || !Array.isArray(record[2]))) return null;
  const legalMoves = Engine.genMoves(state, true);
  if (book.schema === 2) {
    const margin = Number.isFinite(opts.margin)
      ? Math.max(0, opts.margin)
      : (book.criteria.ilMargin ?? book.criteria.bookMargin ?? 0);
    return pickFromEntry(record, legalMoves, margin, key + '|' + String(opts.seed ?? 0));
  }
  const margin = Number.isFinite(opts.margin) ? Math.max(0, opts.margin) : 0.05;
  const candidates = [];
  for (const [token, wins, draws, losses] of record[1]) {
    if (typeof token !== 'string' || ![wins, draws, losses].every(Number.isFinite)) continue;
    const parsed = tokenMove(Engine, token);
    if (!parsed) continue;
    const move = legalMoves.find(candidate => moveMatchesToken(Engine, candidate, parsed));
    if (!move) continue;
    const score = wilson(wins, draws, wins + draws + losses);
    candidates.push({ move, score });
  }
  if (!candidates.length) return null;
  const best = Math.max(...candidates.map(candidate => candidate.score));
  const withinMargin = candidates.filter(candidate => candidate.score >= best - margin);
  const total = withinMargin.reduce((sum, candidate) => sum + candidate.score, 0);
  let choice = deterministicRandom(key + '|' + String(opts.seed ?? 0)) * total;
  for (const candidate of withinMargin) {
    choice -= candidate.score;
    if (choice <= 0) return candidate.move;
  }
  return withinMargin[withinMargin.length - 1].move;
}

export function setBookEnabled(value) {
  enabled = Boolean(value);
  try { localStorage.setItem(STORAGE_KEY, String(enabled)); } catch { /* el llibre continua usable en aquesta sessió */ }
  return enabled;
}

export function isBookEnabled() { return enabled; }
