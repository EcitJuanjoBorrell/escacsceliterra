#!/usr/bin/env node
'use strict';
/* Generador d'autopartides ECIT headless (Node, sense navegador ni adapter).

   Fa jugar el motor real (src/core/rules.js) contra ell mateix amb política
   materialista d'1 pas de vista i MODE PER LLAVORS: les primeres jugades de
   l'obertura estan fixades (les legals de la posició inicial per defecte, o
   seqüències via --seed-moves) i es generen N partides per llavor amb
   temperatura per obtenir varietat. Les partides que arriben al límit de
   plies s'ADJUDICEN per material (|mat| >= llindar → victòria; sinó taula):
   això converteix la censura de llargada en senyal útil (mesurat al corpus
   19-11: 93% de censura → ~91% de partides decisives).

   Sortida: txt compatible amb parseGames d'experiència.js (capçaleres # +
   llista de jugades en una línia). Les capçaleres endreason/policy/seed/
   variant/build/date s'hi inclouen per a traçabilitat; parseGames les ignora
   sense error (i ara mateix descarta label/source/date per un bug del seu
   filtre de línies #: veure la doc).

   Reproduïble: mateixa --seed, mateixos paràmetres → mateix corpus. Cada
   partida porta la seva llavor numèrica derivada a la capçalera # seed.

   Exemples:
     node scripts/generate.mjs --games 300 --seed 42 --out corpus/ecit.txt
     node scripts/generate.mjs --per-seed 25 --append --out corpus/ecit.txt
     node scripts/generate.mjs --seed-moves "0d2>1d2 0e8>1e8, 0e2>0e4 0e7>1e7" --per-seed 30
*/

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';

/* ---------- CLI ---------- */

function die(msg) { console.error('[generate] ' + msg); process.exit(1); }
function toInt(v, name) { const n = Number(v); if (!Number.isInteger(n) || n <= 0) die(name + ' ha de ser un enter > 0'); return n; }
function toNum(v, name) { const n = Number(v); if (!Number.isFinite(n) || n < 0) die(name + ' ha de ser un nombre >= 0'); return n; }

function parseArgs(argv) {
  const o = {
    games: 300, perSeed: null, seedDepth: 1, seedMoves: '', maxPlies: 120,
    temperature: 0.35, seed: null, out: 'ecit-corpus.txt', append: false,
    adjudicate: true, threshold: 250, dedupe: true, dedupeAttempts: 8,
    repo: '', quiet: false, help: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { i++; if (i >= argv.length) die('falta valor per ' + a); return argv[i]; };
    switch (a) {
      case '--games': o.games = toInt(val(), a); break;
      case '--per-seed': o.perSeed = toInt(val(), a); break;
      case '--seed-depth': o.seedDepth = toInt(val(), a); break;
      case '--seed-moves': o.seedMoves = val(); break;
      case '--max-plies': o.maxPlies = toInt(val(), a); break;
      case '--temperature': o.temperature = toNum(val(), a); break;
      case '--seed': o.seed = Number(val()); if (!Number.isFinite(o.seed)) die(a + ' ha de ser numèric'); o.seed = o.seed >>> 0; break;
      case '--out': o.out = val(); break;
      case '--append': o.append = true; break;
      case '--no-adjudicate': o.adjudicate = false; break;
      case '--adjudicate-threshold': o.threshold = toInt(val(), a); break;
      case '--no-dedupe': o.dedupe = false; break;
      case '--dedupe-attempts': o.dedupeAttempts = toInt(val(), a); break;
      case '--repo': o.repo = val(); break;
      case '--quiet': o.quiet = true; break;
      case '--help': case '-h': o.help = true; break;
      default: die('opció desconeguda: ' + a + ' (veure --help)');
    }
  }
  return o;
}

function printHelp() {
  console.log(`Ús: node scripts/generate.mjs [opcions]

  --games N                partides totals (es reparteixen entre les llavors) [300]
  --per-seed N             partides per llavor (sobreescriu --games; total = N × llavors)
  --seed-depth K           profunditat de les llavors generades: 1 = les jugades
                           legals inicials (per defecte), 2 = jugada + resposta
  --seed-moves "..."       llavors explícites, seqüències separades per comes
                           (ex.: "0d2>1d2 0e8>1e8, 0e2>0e4 0e7>1e7")
  --max-plies N            límit de llargada per partida [120]
  --temperature X          varietat de la política (0 = determinista) [0.35]
  --seed N                 llavor base numèrica (per defecte: aleatòria, es mostra)
  --out FITXER             fitxer de sortida [ecit-corpus.txt]
  --append                 afegeix al fitxer existent sense duplicar partides
  --no-adjudicate          no adjudiquis al límit de plies (endreason: censura)
  --adjudicate-threshold N llindar de material per adjudicar [250]
  --no-dedupe              no descartis partides repetides
  --dedupe-attempts N      intents per aconseguir una partida no repetida [8]
  --repo RUTA              arrel del repo (si no, es busca des del cwd)
  --quiet                  sense línies de progrés`);
}

/* ---------- motor ---------- */

const OPT = parseArgs(process.argv.slice(2));
if (OPT.help) { printHelp(); process.exit(0); }

function findRepoRoot(explicit) {
  const tries = [];
  if (explicit) tries.push(path.resolve(explicit));
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) { tries.push(dir); dir = path.dirname(dir); }
  for (const c of tries) if (fs.existsSync(path.join(c, 'src', 'core', 'rules.js'))) return c;
  return null;
}

const repoRoot = findRepoRoot(OPT.repo);
if (!repoRoot) die('no trobo src/core/rules.js: executa des de l\u2019arrel del repo o fes servir --repo');
const rulesMod = await import(pathToFileURL(path.join(repoRoot, 'src', 'core', 'rules.js')).href);
const E = rulesMod.Engine2 ?? rulesMod.Engine;
const BUILD = 'rules-' + crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(repoRoot, 'src', 'core', 'rules.js'))).digest('hex').slice(0, 8);

/* ---------- material i ajuts ---------- */

const PV = E.PIECE_VALUE; // {1:100, 2:300, 3:310, 4:500, 5:900, 6:0}

/** Material blanc-negatiu / negre-positive, llegint b[256] directament. */
function material(st) {
  let s = 0;
  for (let i = 0; i < 256; i++) {
    const pc = st.b[i];
    if (pc) s += Math.sign(pc) * (PV[Math.abs(pc)] || 0);
  }
  return s;
}

/** RNG reproduïble (mateix algorisme que selfplay.js). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sqName(i) { return E.lvlOf(i) + 'abcdefgh'[E.colOf(i)] + (8 - E.rowOf(i)); }
const PROMO_CH = { 2: 'n', 3: 'b', 4: 'r', 5: 'q' };
const PROMO_CODE = { n: 2, b: 3, r: 4, q: 5 };
const TOKEN_RE = /^([01])?([a-h])([1-8])\s*(<>|>)\s*([01])?([a-h])([1-8])(?:=([nbrq]))?$/;

/** Jugada → token de text (format del panell Experiència). */
function moveToken(m) {
  const sep = m.flag === E.F_IL ? '<>' : '>';
  return sqName(m.from) + sep + sqName(m.to) + (m.promo ? '=' + PROMO_CH[m.promo] : '');
}

/** Token → coordenades (per a --seed-moves i per a revassar fitxers). */
function parseToken(tok) {
  const m = TOKEN_RE.exec(String(tok).trim());
  if (!m) return null;
  const fromL = m[1] === undefined ? 0 : Number(m[1]);
  const toL = m[5] === undefined ? fromL : Number(m[5]);
  return {
    from: E.idxOf(fromL, 8 - Number(m[3]), m[2].charCodeAt(0) - 97),
    to: E.idxOf(toL, 8 - Number(m[7]), m[6].charCodeAt(0) - 97),
    swap: m[4] === '<>',
    promo: m[8] ? PROMO_CODE[m[8]] : null,
    tok
  };
}

/** Troba la jugada legal del motor que coincideix amb el token. */
function findMove(st, p) {
  return E.genMoves(st, true).find(m =>
    m.from === p.from && m.to === p.to
    && (p.swap ? m.flag === E.F_IL : m.flag !== E.F_IL)
    && (p.promo ? m.promo === p.promo : !m.promo));
}

/* ---------- política materialista d'1 pas de vista ---------- */

function pickMove(st, moves, rnd, temperature) {
  const mover = st.turn; // 1 blanques | -1 negres
  const scored = moves.map(m => {
    const c = E.cloneState(st);
    E.make(c, m);
    let v = mover * material(c); // perspectiva de qui mou
    const s = E.gameStatus(c);
    if (s.over) {
      if (s.winner === mover) v += 100000;      // fa mat: millor de tot
      else if (s.winner === -mover) v -= 100000; // evita perdre de seguida
    }
    return { m, v };
  });
  scored.sort((a, b) => b.v - a.v);
  if (temperature <= 0.001) return scored[0].m;
  const top = scored[0].v;
  const span = Math.max(1, scored[0].v - scored[scored.length - 1].v);
  const weights = scored.map(x => Math.exp((x.v - top) / (span * temperature * 0.25 + 1)));
  let t = rnd() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < scored.length; i++) { t -= weights[i]; if (t <= 0) return scored[i].m; }
  return scored[0].m;
}

/* ---------- cobertura (plies 1-4) ---------- */

function newCoverage() {
  return { perPly: [1, 2, 3, 4].map(() => ({ obs: 0, keys: new Set(), om: new Map() })) };
}
function recordCoverage(cov, st, mv, ply) {
  const slot = cov.perPly[ply - 1];
  if (!slot) return;
  const key = E.getKey(st).toString();
  slot.obs++;
  slot.keys.add(key);
  const om = key + '|' + moveToken(mv);
  slot.om.set(om, (slot.om.get(om) || 0) + 1);
}

/* ---------- una partida ---------- */

function playGame(seedTokens, rng, cov) {
  let st = E.initialState();
  const tokens = [];
  let result = null, endreason = null;

  for (const tok of seedTokens) {
    const p = parseToken(tok);
    const mv = p && findMove(st, p);
    if (!mv) return { error: 'jugada llavor no reproduïble: «' + tok + '»' };
    recordCoverage(cov, st, mv, tokens.length + 1);
    tokens.push(moveToken(mv));
    E.make(st, mv);
  }

  while (tokens.length < OPT.maxPlies) {
    const moves = E.genMoves(st, true);
    if (!moves.length) { // només possible si una llavor acaba en mat/taula
      const s = E.gameStatus(st);
      if (s.over) { result = s.winner === 1 ? 'w' : s.winner === -1 ? 'b' : 'd'; endreason = s.winner ? 'mate' : s.result; }
      else return { error: 'sense jugades legals però sense final declarat' };
      break;
    }
    const mv = pickMove(st, moves, rng, OPT.temperature);
    recordCoverage(cov, st, mv, tokens.length + 1);
    tokens.push(moveToken(mv));
    E.make(st, mv);
    const s = E.gameStatus(st);
    if (s.over) {
      if (s.winner === 1) { result = 'w'; endreason = 'mate'; }
      else if (s.winner === -1) { result = 'b'; endreason = 'mate'; }
      else { result = 'd'; endreason = s.result; } // ofegat | 50mov | material
      break;
    }
  }

  if (!result) { // límit de plies: adjudicació per material
    const mat = material(st);
    if (OPT.adjudicate) {
      if (mat >= OPT.threshold) { result = 'w'; endreason = 'adjudicada'; }
      else if (mat <= -OPT.threshold) { result = 'b'; endreason = 'adjudicada'; }
      else { result = 'd'; endreason = 'taula'; }
    } else { result = 'd'; endreason = 'censura'; }
  }
  return { tokens, result, endreason, plies: tokens.length };
}

/* ---------- llavors ---------- */

/** Llavors generades per amplada des de la posició inicial (profunditat K). */
function autoSeeds(depth) {
  let frontier = [{ st: E.initialState(), tokens: [] }];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const f of frontier) {
      for (const mv of E.genMoves(f.st, true)) {
        const c = E.cloneState(f.st);
        E.make(c, mv);
        next.push({ st: c, tokens: f.tokens.concat(moveToken(mv)) });
      }
    }
    frontier = next;
  }
  return frontier.map(f => f.tokens);
}

/** Llavors explícites: seqüències separades per comes; es validen amb el motor. */
function explicitSeeds(spec) {
  const seqs = spec.split(',').map(s => s.trim().split(/\s+/).filter(Boolean)).filter(s => s.length);
  if (!seqs.length) die('--seed-moves no conté cap seqüència vàlida');
  seqs.forEach((seq, i) => {
    let st = E.initialState();
    for (let j = 0; j < seq.length; j++) {
      const p = parseToken(seq[j]);
      const mv = p && findMove(st, p);
      if (!mv) die('llavor ' + (i + 1) + ', jugada ' + (j + 1) + ' («' + seq[j] + '») no és legal amb el motor');
      E.make(st, mv);
    }
  });
  return seqs;
}

/* ---------- fitxer existent (mode append) ---------- */

function readExisting(file) {
  if (!fs.existsSync(file)) return { games: 0, keys: new Set(), maxLabel: 0 };
  const raw = fs.readFileSync(file, 'utf8');
  const keys = new Set();
  let maxLabel = 0, games = 0;
  raw.trim().split(/\n\s*\n/).forEach(block => {
    let result = null;
    const moveLines = [];
    block.split('\n').forEach(l => {
      const meta = /^#\s*result\s*:\s*(.+)$/i.exec(l);
      if (meta) result = meta[1].trim();
      else if (/^#\s*label\s*:\s*Auto\s+(\d+)/i.test(l)) maxLabel = Math.max(maxLabel, Number(RegExp.$1));
      else if (l.trim() && !l.startsWith('#')) moveLines.push(l);
    });
    const moves = moveLines.join(' ').trim();
    if (moves) { games++; keys.add(moves + '|' + (result === '1-0' ? 'w' : result === '0-1' ? 'b' : 'd')); }
  });
  return { games, keys, maxLabel };
}

function writeOutput(outPath, blocks, append) {
  const body = blocks.join('\n\n') + '\n';
  if (append && fs.existsSync(outPath)) {
    const raw = fs.readFileSync(outPath, 'utf8');
    fs.writeFileSync(outPath, raw.replace(/\s*$/, '\n\n') + body);
  } else {
    fs.writeFileSync(outPath, body);
  }
}

/* ---------- validació ---------- */

/** Repassa totes les partides generades amb el motor real (des dels tokens). */
function engineValidation(games) {
  let ok = 0, castlings = 0;
  const bad = [];
  for (const g of games) {
    let st = E.initialState(), good = true;
    for (const tok of g.tokens) {
      if (tok.includes('<>') || /^(0|1)[ae-h]?/.test(tok) === false) { /* no-op */ }
      if (tok.includes('<>')) castlings++;
      const p = parseToken(tok);
      const mv = p && findMove(st, p);
      if (!mv) { bad.push({ label: g.label, tok }); good = false; break; }
      E.make(st, mv);
    }
    if (good) ok++;
  }
  return { ok, bad, castlings };
}

/** Carrega experience.js (parseGames) en Node; shim si l'import JSON falla. */
async function loadParseGames(repo) {
  globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const direct = path.join(repo, 'src', 'engine', 'experience.js');
  try {
    return { X: await import(pathToFileURL(direct).href), shim: null };
  } catch (e1) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecit-exp-'));
    fs.copyFileSync(direct, path.join(dir, 'experience.js'));
    fs.copyFileSync(path.join(repo, 'src', 'engine', 'experience.data.json'), path.join(dir, 'experience.data.json'));
    const src = fs.readFileSync(path.join(dir, 'experience.js'), 'utf8');
    const patched = src.replace(
      /^import seed from '\.\/experience\.data\.json';$/m,
      "import fs0 from 'node:fs';\nconst seed = JSON.parse(fs0.readFileSync(new URL('./experience.data.json', import.meta.url), 'utf8'));"
    );
    if (patched === src) throw e1;
    fs.writeFileSync(path.join(dir, 'experience.js'), patched);
    return { X: await import(pathToFileURL(path.join(dir, 'experience.js')).href), shim: dir };
  }
}

async function parseValidationSample(X, file) {
  const first = [], last = [];
  let total = 0, block = [];
  const addBlock = () => {
    if (!block.length) return;
    const text = block.join('\n');
    block = [];
    if (!text.trim()) return;
    const item = { index: total++, text };
    if (item.index < 200) first.push(item);
    last.push(item);
    if (last.length > 200) last.shift();
  };
  const lines = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });
  for await (const line of lines) {
    if (!line.trim()) addBlock();
    else block.push(line);
  }
  addBlock();
  const sample = new Map([...first, ...last].map(item => [item.index, item.text]));
  const parsed = X.parseGames([...sample.entries()].sort((a, b) => a[0] - b[0]).map(([, text]) => text).join('\n\n'));
  return { parsed, total, sampled: sample.size };
}

/* ---------- executable ---------- */

const baseSeed = OPT.seed !== null ? OPT.seed : Math.floor(Math.random() * 1e9);
const seeds = OPT.seedMoves ? explicitSeeds(OPT.seedMoves) : autoSeeds(OPT.seedDepth);
if (seeds.length > 5000) die('massa llavors (' + seeds.length + '): baixa --seed-depth o fes servir --seed-moves');
const perSeed = OPT.perSeed !== null ? OPT.perSeed : Math.max(1, Math.round(OPT.games / seeds.length));
const total = perSeed * seeds.length;
const coverage = newCoverage();

console.log('== GENERACIÓ ==');
console.log('repo: ' + repoRoot + ' | build: ' + BUILD);
console.log('llavors: ' + seeds.length + ' (profunditat ' + (OPT.seedMoves ? 'explicita' : OPT.seedDepth) + ') × per-llavor ' + perSeed + ' = ' + total + ' partides');
console.log('llavor base: ' + baseSeed + ' | temperatura: ' + OPT.temperature + ' | maxPlies: ' + OPT.maxPlies
  + ' | adjudicació: ' + (OPT.adjudicate ? '±' + OPT.threshold : 'off') + ' | dedup: ' + (OPT.dedupe ? 'on' : 'off'));

const existing = OPT.append ? readExisting(OPT.out) : null;
if (OPT.append) console.log('mode append: ' + existing.games + ' partides al fitxer, continuo la numeració a Auto ' + (existing.maxLabel + 1));
const seen = OPT.dedupe ? (OPT.append ? existing.keys : new Set()) : null;

const outBlocks = [];
const counts = { w: 0, b: 0, d: 0 };
const reasons = {};
const errors = [];
let generated = 0, dupSkipped = 0, labelNo = OPT.append ? existing.maxLabel : 0;
const t0 = Date.now();
const progressEvery = Math.max(1, Math.floor(total / 10));

for (let si = 0; si < seeds.length; si++) {
  for (let j = 0; j < perSeed; j++) {
    let g = null, gameSeed = 1, attempts = 0;
    do {
      gameSeed = ((baseSeed ^ ((si * 7919 + j * 104729 + attempts * 2654435761) >>> 0)) >>> 0) || 1;
      g = playGame(seeds[si], mulberry32(gameSeed), coverage);
      attempts++;
    } while (!g.error && OPT.dedupe && attempts <= OPT.dedupeAttempts
      && seen.has(g.tokens.join(' ') + '|' + g.result));
    if (g.error) { if (errors.length < 12) errors.push(g.error); continue; }
    const key = g.tokens.join(' ') + '|' + g.result;
    if (OPT.dedupe && seen.has(key)) { dupSkipped++; continue; }
    if (OPT.dedupe) seen.add(key);
    labelNo++;
    counts[g.result]++;
    reasons[g.endreason] = (reasons[g.endreason] || 0) + 1;
    const resultToken = g.result === 'w' ? '1-0' : g.result === 'b' ? '0-1' : '1/2';
    outBlocks.push([
      '# result: ' + resultToken,
      '# source: autopartida',
      '# label: Auto ' + String(labelNo).padStart(4, '0') + ' · material',
      '# endreason: ' + g.endreason,
      '# policy: material',
      '# level: -',
      '# seed: ' + gameSeed,
      '# variant: ecit',
      '# build: ' + BUILD,
      '# date: ' + new Date().toISOString().slice(0, 10),
      g.tokens.join(' ')
    ].join('\n'));
    generated++;
    if (!OPT.quiet && generated % progressEvery === 0) {
      console.log('[' + generated + '/' + total + '] ' + Math.round((Date.now() - t0) / 1000) + 's · mate ' + (reasons.mate || 0)
        + ' · adjudicada ' + (reasons.adjudicada || 0) + ' · taula ' + (reasons.taula || 0));
    }
  }
}

if (errors.length) console.log('\nerrors de generació (' + errors.length + '):');
errors.forEach(e => console.log('  - ' + e));

/* ---------- sortida ---------- */

const outPath = path.resolve(OPT.out);
let fileBytes = 0;
if (outBlocks.length) {
  writeOutput(outPath, outBlocks, OPT.append);
  fileBytes = fs.statSync(outPath).size;
} else {
  console.log('cap partida nova a escriure' + (OPT.append ? ' (totes repetides)' : ''));
}

/* ---------- informe ---------- */

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log('\n== INFORME ==');
console.log('partides generades: ' + generated + (dupSkipped ? ' (repetides descartades: ' + dupSkipped + ')' : '') + ' · ' + secs + ' s (' + (generated ? (secs / generated).toFixed(2) : '—') + ' s/partida)');
console.log('resultats: 1-0 ' + counts.w + ' | 0-1 ' + counts.b + ' | 1/2 ' + counts.d);
console.log('motius de final: ' + JSON.stringify(reasons));
console.log('cobertura plies 1-4 (posicions úniques / (pos,jugada) úniques amb n≥3 / n≥5 / n≥10):');
for (let p = 0; p < 4; p++) {
  const slot = coverage.perPly[p];
  if (!slot || !slot.obs) continue;
  let n3 = 0, n5 = 0, n10 = 0;
  for (const c of slot.om.values()) { if (c >= 3) n3++; if (c >= 5) n5++; if (c >= 10) n10++; }
  console.log('  ply ' + (p + 1) + ': obs ' + slot.obs + ' · pos ' + slot.keys.size + ' · om ' + slot.om.size + ' · n≥3 ' + n3 + ' · n≥5 ' + n5 + ' · n≥10 ' + n10);
}
if (outBlocks.length) {
  console.log('fitxer: ' + outPath + ' (' + fileBytes + ' B, ~' + Math.round(fileBytes / (existing ? existing.games + generated : generated)) + ' B/partida)');
}

/* ---------- validació ---------- */

console.log('\n== VALIDACIÓ ==');
if (outBlocks.length) {
  const gen = outBlocks.map((text, i) => ({ label: 'Auto ' + String((OPT.append ? existing.maxLabel : 0) + i + 1), tokens: text.split('\n').pop().split(' ') }));
  const ev = engineValidation(gen);
  console.log('motor real: ' + ev.ok + '/' + gen.length + ' partides reprodueixen sense errors' + (ev.bad.length ? ' — BUGS: ' + JSON.stringify(ev.bad.slice(0, 3)) : '') + ' (enrocs <>: ' + ev.castlings + ')');
  try {
    const { X } = await loadParseGames(repoRoot);
    const outputBytes = fs.statSync(outPath).size;
    const validation = outputBytes > 4 * 1024 * 1024
      ? await parseValidationSample(X, outPath)
      : { parsed: X.parseGames(fs.readFileSync(outPath, 'utf8')), total: generated, sampled: generated };
    const parsed = validation.parsed;
    const labelsIntact = parsed.ok && parsed.games.some(g => /^Auto \d+ · material$/.test(g.label));
    console.log('parseGames: ' + (parsed.ok ? 'ok' : 'FALLA') + ' · ' + parsed.games.length + ' partides importades · errors: ' + parsed.errors.length
      + ' · labels intactes: ' + (labelsIntact ? 'sí' : 'no (bug conegut del filtre d\u2019experiència.js:230 — veure doc)')
      + (outputBytes > 4 * 1024 * 1024 ? ` · mostra: ${Math.min(200, validation.total)} primeres + ${Math.min(200, Math.max(0, validation.total - 200))} últimes de ${validation.total} partides (${validation.sampled} úniques)` : ''));
    if (parsed.errors.length) console.log('  primers errors: ' + JSON.stringify(parsed.errors.slice(0, 3)));
  } catch (e) {
    console.log('parseGames: no carregable headless (' + (e.code || e.message) + ') — valida-ho des del panell Experiència');
  }
}
if (generated === 0 && errors.length) process.exit(1);
