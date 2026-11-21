#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

function fail(message) {
  console.error('[analyze-openings] ' + message);
  process.exit(1);
}

function positiveInt(value, option) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) fail(option + ' ha de ser un enter > 0');
  return number;
}

function nonNegativeInt(value, option) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) fail(option + ' ha de ser un enter >= 0');
  return number;
}

function parseArgs(argv) {
  const options = {
    plies: 8, depth: 4, ms: 60, beamWidth: null, beamMargin: null, taperedBeam: true,
    recMargin: 15, bookMargin: 50, exploreIl: true, ilMargin: 100,
    phase1Margin: 120, phase2Width: 8, phase2Depth: 4, phase2Ms: 250,
    out: 'public/book/ecit-book.json', repo: '', quiet: false,
    variant: null, kingRules: [],
    simulate: null, maxLoss: 35, progressEvery: 10
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--quiet') { options.quiet = true; continue; }
    if (arg === '--explore-il') { options.exploreIl = true; continue; }
    if (arg === '--no-explore-il') { options.exploreIl = false; continue; }
    if (arg === '--tapered-beam') { options.taperedBeam = true; continue; }
    if (arg === '--no-tapered-beam') { options.taperedBeam = false; continue; }
    if (arg === '--simulate') {
      const next = argv[i + 1];
      if (next !== undefined && /^\d+$/.test(next)) {
        options.simulate = positiveInt(argv[++i], arg);
      } else options.simulate = 200;
      continue;
    }
    if (!arg.startsWith('--')) fail('argument inesperat: ' + arg);
    const value = argv[++i];
    if (value === undefined) fail('falta valor per ' + arg);
    if (arg === '--plies') options.plies = positiveInt(value, arg);
    else if (arg === '--depth') options.depth = positiveInt(value, arg);
    else if (arg === '--ms') options.ms = positiveInt(value, arg);
    else if (arg === '--beam-width') options.beamWidth = positiveInt(value, arg);
    else if (arg === '--beam-margin') options.beamMargin = nonNegativeInt(value, arg);
    else if (arg === '--rec-margin') options.recMargin = nonNegativeInt(value, arg);
    else if (arg === '--book-margin') options.bookMargin = nonNegativeInt(value, arg);
    else if (arg === '--il-margin') options.ilMargin = nonNegativeInt(value, arg);
    else if (arg === '--phase1-margin') options.phase1Margin = nonNegativeInt(value, arg);
    else if (arg === '--phase2-width') options.phase2Width = positiveInt(value, arg);
    else if (arg === '--phase2-depth') options.phase2Depth = positiveInt(value, arg);
    else if (arg === '--phase2-ms') options.phase2Ms = positiveInt(value, arg);
    else if (arg === '--out') options.out = value;
    else if (arg === '--repo') options.repo = value;
    else if (arg === '--variant') {
      if (!['A', 'B', 'C'].includes(value)) fail('--variant ha de ser A, B o C');
      options.variant = value;
    } else if (arg === '--king-rule') options.kingRules.push(value);
    else if (arg === '--max-loss') {
      options.maxLoss = Number(value);
      if (!Number.isFinite(options.maxLoss) || options.maxLoss < 0) fail('--max-loss ha de ser un nombre >= 0');
    } else fail('opció desconeguda: ' + arg);
  }
  return options;
}

function printHelp() {
  console.log(`Ús: node scripts/analyze-openings.mjs [opcions]

  --plies N             màxim de jugades d’obertura [8]
  --depth N             fondària de referència per a l’informe i el meta [4]
  --ms N                compatibilitat amb l’opció històrica
  --tapered-beam        beam per ply: amplada/marge 8/35, 4/40, 3/35, 2/30 [actiu]
  --no-tapered-beam     desactiva el perfil (amplada 4, marge 60 cp)
  --beam-width N        amplada uniforme que sobreescriu el perfil
  --beam-margin N       marge uniforme que sobreescriu el perfil
  --rec-margin N        marge per recomanades [15]
  --book-margin N       marge per permissibles [50]
  --explore-il          explora enrocs internivell [per defecte]
  --no-explore-il       desactiva l’exploració d’enrocs internivell
  --il-margin N         marge per a enrocs internivell [100]
  --phase1-margin N     marge del filtre ràpid [120 cp]
  --phase2-width N      màxim de jugades reavaluades [8]
  --phase2-depth N      fondària de la cerca precisa [4]
  --phase2-ms N         pressupost de cerca precisa per jugada [250]
  --out FITXER          fitxer JSON de sortida
  --repo RUTA           arrel del repositori
  --variant [A|B|C]     variant de regla del Rei
  --king-rule CAMP=VAL  regla del Rei repetible
  --simulate [N]        simula partides de qualitat [200]
  --max-loss N          cost mitjà màxim de la simulació [35 cp]
  --quiet               sense progrés`);
}

if (process.argv.slice(2).some(arg => arg === '--help' || arg === '-h')) {
  printHelp();
  process.exit(0);
}
const OPTIONS = parseArgs(process.argv.slice(2));

function findRepoRoot(explicit) {
  const candidates = [];
  if (explicit) candidates.push(path.resolve(explicit));
  let directory = process.cwd();
  for (let i = 0; i < 6; i++) {
    candidates.push(directory);
    directory = path.dirname(directory);
  }
  return candidates.find(candidate => fs.existsSync(path.join(candidate, 'src/core/rules.js'))) || null;
}

const repo = findRepoRoot(OPTIONS.repo);
if (!repo) fail('no trobo src/core/rules.js; executa des de l’arrel o fes servir --repo');
const rulesPath = path.join(repo, 'src/core/rules.js');
const rulesModule = await import(pathToFileURL(rulesPath).href);
const { Engine: E, KING_RULES } = rulesModule;
const variantRules = {
  A: { vertCapture: true, celVisitsLimit: 0 },
  B: { vertCapture: false, celVisitsLimit: 0 },
  C: { vertCapture: true, celVisitsLimit: 7 }
};
Object.assign(KING_RULES, OPTIONS.variant ? variantRules[OPTIONS.variant] : { vertCapture: true, celVisitsLimit: 0 });
for (const rule of OPTIONS.kingRules) {
  const match = /^([A-Za-z]+)\s*=\s*(true|false|\d+)$/i.exec(rule);
  if (!match) fail(`--king-rule invàlid: ${rule}`);
  const key = match[1];
  if (key === 'vertCapture') KING_RULES.vertCapture = match[2].toLowerCase() === 'true';
  else if (key === 'celVisitsLimit') KING_RULES.celVisitsLimit = Number(match[2]);
  else fail(`camp desconegut a --king-rule: ${key}`);
}
const { pickFromEntry } = await import(pathToFileURL(path.join(repo, 'src/engine/book.js')).href);
const build = 'rules-' + crypto.createHash('sha256')
  .update(fs.readFileSync(rulesPath))
  .update(JSON.stringify(KING_RULES))
  .digest('hex').slice(0, 8);

const FILES = 'abcdefgh';
const PROMO_CHAR = { 2: 'n', 3: 'b', 4: 'r', 5: 'q' };
const PROMO_VALUE = { n: 2, b: 3, r: 4, q: 5 };
const TOKEN = /^([01])?([a-h])([1-8])\s*(<>|>)\s*([01])?([a-h])([1-8])(?:=([nbrq]))?$/i;

function moveToken(move) {
  const square = index => E.lvlOf(index) + FILES[E.colOf(index)] + (8 - E.rowOf(index));
  return square(move.from) + (move.flag === E.F_IL ? '<>' : '>') + square(move.to) +
    (move.promo ? '=' + PROMO_CHAR[move.promo] : '');
}

function parseToken(token) {
  const match = TOKEN.exec(token);
  if (!match) return null;
  const fromLevel = match[1] === undefined ? 0 : Number(match[1]);
  const toLevel = match[5] === undefined ? fromLevel : Number(match[5]);
  return {
    from: E.idxOf(fromLevel, 8 - Number(match[3]), FILES.indexOf(match[2].toLowerCase())),
    to: E.idxOf(toLevel, 8 - Number(match[7]), FILES.indexOf(match[6].toLowerCase())),
    flag: match[4] === '<>' ? E.F_IL : null,
    promo: match[8] ? PROMO_VALUE[match[8].toLowerCase()] : 0
  };
}

function moveMatchesToken(move, token) {
  const parsed = parseToken(token);
  return parsed && move.from === parsed.from && move.to === parsed.to &&
    (parsed.flag === E.F_IL ? move.flag === E.F_IL : move.flag !== E.F_IL) &&
    move.promo === parsed.promo;
}

function analyzePosition(state) {
  const moves = E.genMoves(state, true);
  const scored = [];
  let nodes = 0;
  for (const move of moves) {
    const child = E.cloneState(state);
    E.make(child, move);
    const result = E.search(child, { maxDepth: 1, timeMs: 10 });
    nodes += result.nodes;
    scored.push({ move, token: moveToken(move), score: -result.score, phase2: false });
  }
  scored.sort((a, b) => b.score - a.score || a.token.localeCompare(b.token));
  const bestPhase1 = scored.length ? scored[0].score : 0;
  const survivors = scored
    .filter(item => item.score >= bestPhase1 - OPTIONS.phase1Margin)
    .slice(0, OPTIONS.phase2Width);
  const survivorSet = new Set(survivors);
  let discardedPhase1CostCp = 0;
  for (const item of scored) {
    if (survivorSet.has(item)) continue;
    discardedPhase1CostCp += bestPhase1 - item.score;
  }
  for (const item of survivors) {
    const child = E.cloneState(state);
    E.make(child, item.move);
    const result = E.search(child, {
      maxDepth: OPTIONS.phase2Depth,
      timeMs: OPTIONS.phase2Ms
    });
    nodes += result.nodes;
    item.score = -result.score;
    item.phase2 = true;
  }
  scored.sort((a, b) => b.score - a.score || a.token.localeCompare(b.token));
  const finalScores = survivors.map(item => item.score);
  return {
    scored,
    best: finalScores.length ? Math.max(...finalScores) : 0,
    nodes,
    phase1Discarded: scored.length - survivors.length,
    phase1DiscardedCostCp: discardedPhase1CostCp,
    phase2Reevaluated: survivors.length
  };
}

const startedAt = Date.now();
const queue = [{ state: E.initialState(), ply: 1 }];
let queueIndex = 0, transpositions = 0, totalNodes = 0, positionsAnalyzed = 0;
const cache = new Map();
const serializedEntries = {};
const perPly = {};
const permissibleLosses = [];
let ilCount = 0, ilCostTotal = 0;
const pendingEntries = new Map();

function beamForPly(ply) {
  const profile = ply <= 2 ? [8, 35] : ply <= 4 ? [4, 40] : ply <= 6 ? [3, 35] : [2, 30];
  return {
    width: OPTIONS.beamWidth ?? (OPTIONS.taperedBeam ? profile[0] : 4),
    margin: OPTIONS.beamMargin ?? (OPTIONS.taperedBeam ? profile[1] : 60)
  };
}

function plyStats(ply) {
  return perPly[ply] || (perPly[ply] = {
    entries: 0, moves: { recommended: 0, permissible: 0, exploratory: 0 },
    ilCastles: 0, ilCostCp: 0,
    phase1Discarded: 0, phase1DiscardedCostCp: 0, phase2Reevaluated: 0
  });
}

while (queueIndex < queue.length) {
  const { state, ply } = queue[queueIndex++];
  if (ply > OPTIONS.plies) continue;
  const key = E.getKey(state).toString();
  if (cache.has(key)) {
    transpositions++;
    continue;
  }
  const result = analyzePosition(state);
  cache.set(key, result);
  positionsAnalyzed++;
  totalNodes += result.nodes;
  const stats = plyStats(ply);
  stats.phase1Discarded += result.phase1Discarded;
  stats.phase1DiscardedCostCp += result.phase1DiscardedCostCp;
  stats.phase2Reevaluated += result.phase2Reevaluated;
  if (!result.scored.length) continue;

  const eligible = result.scored.filter(item => {
    if (!item.phase2) return false;
    const loss = result.best - item.score;
    return item.move.flag === E.F_IL
      ? OPTIONS.exploreIl && loss <= OPTIONS.ilMargin
      : loss <= OPTIONS.bookMargin;
  });
  const candidates = eligible.map(item => {
    const loss = result.best - item.score;
    const cls = item.move.flag === E.F_IL ? 2 : loss <= OPTIONS.recMargin ? 0 : 1;
    const child = E.cloneState(state);
    E.make(child, item.move);
    return { move: [item.token, item.score, cls], childKey: E.getKey(child).toString(), loss, cls };
  });
  pendingEntries.set(key, { ply, best: result.best, candidates });

  const beam = beamForPly(ply);
  const ordinaryBeam = result.scored
    .filter(item => item.phase2 && item.move.flag !== E.F_IL && result.best - item.score <= beam.margin)
    .slice(0, beam.width);
  const ilBeam = OPTIONS.exploreIl
    ? result.scored.filter(item =>
      item.phase2 && item.move.flag === E.F_IL && result.best - item.score <= OPTIONS.ilMargin)
    : [];
  const descend = new Map([...ordinaryBeam, ...ilBeam].map(item => [item.token, item]));
  for (const item of descend.values()) {
    if (ply < OPTIONS.plies) {
      const child = E.cloneState(state);
      E.make(child, item.move);
      queue.push({ state: child, ply: ply + 1 });
    }
  }

  if (!OPTIONS.quiet && positionsAnalyzed > 0 && positionsAnalyzed % OPTIONS.progressEvery === 0) {
    const elapsed = (Date.now() - startedAt) / 1000;
    const rate = positionsAnalyzed / Math.max(elapsed, 0.001);
    const remaining = queue.length - queueIndex;
    const estimated = Math.max(remaining, remaining * Math.max(1, OPTIONS.plies - ply));
    console.log(`[progrés] ${positionsAnalyzed} posicions · ${transpositions} transposicions · ` +
      `~${Math.ceil(estimated / Math.max(rate, 0.001))} s restants`);
  }
}

for (const [key, pending] of pendingEntries) {
  const candidates = pending.ply === OPTIONS.plies
    ? pending.candidates
    : pending.candidates.filter(candidate => pendingEntries.has(candidate.childKey));
  const moves = candidates.map(candidate => candidate.move)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  serializedEntries[key] = [pending.ply, pending.best, moves];
  const stats = plyStats(pending.ply);
  stats.entries++;
  for (const candidate of candidates) {
    if (candidate.cls === 0) stats.moves.recommended++;
    else if (candidate.cls === 1) {
      stats.moves.permissible++;
      permissibleLosses.push(candidate.loss);
    } else {
      stats.moves.exploratory++;
      stats.ilCastles++;
      stats.ilCostCp += candidate.loss;
      ilCount++;
      ilCostTotal += candidate.loss;
    }
  }
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}

let simulation = null;
if (OPTIONS.simulate !== null) {
  const losses = [];
  let libraryMoves = 0, topMoves = 0;
  const games = [];
  const exitReasons = { absentPosition: 0, noMoveWithinMargin: 0, gameEnded: 0, maxPlyReached: 0 };
  const margin = OPTIONS.bookMargin;
  for (let game = 0; game < OPTIONS.simulate; game++) {
    const state = E.initialState();
    let movesPlayed = 0;
    let exitReason = 'maxPlyReached';
    for (let ply = 1; ply <= OPTIONS.plies; ply++) {
      const key = E.getKey(state).toString();
      const entry = serializedEntries[key];
      if (!entry) {
        exitReason = 'absentPosition';
        break;
      }
      const legalMoves = E.genMoves(state, true);
      const move = pickFromEntry(entry, legalMoves, margin, key + '|simulation|' + game);
      if (!move) {
        exitReason = 'noMoveWithinMargin';
        break;
      }
      const selected = entry[2].find(([token]) => moveMatchesToken(move, token));
      if (!selected) fail('selecció simulada no present a l’entrada del llibre');
      const loss = entry[1] - selected[1];
      losses.push(loss);
      libraryMoves++;
      if (selected[1] === entry[1]) topMoves++;
      movesPlayed++;
      E.make(state, move);
      if (E.gameStatus(state).over) {
        exitReason = 'gameEnded';
        break;
      }
    }
    games.push(movesPlayed);
    exitReasons[exitReason]++;
  }
  const avgLoss = losses.length ? losses.reduce((sum, loss) => sum + loss, 0) / losses.length : 0;
  const avgMoves = games.reduce((sum, count) => sum + count, 0) / games.length;
  const histogram = Object.fromEntries(Array.from({ length: OPTIONS.plies + 1 }, (_, count) => [
    String(count), games.filter(moves => moves === count).length
  ]));
  simulation = {
    games: OPTIONS.simulate,
    meanBookMovesPerGame: avgMoves,
    maxBookMovesPerGame: games.length ? Math.max(...games) : 0,
    histogram,
    meanLossCp: avgLoss,
    maxLossCp: losses.length ? Math.max(...losses) : 0,
    p95LossCp: percentile(losses, 0.95),
    top1Percent: losses.length ? topMoves * 100 / losses.length : 0,
    exitReasons: {
      absentPosition: exitReasons.absentPosition,
      noMoveInMargin: exitReasons.noMoveWithinMargin,
      gameOver: exitReasons.gameEnded,
      maxReached: exitReasons.maxPlyReached
    }
  };
}

const generated = new Date().toISOString().slice(0, 10);
const book = {
  schema: 2, variant: 'ecit', build, generated,
  kingRules: { ...KING_RULES },
  ruleVariant: OPTIONS.variant,
  criteria: {
    depth: OPTIONS.depth, beamMargin: OPTIONS.beamMargin ?? (OPTIONS.taperedBeam ? null : 60),
    taperedBeam: OPTIONS.taperedBeam, recMargin: OPTIONS.recMargin,
    bookMargin: OPTIONS.bookMargin, ilMargin: OPTIONS.ilMargin, maxPly: OPTIONS.plies
  },
  source: { method: 'search-analysis', positions: positionsAnalyzed, nodes: totalNodes },
  entries: serializedEntries
};
const metadata = {
  schema: 2, variant: 'ecit', build, generated,
  ruleVariant: OPTIONS.variant,
  kingRules: { ...KING_RULES },
  criteria: {
    ...book.criteria,
    beamWidth: OPTIONS.beamWidth,
    beamByPly: {
      '1-2': beamForPly(1),
      '3-4': beamForPly(3),
      '5-6': beamForPly(5),
      '7+': beamForPly(7)
    }
  },
  source: book.source,
  pruning: {
    phase1Depth: 1,
    phase2Depth: OPTIONS.phase2Depth,
    phase1Margin: OPTIONS.phase1Margin,
    phase2Width: OPTIONS.phase2Width
  },
  plies: perPly, transpositions, ilCastles: ilCount,
  ilCostCp: ilCount ? ilCostTotal / ilCount : 0,
  meanIlCostCp: ilCount ? ilCostTotal / ilCount : 0,
  permissibleLossCp: {
    count: permissibleLosses.length,
    mean: permissibleLosses.length
      ? permissibleLosses.reduce((sum, loss) => sum + loss, 0) / permissibleLosses.length : 0,
    p50: percentile(permissibleLosses, 0.5),
    p95: percentile(permissibleLosses, 0.95),
    max: permissibleLosses.length ? Math.max(...permissibleLosses) : 0
  },
  simulation
};
const outputPath = path.resolve(repo, OPTIONS.out);
const metaPath = outputPath.replace(/\.json$/i, '.meta.json');
const backupPath = path.join(repo, 'public/book/ecit-book.wilson.json');
const currentBookPath = path.join(repo, 'public/book/ecit-book.json');
if (!fs.existsSync(currentBookPath)) fail('no existeix el llibre actual per fer-ne la còpia Wilson');
fs.mkdirSync(path.dirname(backupPath), { recursive: true });
if (!fs.existsSync(backupPath)) fs.copyFileSync(currentBookPath, backupPath);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const json = JSON.stringify(book);
fs.writeFileSync(outputPath, json + '\n');
metadata.coverage = {
  positions: Object.keys(serializedEntries).length,
  maxPly: OPTIONS.plies,
  bookBytes: Buffer.byteLength(json),
  bookGzipBytes: zlib.gzipSync(json).byteLength
};
fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2) + '\n');

const byteSize = Buffer.byteLength(json);
const gzipSize = zlib.gzipSync(json).byteLength;
const elapsed = (Date.now() - startedAt) / 1000;
console.log('== INFORME LLIBRE ECIT · ANÀLISI DIRECTA ==');
console.log(`variant: ${OPTIONS.variant || 'personalitzada'} · kingRules: vertCapture=${KING_RULES.vertCapture} · celVisitsLimit=${KING_RULES.celVisitsLimit}`);
console.log(`posicions analitzades: ${positionsAnalyzed} · transposicions reutilitzades: ${transpositions} · nodes: ${totalNodes}`);
console.log(`poda en dues fases: fase 1 d1/10 ms/marge ${OPTIONS.phase1Margin} cp · ` +
  `fase 2 d${OPTIONS.phase2Depth}/${OPTIONS.phase2Ms} ms/amplada ${OPTIONS.phase2Width}`);
console.log(`temps: ${elapsed.toFixed(1)} s · entrades: ${Object.keys(serializedEntries).length} · JSON: ${byteSize} B · gzip estimat: ${gzipSize} B`);
console.log(`enrocs internivell: ${ilCount} · cost mitjà: ${ilCount ? (ilCostTotal / ilCount).toFixed(1) : '0.0'} cp`);
console.log(`permissibles: ${permissibleLosses.length} · cost cp (mitjana/p50/p95/màxim): ${
  metadata.permissibleLossCp.mean.toFixed(1)}/${metadata.permissibleLossCp.p50}/${
    metadata.permissibleLossCp.p95}/${metadata.permissibleLossCp.max}`);
for (const [ply, stats] of Object.entries(perPly).sort((a, b) => Number(a[0]) - Number(b[0]))) {
  console.log(`ply ${ply}: ${stats.entries} entrades · recomanades ${stats.moves.recommended} · ` +
    `permissibles ${stats.moves.permissible} · exploratòries ${stats.moves.exploratory} · ` +
    `jugades descartades a fase 1 ${stats.phase1Discarded} · ` +
    `jugades reavaluades a fase 2 ${stats.phase2Reevaluated} · ` +
    `cost mitjà de descartades ${stats.phase1Discarded
      ? (stats.phase1DiscardedCostCp / stats.phase1Discarded).toFixed(1) : '0.0'} cp`);
}
if (simulation) {
  console.log(`simulació (${simulation.games}): jugades de llibre/partida ${simulation.meanBookMovesPerGame.toFixed(2)} · ` +
    `cost mitjà ${simulation.meanLossCp.toFixed(1)} cp · màxim ${simulation.maxLossCp} cp · ` +
    `p95 ${simulation.p95LossCp} cp · top-1 ${simulation.top1Percent.toFixed(1)}%`);
  console.log('histograma de cobertura: ' + Object.entries(simulation.histogram)
    .map(([moves, count]) => `${moves}=${count}`).join(' · '));
  console.log(`sortida del llibre · posició absent ${simulation.exitReasons.absentPosition} · ` +
    `cap jugada dins del marge ${simulation.exitReasons.noMoveInMargin} · ` +
    `partida acabada ${simulation.exitReasons.gameOver} · màxim assolit ${simulation.exitReasons.maxReached}`);
  if (simulation.meanLossCp > OPTIONS.maxLoss || simulation.meanBookMovesPerGame < 3) {
    console.error(`[GATE FALLIT] cost mitjà > ${OPTIONS.maxLoss} cp o menys de 3 jugades de llibre per partida.`);
    process.exitCode = 1;
  } else {
    console.log('[GATE SUPERAT]');
  }
}
