#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function fail(message) {
  console.error('[oracle-gate] ' + message);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    book: 'public/book/ecit-book.json',
    repo: '',
    perPly: 25,
    total: 150,
    depth: 7,
    ms: 8000,
    out: 'public/book/ecit-book.oracle.json',
    variant: null,
    kingRules: []
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(`Ús: node scripts/oracle-gate.mjs [opcions]

  --book FITXER   llibre schema 2 [public/book/ecit-book.json]
  --repo RUTA     arrel del repositori
  --per-ply N     mostra inicial màxima per ply [25]
  --total N       pressupost total de la mostra [150]
  --depth N       profunditat de l'oracle [7]
  --ms N          pressupost de temps en ms [8000]
  --out FITXER    JSON de resultats [public/book/ecit-book.oracle.json]
  --variant [A|B|C] variant de regla del Rei
  --king-rule CAMP=VAL regla del Rei repetible`);
      process.exit(0);
    }
    if (!arg.startsWith('--')) fail('argument inesperat: ' + arg);
    const value = argv[++i];
    if (value === undefined) fail('falta valor per ' + arg);
    if (arg === '--book') options.book = value;
    else if (arg === '--repo') options.repo = value;
    else if (arg === '--per-ply') options.perPly = Number(value);
    else if (arg === '--total') options.total = Number(value);
    else if (arg === '--depth') options.depth = Number(value);
    else if (arg === '--ms') options.ms = Number(value);
    else if (arg === '--out') options.out = value;
    else if (arg === '--variant') {
      if (!['A', 'B', 'C'].includes(value)) fail('--variant ha de ser A, B o C');
      options.variant = value;
    } else if (arg === '--king-rule') options.kingRules.push(value);
    else fail('opció desconeguda: ' + arg);
  }
  for (const option of ['perPly', 'total', 'depth', 'ms']) {
    if (!Number.isSafeInteger(options[option]) || options[option] < 1) {
      const name = {
        perPly: 'per-ply',
        total: 'total',
        depth: 'depth',
        ms: 'ms'
      }[option];
      fail(`--${name} ha de ser un enter positiu`);
    }
  }
  return options;
}

function distributeProportionally(weights, capacities, budget) {
  const allocation = weights.map(() => 0);
  let remaining = Math.min(budget, capacities.reduce((sum, capacity) => sum + capacity, 0));

  while (remaining > 0) {
    const active = capacities
      .map((capacity, index) => ({ capacity: capacity - allocation[index], index }))
      .filter(({ capacity }) => capacity > 0);
    if (!active.length) break;
    const weightTotal = active.reduce((sum, item) => sum + weights[item.index], 0);
    const shares = active.map(item => ({
      ...item,
      share: remaining * (weightTotal > 0 ? weights[item.index] / weightTotal : item.capacity)
    }));
    const saturated = shares.filter(item => item.share >= item.capacity);
    if (saturated.length) {
      for (const item of saturated) {
        allocation[item.index] += item.capacity;
        remaining -= item.capacity;
      }
      continue;
    }

    for (const item of shares) {
      const whole = Math.floor(item.share);
      allocation[item.index] += whole;
      remaining -= whole;
    }
    shares.sort((a, b) => (b.share % 1) - (a.share % 1) || a.index - b.index);
    for (const item of shares) {
      if (remaining === 0) break;
      if (allocation[item.index] < capacities[item.index]) {
        allocation[item.index]++;
        remaining--;
      }
    }
  }
  return allocation;
}

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

const OPTIONS = parseArgs(process.argv.slice(2));
const repo = findRepoRoot(OPTIONS.repo);
if (!repo) fail('no trobo src/core/rules.js; executa des de l’arrel o fes servir --repo');
const bookPath = path.resolve(repo, OPTIONS.book);
if (!fs.existsSync(bookPath)) fail('no existeix el llibre: ' + bookPath);
const book = JSON.parse(fs.readFileSync(bookPath, 'utf8'));
if (book?.schema !== 2 || book.variant !== 'ecit' || !book.entries || typeof book.entries !== 'object') {
  fail('cal un llibre ECIT schema 2 vàlid');
}
const metaPath = bookPath.replace(/\.json$/i, '.meta.json');
const metadata = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
if (metadata.build !== book.build || !metadata.simulation) {
  fail('cal generar les metadades del llibre amb analyze-openings.mjs --simulate');
}
const margin = book.criteria?.bookMargin;
if (!Number.isFinite(margin) || margin < 0) fail('el llibre no conté criteria.bookMargin vàlid');

const rulesModule = await import(pathToFileURL(path.join(repo, 'src/core/rules.js')).href);
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
  if (match[1] === 'vertCapture') KING_RULES.vertCapture = match[2].toLowerCase() === 'true';
  else if (match[1] === 'celVisitsLimit') KING_RULES.celVisitsLimit = Number(match[2]);
  else fail(`camp desconegut a --king-rule: ${match[1]}`);
}
if (book.kingRules &&
    (book.kingRules.vertCapture !== KING_RULES.vertCapture ||
     book.kingRules.celVisitsLimit !== KING_RULES.celVisitsLimit)) {
  fail('les regles efectives no coincideixen amb les del llibre');
}
const { pickFromEntry } = await import(pathToFileURL(path.join(repo, 'src/engine/book.js')).href);
const FILES = 'abcdefgh';
const PROMO_VALUE = { n: 2, b: 3, r: 4, q: 5 };
const TOKEN = /^([01])?([a-h])([1-8])\s*(<>|>)\s*([01])?([a-h])([1-8])(?:=([nbrq]))?$/i;

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

function moveMatchesToken(move, parsed) {
  return move.from === parsed.from && move.to === parsed.to &&
    (parsed.flag === E.F_IL ? move.flag === E.F_IL : move.flag !== E.F_IL) &&
    move.promo === parsed.promo;
}

function moveToken(move) {
  const square = index => E.lvlOf(index) + FILES[E.colOf(index)] + (8 - E.rowOf(index));
  const promo = move.promo ? '=' + ({ 2: 'n', 3: 'b', 4: 'r', 5: 'q' })[move.promo] : '';
  return square(move.from) + (move.flag === E.F_IL ? '<>' : '>') + square(move.to) + promo;
}

function reconstructStates() {
  const queue = [{ state: E.initialState(), ply: 1 }];
  const states = new Map();
  const seen = new Set();
  for (let index = 0; index < queue.length; index++) {
    const { state, ply } = queue[index];
    const key = E.getKey(state).toString();
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = book.entries[key];
    if (!Array.isArray(entry) || !Array.isArray(entry[2])) continue;
    states.set(key, state);
    if (ply >= Number(book.criteria.maxPly || 8)) continue;
    const legalMoves = E.genMoves(state, true);
    for (const [token] of entry[2]) {
      const parsed = typeof token === 'string' ? parseToken(token) : null;
      const move = parsed && legalMoves.find(candidate => moveMatchesToken(candidate, parsed));
      if (!move) fail(`jugada invàlida ${String(token)} a la posició ${key}`);
      const child = E.cloneState(state);
      E.make(child, move);
      const childKey = E.getKey(child).toString();
      if (book.entries[childKey]) queue.push({ state: child, ply: ply + 1 });
    }
  }
  return states;
}

const states = reconstructStates();
const visits = metadata.simulation.positionVisits || {};
const sample = [];
const candidatesByPly = [];
for (let ply = 2; ply <= 8; ply++) {
  const candidates = Object.entries(book.entries)
    .filter(([key, entry]) => Array.isArray(entry) && entry[0] === ply && Array.isArray(entry[2]) &&
      entry[2].length > 0 && states.has(key))
    .sort((a, b) => (visits[b[0]] || 0) - (visits[a[0]] || 0) || a[0].localeCompare(b[0]));
  candidatesByPly.push(candidates);
}

const initialTargets = candidatesByPly.map(candidates => Math.min(OPTIONS.perPly, candidates.length));
const initialTotal = initialTargets.reduce((sum, target) => sum + target, 0);
const availableTotal = candidatesByPly.reduce((sum, candidates) => sum + candidates.length, 0);
let targets;
if (initialTotal > OPTIONS.total) {
  targets = distributeProportionally(initialTargets, initialTargets, OPTIONS.total);
} else {
  const remainingBudget = Math.min(OPTIONS.total - initialTotal, availableTotal - initialTotal);
  const extraCapacity = candidatesByPly.map((candidates, index) => candidates.length - initialTargets[index]);
  const extras = distributeProportionally(extraCapacity, extraCapacity, remainingBudget);
  targets = initialTargets.map((target, index) => target + extras[index]);
}

if (availableTotal < OPTIONS.total) {
  console.log(`mostra reduïda: ${availableTotal} de ${OPTIONS.total} posicions`);
}
for (let index = 0; index < candidatesByPly.length; index++) {
  const ply = index + 2;
  sample.push(...candidatesByPly[index].slice(0, targets[index])
    .map(([key]) => ({ key, ply, state: states.get(key), entry: book.entries[key] })));
}
if (sample.length === 0) fail('no hi ha posicions amb jugades seleccionables per avaluar');

const regrets = [];
const oracleDepths = new Map();
let belowRequestedDepth = 0, belowWarningDepth = 0;
let blunders = 0, agreements = 0;
for (let index = 0; index < sample.length; index++) {
  const { key, state, entry } = sample[index];
  const legalMoves = E.genMoves(state, true);
  const bookMove = pickFromEntry(entry, legalMoves, margin, key + '|0');
  if (!bookMove) fail(`el selector no troba jugada per a la posició ${key}`);

  let oracle = E.search(state, { maxDepth: OPTIONS.depth, timeMs: OPTIONS.ms, blunder: 0 });
  if (!oracle.move) fail(`la cerca oracle no ha trobat jugada per a la posició ${key}`);
  let agrees = moveToken(oracle.move) === moveToken(bookMove);
  let bookScore = oracle.score;
  if (!agrees) {
    const child = E.cloneState(state);
    E.make(child, bookMove);
    let childOracle;
    while (true) {
      if (oracle.depth < 2) {
        fail(`no es poden comparar les cerques a la posició ${key}: fondària assolida ${oracle.depth}, cal com a mínim 2`);
      }
      childOracle = E.search(child, { maxDepth: oracle.depth - 1, timeMs: OPTIONS.ms, blunder: 0 });
      if (childOracle.depth === oracle.depth - 1) {
        bookScore = -childOracle.score;
        break;
      }

      const commonDepth = childOracle.depth + 1;
      if (commonDepth < 2) {
        fail(`no es poden comparar les cerques a la posició ${key}: fondària oracle ${oracle.depth}, fondària resposta ${childOracle.depth}`);
      }
      oracle = E.search(state, { maxDepth: commonDepth, timeMs: OPTIONS.ms, blunder: 0 });
      if (!oracle.move) fail(`la cerca oracle no ha trobat jugada per a la posició ${key}`);
      agrees = moveToken(oracle.move) === moveToken(bookMove);
      if (agrees) {
        bookScore = oracle.score;
        break;
      }
    }
  }
  agreements += Number(agrees);
  const rawRegret = oracle.score - bookScore;
  if (rawRegret < -1) {
    fail(`regret invàlid ${rawRegret} cp · posició ${key} · fondària ${oracle.depth} · best.score ${oracle.score} · bookScore ${bookScore} · token ${moveToken(bookMove)}`);
  }
  const regret = Math.max(0, rawRegret);
  regrets.push(regret);
  if (regret > 80) blunders++;
  oracleDepths.set(oracle.depth, (oracleDepths.get(oracle.depth) || 0) + 1);
  if (oracle.depth < OPTIONS.depth) belowRequestedDepth++;
  if (oracle.depth < OPTIONS.depth - 1) belowWarningDepth++;
  console.log(`[${index + 1}/${sample.length}] ply ${sample[index].ply} · profunditat oracle ${oracle.depth} · regret ${regret} cp`);
}

const sorted = [...regrets].sort((a, b) => a - b);
const median = sorted.length % 2
  ? sorted[(sorted.length - 1) / 2]
  : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
const mean = regrets.reduce((sum, regret) => sum + regret, 0) / regrets.length;
const blunderPercent = blunders * 100 / regrets.length;
const agreementPercent = agreements * 100 / regrets.length;
const passed = mean <= 25 && blunderPercent < 2 && agreementPercent > 45;
const samplePerPly = Object.fromEntries(candidatesByPly.map((candidates, index) => [
  String(index + 2), { shown: targets[index], available: candidates.length }
]));
const oracleResult = {
  schema: 1,
  generated: new Date().toISOString(),
  bookBuild: book.build,
  variant: OPTIONS.variant || 'custom',
  kingRules: { ...KING_RULES },
  criteria: {
    depth: OPTIONS.depth,
    ms: OPTIONS.ms,
    total: OPTIONS.total,
    perPly: OPTIONS.perPly
  },
  sample: { perPly: samplePerPly, totalShown: sample.length },
  regret: { mean, median, p95, max: sorted.at(-1) },
  blunders: {
    count: blunders, total: regrets.length, percent: blunderPercent, threshold: 80
  },
  agreement: { count: agreements, total: regrets.length, percent: agreementPercent },
  oracleDepths: {
    d5: oracleDepths.get(5) || 0,
    d6: oracleDepths.get(6) || 0,
    d7: oracleDepths.get(7) || 0
  },
  belowRequestedDepth,
  belowWarningDepth,
  passed,
  thresholds: { meanMax: 25, blunderPercentMax: 2, agreementMin: 45 }
};
const outPath = path.resolve(repo, OPTIONS.out);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(oracleResult, null, 2) + '\n');
console.log(`regret cp · mitjana ${mean.toFixed(1)} · mediana ${median.toFixed(1)} · p95 ${p95.toFixed(1)} · màxim ${sorted.at(-1)}`);
console.log(`pífies >80 cp ${blunders}/${regrets.length} (${blunderPercent.toFixed(2)}%) · concordança top-1 ${agreements}/${regrets.length} (${agreementPercent.toFixed(1)}%)`);
console.log(`fondàries oracle · d5: ${oracleDepths.get(5) || 0} · d6: ${oracleDepths.get(6) || 0} · ` +
  `d7: ${oracleDepths.get(7) || 0}`);
console.log(`posicions per sota de la fondària demanada (d${OPTIONS.depth}): ${belowRequestedDepth}/${regrets.length}`);
if (belowWarningDepth > regrets.length * 0.2) {
  console.warn(`[oracle-gate] WARNING: ${belowWarningDepth}/${regrets.length} posicions no arriben a d${OPTIONS.depth - 1}; ` +
    'la mesura de pífies és poc fiable.');
}
for (let index = 0; index < candidatesByPly.length; index++) {
  console.log(`mostra ply ${index + 2}: ${targets[index]} de ${candidatesByPly[index].length} disponibles`);
}
console.log(passed ? '[GATE SUPERAT]' : '[GATE FALLIT] llindars: mitjana ≤25 cp, pífies <2%, concordança >40%.');
console.log(`variant: ${OPTIONS.variant || 'personalitzada'} · kingRules: vertCapture=${KING_RULES.vertCapture} · celVisitsLimit=${KING_RULES.celVisitsLimit}`);
console.log(`resultats oracle desats a: ${outPath}`);
if (!passed) process.exitCode = 1;
