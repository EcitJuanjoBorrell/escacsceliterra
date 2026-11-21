#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

function fail(message) {
  console.error('[ab-rules-test] ' + message);
  process.exit(1);
}

function positiveInt(value, option) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) fail(`${option} ha de ser un enter > 0`);
  return number;
}

function nonNegativeInt(value, option) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) fail(`${option} ha de ser un enter >= 0`);
  return number;
}

function parseArgs(argv) {
  const options = {
    variant: null, kingRules: [], games: 300, depth: 4, ms: 60,
    seed: 1, maxPlies: 120, adjudicate: 250, out: null, quiet: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--quiet') { options.quiet = true; continue; }
    if (!arg.startsWith('--')) fail('argument inesperat: ' + arg);
    const value = argv[++i];
    if (value === undefined) fail('falta valor per ' + arg);
    if (arg === '--variant') {
      if (!['A', 'B', 'C'].includes(value)) fail('--variant ha de ser A, B o C');
      options.variant = value;
    } else if (arg === '--king-rule') options.kingRules.push(value);
    else if (arg === '--games') options.games = positiveInt(value, arg);
    else if (arg === '--depth') options.depth = positiveInt(value, arg);
    else if (arg === '--ms') options.ms = positiveInt(value, arg);
    else if (arg === '--seed') options.seed = nonNegativeInt(value, arg);
    else if (arg === '--max-plies') options.maxPlies = positiveInt(value, arg);
    else if (arg === '--adjudicate') options.adjudicate = positiveInt(value, arg);
    else if (arg === '--out') options.out = value;
    else fail('opció desconeguda: ' + arg);
  }
  return options;
}

const OPTIONS = parseArgs(process.argv.slice(2));
const cwd = process.cwd();
const rulesPath = path.join(cwd, 'src/core/rules.js');
if (!fs.existsSync(rulesPath)) fail('executa des de l’arrel del repositori');
const rulesModule = await import(pathToFileURL(rulesPath).href);
const { Engine: E, KING_RULES } = rulesModule;

const variants = {
  A: { vertCapture: true, celVisitsLimit: 0 },
  B: { vertCapture: false, celVisitsLimit: 0 },
  C: { vertCapture: true, celVisitsLimit: 7 }
};
Object.assign(KING_RULES, OPTIONS.variant ? variants[OPTIONS.variant] : { vertCapture: true, celVisitsLimit: 0 });
for (const rule of OPTIONS.kingRules) {
  const match = /^([A-Za-z]+)\s*=\s*(true|false|\d+)$/i.exec(rule);
  if (!match) fail(`--king-rule invàlid: ${rule}`);
  if (match[1] === 'vertCapture') KING_RULES.vertCapture = match[2].toLowerCase() === 'true';
  else if (match[1] === 'celVisitsLimit') KING_RULES.celVisitsLimit = Number(match[2]);
  else fail(`camp desconegut a --king-rule: ${match[1]}`);
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let temp = value;
    temp = Math.imul(temp ^ (temp >>> 15), temp | 1);
    temp ^= temp + Math.imul(temp ^ (temp >>> 7), temp | 61);
    return ((temp ^ (temp >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(OPTIONS.seed);
const median = values => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function captureAt(state, move) {
  if (move.flag === E.F_EP) {
    const capSq = move.to + (state.turn === E.WHITE ? 16 : -16);
    return state.b[capSq] !== 0;
  }
  return move.flag === E.F_VCAP || state.b[move.to] !== 0;
}

function playGame(gameIndex) {
  const state = E.initialState();
  if (gameIndex % 2 === 1) state.turn = E.BLACK;
  state.key = E.refreshKey(state);

  const uniquePositions = new Set();
  uniquePositions.add(E.getKey(state).toString());
  let plyCount = 0;
  let kingVertMoves = 0, kingVertCaptures = 0, kingCelEntries = 0;
  let captures = 0, promotions = 0, checksGiven = 0;
  let endReason = 'maxPlyReached';
  let result = '1/2-1/2';
  const errors = [];

  try {
    for (; plyCount < OPTIONS.maxPlies; plyCount++) {
      const status = E.gameStatus(state);
      if (status.over) {
        endReason = status.result;
        if (status.result === 'mate') result = status.winner === E.WHITE ? '1-0' : '0-1';
        else result = '1/2-1/2';
        break;
      }
      if (plyCount >= OPTIONS.adjudicate) {
        endReason = 'adjudicated';
        result = '1/2-1/2';
        break;
      }

      const mover = state.turn;
      const search = E.search(state, { maxDepth: OPTIONS.depth, timeMs: OPTIONS.ms });
      if (!search.move) throw new Error('la cerca no ha retornat una jugada');

      const legal = E.genMoves(state, true).find(move =>
        move.from === search.move.from && move.to === search.move.to &&
        move.flag === search.move.flag && move.promo === search.move.promo);
      if (!legal) throw new Error('la cerca ha retornat una jugada il·legal');

      const isKingVertical = Math.abs(state.b[legal.from]) === E.KING && legal.flag === E.F_VERT;
      const isCapture = captureAt(state, legal);
      if (isKingVertical) kingVertMoves++;
      if (isKingVertical && isCapture) kingVertCaptures++;
      if (legal.promo) promotions++;
      if (isCapture) captures++;

      if (isKingVertical && (legal.to >> 7) === 1) kingCelEntries++;
      E.make(state, legal);
      uniquePositions.add(E.getKey(state).toString());
      if (E.inCheck(state, -mover)) checksGiven++;

      if (!OPTIONS.quiet && gameIndex === 0 && plyCount < 3) {
        console.log(`seed=${OPTIONS.seed} ply=${plyCount + 1} move=${E.moveText(state, legal)}`);
      }
    }
  } catch (error) {
    endReason = 'error';
    result = '1/2-1/2';
    errors.push({ game: gameIndex + 1, ply: plyCount + 1, error: String(error?.message || error) });
  }

  return {
    plyCount,
    endReason,
    result,
    kingVertMoves,
    kingVertCaptures,
    kingCelEntries,
    uniquePositions: uniquePositions.size,
    captures,
    promotions,
    checksGiven,
    errors
  };
}

const games = [];
const errors = [];
for (let game = 0; game < OPTIONS.games; game++) {
  const report = playGame(game);
  games.push(report);
  if (report.errors.length) errors.push(...report.errors);
  if (!OPTIONS.quiet && (game + 1) % 25 === 0) {
    console.log(`partides: ${game + 1}/${OPTIONS.games}`);
  }
}

const pct = (count, total) => total ? count * 100 / total : 0;
const decisive = games.filter(game => game.result === '1-0' || game.result === '0-1').length;
const draws = games.filter(game => game.result === '1/2-1/2').length;
const mates = games.filter(game => game.endReason === 'mate').length;
const adjudicated = games.filter(game => game.endReason === 'adjudicated').length;

const summary = {
  avgPly: average(games.map(game => game.plyCount)),
  medianPly: median(games.map(game => game.plyCount)),
  pctDecisive: pct(decisive, games.length),
  pctDraw: pct(draws, games.length),
  pctMate: pct(mates, games.length),
  pctAdjudicated: pct(adjudicated, games.length),
  avgUniquePositions: average(games.map(game => game.uniquePositions)),
  avgCaptures: average(games.map(game => game.captures)),
  avgPromotions: average(games.map(game => game.promotions)),
  avgChecks: average(games.map(game => game.checksGiven)),
  avgKingVertMoves: average(games.map(game => game.kingVertMoves)),
  totalKingVertCaptures: games.reduce((sum, game) => sum + game.kingVertCaptures, 0),
  avgKingCelEntries: average(games.map(game => game.kingCelEntries)),
  errors: errors.length
};

const build = 'rules-' + crypto.createHash('sha256')
  .update(fs.readFileSync(rulesPath))
  .update(JSON.stringify(KING_RULES))
  .digest('hex').slice(0, 8);
const outName = OPTIONS.variant
  ? `reports/ab-${OPTIONS.variant}-${OPTIONS.seed}.json`
  : `reports/ab-custom-${OPTIONS.seed}.json`;
const outPath = path.resolve(OPTIONS.out || outName);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const output = {
  meta: {
    variant: OPTIONS.variant,
    kingRules: { ...KING_RULES },
    seed: OPTIONS.seed,
    depth: OPTIONS.depth,
    ms: OPTIONS.ms,
    build,
    games: OPTIONS.games,
    maxPlies: OPTIONS.maxPlies,
    adjudicate: OPTIONS.adjudicate
  },
  summary,
  games,
  errors
};
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');

console.log('== RESUM A/B REGLES DEL REI ==');
console.log(`variant: ${OPTIONS.variant || 'personalitzada'} · kingRules: vertCapture=${KING_RULES.vertCapture} · celVisitsLimit=${KING_RULES.celVisitsLimit}`);
for (const [key, value] of Object.entries(summary)) {
  console.log(`${key}: ${typeof value === 'number' ? value.toFixed(2) : value}`);
}
console.log(`JSON: ${outPath}`);
