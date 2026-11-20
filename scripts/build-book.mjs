#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

function fail(message) {
  console.error('[build-book] ' + message);
  process.exit(1);
}

function integer(value, option) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) fail(option + ' ha de ser un enter > 0');
  return number;
}

function parseArgs(argv) {
  const options = { maxPly: 16, minObs: 3, minWilson: 0.35, out: 'public/book/ecit-book.json', repo: '', quiet: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--quiet') { options.quiet = true; continue; }
    if (!arg.startsWith('--')) { options.files.push(arg); continue; }
    const value = argv[++i];
    if (value === undefined) fail('falta valor per ' + arg);
    if (arg === '--max-ply') options.maxPly = integer(value, arg);
    else if (arg === '--min-obs') options.minObs = integer(value, arg);
    else if (arg === '--min-wilson') {
      options.minWilson = Number(value);
      if (!Number.isFinite(options.minWilson) || options.minWilson < 0 || options.minWilson > 1) fail(arg + ' ha d’estar entre 0 i 1');
    } else if (arg === '--out') options.out = value;
    else if (arg === '--repo') options.repo = value;
    else fail('opció desconeguda: ' + arg);
  }
  if (!options.files.length) fail('indica almenys un corpus txt');
  return options;
}

function findRepoRoot(explicit) {
  const candidates = [];
  if (explicit) candidates.push(path.resolve(explicit));
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) { candidates.push(dir); dir = path.dirname(dir); }
  return candidates.find(candidate => fs.existsSync(path.join(candidate, 'src/core/rules.js'))) || null;
}

function wilson(w, d, n, z = 1.96) {
  if (!n) return 0;
  const p = (w + d * 0.5) / n;
  const dd = 1 + z * z / n;
  const centre = p + z * z / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p) + d * 0.25 / n) / n);
  return Math.max(0, (centre - spread) / dd);
}

const TOKEN = /^([01])?([a-h])([1-8])\s*(<>|>)\s*([01])?([a-h])([1-8])(?:=([nbrq]))?$/i;
const PROMO = { n: 2, b: 3, r: 4, q: 5 };
const FILES = 'abcdefgh';

function decodeToken(E, token) {
  const match = TOKEN.exec(token);
  if (!match) return null;
  const fromLevel = match[1] === undefined ? 0 : Number(match[1]);
  const toLevel = match[5] === undefined ? fromLevel : Number(match[5]);
  return {
    from: E.idxOf(fromLevel, 8 - Number(match[3]), FILES.indexOf(match[2].toLowerCase())),
    to: E.idxOf(toLevel, 8 - Number(match[7]), FILES.indexOf(match[6].toLowerCase())),
    flag: match[4] === '<>' ? E.F_IL : null,
    promo: match[8] ? PROMO[match[8].toLowerCase()] : 0
  };
}

function moveToken(E, move) {
  const square = index => E.lvlOf(index) + FILES[E.colOf(index)] + (8 - E.rowOf(index));
  return square(move.from) + (move.flag === E.F_IL ? '<>' : '>') + square(move.to) +
    (move.promo ? '=' + ({ 2: 'n', 3: 'b', 4: 'r', 5: 'q' })[move.promo] : '');
}

function readGame(block) {
  let result = 'd', label = '';
  const tokens = [];
  for (const line of block) {
    const resultLine = /^\s*#\s*(?:result|resultat)\s*:\s*(.+)$/i.exec(line);
    if (resultLine) {
      const value = resultLine[1].trim().toLowerCase();
      result = ['1-0', 'white', 'blanques', 'w'].includes(value) ? 'w'
        : ['0-1', 'black', 'negres', 'b'].includes(value) ? 'b' : 'd';
      continue;
    }
    const labelLine = /^\s*#\s*(?:label|etiqueta)\s*:\s*(.+)$/i.exec(line);
    if (labelLine) { label = labelLine[1].trim(); continue; }
    if (!/^\s*#/.test(line)) {
      tokens.push(...line.replace(/\b\d+\.(?:\.\.)?/g, ' ').split(/[\s,;]+/).filter(Boolean));
    }
  }
  return { result, label, tokens };
}

function absorbGame(E, game, maxPly, entries) {
  const state = E.initialState();
  const observations = [];
  for (let index = 0; index < game.tokens.length; index++) {
    const token = game.tokens[index];
    const parsed = decodeToken(E, token);
    const move = parsed && E.genMoves(state, true).find(candidate =>
      candidate.from === parsed.from && candidate.to === parsed.to &&
      (parsed.flag === E.F_IL ? candidate.flag === E.F_IL : candidate.flag !== E.F_IL) &&
      candidate.promo === parsed.promo);
    if (!move) return { error: { label: game.label || '(sense etiqueta)', ply: index + 1, token } };
    if (index < maxPly) observations.push({ key: E.getKey(state).toString(), ply: index + 1, move: moveToken(E, move), side: state.turn });
    E.make(state, move);
  }
  for (const item of observations) {
    let position = entries.get(item.key);
    if (!position) {
      position = { ply: item.ply, observations: 0, moves: new Map() };
      entries.set(item.key, position);
    }
    position.ply = Math.min(position.ply, item.ply);
    position.observations++;
    let counts = position.moves.get(item.move);
    if (!counts) { counts = [0, 0, 0]; position.moves.set(item.move, counts); }
    if (game.result === 'd') counts[1]++;
    else if ((item.side === E.WHITE && game.result === 'w') || (item.side === E.BLACK && game.result === 'b')) counts[0]++;
    else counts[2]++;
  }
  return { error: null };
}

const OPTIONS = parseArgs(process.argv.slice(2));
const repo = findRepoRoot(OPTIONS.repo);
if (!repo) fail('no trobo src/core/rules.js; executa des de l’arrel o fes servir --repo');
const rulesPath = path.join(repo, 'src/core/rules.js');
const rules = await import(pathToFileURL(rulesPath).href);
const E = rules.Engine2 ?? rules.Engine;
const build = 'rules-' + crypto.createHash('sha256').update(fs.readFileSync(rulesPath)).digest('hex').slice(0, 8);

const entries = new Map(), seen = new Set(), errors = [];
let games = 0, duplicates = 0, replayErrors = 0;

for (const input of OPTIONS.files) {
  const file = path.resolve(input);
  if (!fs.existsSync(file)) fail('no existeix el corpus: ' + input);
  const stream = fs.createReadStream(file, { encoding: 'utf8' });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let block = [];
  const processBlock = () => {
    if (!block.length) return;
    const game = readGame(block);
    block = [];
    if (!game.tokens.length) return;
    const signature = game.tokens.join(' ') + '|' + game.result;
    if (seen.has(signature)) { duplicates++; return; }
    seen.add(signature);
    let replay;
    try { replay = absorbGame(E, game, OPTIONS.maxPly, entries); }
    catch (error) {
      replay = { error: { label: game.label || '(sense etiqueta)', ply: 1, token: error?.message || String(error) } };
    }
    if (replay.error) {
      replayErrors++;
      if (errors.length < 3) errors.push(replay.error);
      return;
    }
    games++;
  };
  for await (const line of lines) {
    if (!line.trim()) processBlock();
    else block.push(line);
  }
  processBlock();
}

const perPly = {};
const serializedEntries = {};
for (const [key, position] of entries) {
  const moves = [...position.moves]
    .filter(([, [w, d, l]]) => {
      const n = w + d + l;
      return n >= OPTIONS.minObs && wilson(w, d, n) >= OPTIONS.minWilson;
    })
    .sort((a, b) => wilson(...b[1].slice(0, 2), b[1].reduce((sum, n) => sum + n, 0)) -
      wilson(...a[1].slice(0, 2), a[1].reduce((sum, n) => sum + n, 0)))
    .map(([token, [w, d, l]]) => [token, w, d, l]);
  if (!moves.length) continue;
  serializedEntries[key] = [position.ply, moves];
  const ply = perPly[position.ply] || (perPly[position.ply] = { entries: 0, observations: 0, solidMoves: 0, varietyPositions: 0 });
  ply.entries++;
  ply.observations += position.observations;
  ply.solidMoves += moves.length;
  if (moves.length >= 2) ply.varietyPositions++;
}

const varietyPositions = Object.values(serializedEntries).filter(([, moves]) => moves.length >= 2).length;
const generated = new Date().toISOString().slice(0, 10);
const book = {
  schema: 1, variant: 'ecit', build, generated,
  criteria: { minObs: OPTIONS.minObs, minWilson: OPTIONS.minWilson, maxPly: OPTIONS.maxPly },
  source: { games, duplicates, files: OPTIONS.files },
  entries: serializedEntries
};
const metadata = { schema: 1, variant: 'ecit', build, generated, plies: perPly, varietyPositions };
const outputPath = path.resolve(repo, OPTIONS.out);
const metaPath = outputPath.replace(/\.json$/i, '.meta.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const json = JSON.stringify(book);
fs.writeFileSync(outputPath, json + '\n');
fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2) + '\n');

const byteSize = Buffer.byteLength(json);
const compressedSize = zlib.gzipSync(json).byteLength;
console.log('== INFORME LLIBRE ECIT ==');
console.log(`partides llegides: ${games + duplicates + replayErrors} · duplicades descartades: ${duplicates} · errors de replay: ${replayErrors}`);
errors.forEach(error => console.log(`  - ${error.label}, ply ${error.ply}: ${error.token} (jugada no legal o invàlida)`));
console.log(`entrades sòlides: ${Object.keys(serializedEntries).length} · posicions amb ≥2 jugades sòlides: ${varietyPositions}`);
for (let ply = 1; ply <= OPTIONS.maxPly; ply++) {
  const data = perPly[ply] || { entries: 0, observations: 0, solidMoves: 0, varietyPositions: 0 };
  console.log(`  ply ${ply}: ${data.entries} entrades · ${data.observations} observacions · ${data.solidMoves} jugades sòlides`);
}
console.log(`JSON: ${byteSize} B · gzip estimat: ${compressedSize} B · ${outputPath}`);
console.log('10 obertures amb més observacions:');
const openings = [...entries].filter(([, value]) => value.ply <= 8)
  .sort((a, b) => b[1].observations - a[1].observations).slice(0, 10);
for (const [key, position] of openings) {
  const recommended = [...position.moves].filter(([, [w, d, l]]) => {
    const n = w + d + l;
    return n >= OPTIONS.minObs && wilson(w, d, n) >= OPTIONS.minWilson;
  }).sort((a, b) =>
    wilson(b[1][0], b[1][1], b[1].reduce((sum, n) => sum + n, 0)) -
    wilson(a[1][0], a[1][1], a[1].reduce((sum, n) => sum + n, 0)))[0]?.[0] || '(cap jugada sòlida)';
  console.log(`  ply ${position.ply} · ${key.slice(0, 20)}… · ${position.observations} obs · recomanada ${recommended}`);
}
if (!OPTIONS.quiet) console.log(`metadades: ${metaPath} · build ${build}`);
