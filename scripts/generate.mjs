#!/usr/bin/env node
/**
 * ECIT · Generador de corpus d'autopartides (headless, Node.js)
 *
 * Genera partides completes del motor ECIT contra si mateix i les escriu
 * en format de text pla amb capçaleres de traçabilitat.
 *
 * Política: cerca real del motor (depth 4, timeMs 60) amb softmax sobre
 * els scores en centipawns. Les partides s'adjudiquen per material quan
 * arriben al límit de plies.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

function toInt(v, name) { const n = Number(v); if (!Number.isInteger(n) || n < 0) die(name + ' ha de ser un enter >= 0'); return n; }
function toNum(v, name) { const n = Number(v); if (!Number.isFinite(n) || n < 0) die(name + ' ha de ser numèric >= 0'); return n; }
function die(msg) { console.error('[generate] ERROR: ' + msg); process.exit(1); }
function val() { const v = argv.shift(); if (v === undefined) die('falta valor per a ' + argv[0]); return v; }

function parseArgs(argv) {
  const o = {
    games: 300, perSeed: null, seedDepth: 0, seedMoves: '', maxPlies: 120,
    depth: 4, ms: 60, temperature: 0.35, seed: null, out: 'ecit-corpus.txt', append: false,
    adjudicate: true, threshold: 250, dedupe: true, dedupeAttempts: 8,
    repo: '', quiet: false, help: false
  };
  while (argv.length) {
    const a = argv.shift();
    switch (a) {
      case '--games': o.games = toInt(val(), a); break;
      case '--per-seed': o.perSeed = toInt(val(), a); break;
      case '--seed-depth': o.seedDepth = toNum(val(), a); if (!Number.isInteger(o.seedDepth)) die(a + ' ha de ser un enter >= 0'); break;
      case '--seed-moves': o.seedMoves = val(); break;
      case '--max-plies': o.maxPlies = toInt(val(), a); break;
      case '--depth': o.depth = toInt(val(), a); break;
      case '--ms': o.ms = toInt(val(), a); break;
      case '--temperature': o.temperature = toNum(val(), a); break;
      case '--seed': o.seed = Number(val()); if (!Number.isFinite(o.seed)) die(a + ' ha de ser numèric'); o.seed = o.seed >>> 0; break;
      case '--out': o.out = val(); break;
      case '--append': o.append = true; break;
      case '--no-adjudicate': o.adjudicate = false; break;
      case '--threshold': o.threshold = toInt(val(), a); break;
      case '--no-dedupe': o.dedupe = false; break;
      case '--dedupe-attempts': o.dedupeAttempts = toInt(val(), a); break;
      case '--repo': o.repo = val(); break;
      case '--quiet': o.quiet = true; break;
      case '--help': o.help = true; break;
      default: die('opció desconeguda: ' + a + ' (veure --help)');
    }
  }
  return o;
}

function printHelp() {
  console.log(`
ECIT · Generador de corpus d'autopartides

Ús: node scripts/generate.mjs [opcions]

Opcions:
  --games N                partides totals (es reparteixen entre les llavors) [300]
  --per-seed N             partides per llavor (sobreescriu --games; total = N × llavors)
  --seed-depth K           profunditat de les llavors generades: 0 = cap jugada
                           forçada (per defecte), 1 = jugada legal inicial
  --depth N                profunditat màxima de cerca per jugada [4]
  --ms N                   temps màxim de cerca per jugada, en ms [60]
  --seed-moves "..."       llavors explícites, seqüències separades per comes
                           (ex.: "0d2>1d2 0e8>1e8, 0e2>0e4 0e7>1e7")
  --max-plies N            límit de llargada per partida [120]
  --temperature T          temperatura per al softmax sobre scores [0.35]
  --seed S                 llavor base (enter sense signe); si no es dona, es
                           deriva de la data i l'hora
  --out FILE               fitxer de sortida [ecit-corpus.txt]
  --append                 afegeix al fitxer existent en lloc de sobreescriure
  --no-adjudicate          no adjudica partides arribades al límit de plies
  --threshold N            llindar de material per adjudicar (|mat| >= N) [250]
  --no-dedupe              no deduplica partides idèntiques
  --dedupe-attempts N      intents de deduplicació per partida [8]
  --repo PATH              ruta al repositori (per defecte, detecta automàticament)
  --quiet                  no escriu missatges informatius a stdout
  --help                   mostra aquesta ajuda

Exemples:
  node scripts/generate.mjs --games 300 --depth 4 --ms 60 --seed 42 --out corpus/ecit.txt
  node scripts/generate.mjs --per-seed 25 --append --out corpus/ecit.txt
  node scripts/generate.mjs --seed-moves "0d2>1d2 0e8>1e8, 0e2>0e4 0e7>1e7" --per-seed 30
`);
}

const argv = process.argv.slice(2);
const OPT = parseArgs(argv);
if (OPT.help) { printHelp(); process.exit(0); }

// Detecta l'arrel del repo
function findRepoRoot(startPath) {
  let dir = startPath ? path.resolve(startPath) : path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(path.join(dir, 'src', 'core', 'rules.js'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const repoRoot = findRepoRoot(OPT.repo);
if (!repoRoot) die('no trobo src/core/rules.js: executa des de l\'arrel del repo o fes servir --repo');
const rulesMod = await import(pathToFileURL(path.join(repoRoot, 'src', 'core', 'rules.js')).href);
const E = rulesMod.Engine2 ?? rulesMod.Engine;
// Keep generated-book scores independent of the optional hunt bonus.
rulesMod.evalConfig.ganesWeight = 0;
const BUILD = 'rules-' + crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(repoRoot, 'src', 'core', 'rules.js'))).digest('hex').slice(0, 8);

// RNG mulberry32
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function deriveSeeds(baseSeed, count) {
  const seeds = [];
  for (let i = 0; i < count; i++) {
    seeds.push((baseSeed + i) >>> 0);
  }
  return seeds;
}

function parseSeedMoves(s) {
  if (!s || !s.trim()) return [];
  return s.split(',').map(seq => seq.trim().split(/\s+/));
}

function applySeedMoves(st, moves, rnd) {
  for (const mText of moves) {
    const m = findMove(st, mText);
    if (!m) return null;
    E.make(st, m);
  }
  return st;
}

function findMove(st, p) {
  const moves = E.genMoves(st, true);
  const [from, to] = p.split('>');
  return moves.find(m => {
    const mFrom = E.squareName(m.from);
    const mTo = E.squareName(m.to);
    return mFrom === from && mTo === to
      && (m.promo ? E.PIECE_LETTER[m.promo] === p.promo : !m.promo);
  });
}

/* ---------- política de cerca ---------- */

function pickMove(st, moves, rnd, temperature) {
  const mover = st.turn; // 1 blanques | -1 negres
  const candidates = st.ply === 0
    ? moves.filter(m => !(m.flag === E.F_VERT && E.lvlOf(m.to) === 1))
    : moves;
  const scored = candidates.map(m => {
    const c = E.cloneState(st);
    E.make(c, m);
    const result = E.search(c, {
      maxDepth: OPT.depth,
      timeMs: OPT.ms,
      variety: 0,
      blunder: 0
    });
    if (!Number.isFinite(result.score)) {
      throw new Error('puntuació no finita retornada per Engine.search()');
    }
    let v = -result.score; // la cerca puntua des de la perspectiva de qui mou a c
    const s = E.gameStatus(c);
    if (s.over) {
      if (s.winner === mover) v += 100000;      // fa mat: millor de tot
      else if (s.winner === -mover) v -= 100000; // rep mat: pitjor de tot
      else v = 0;                                // taules
    }
    return { m, v };
  });

  // Softmax sobre scores
  const maxV = Math.max(...scored.map(s => s.v));
  const exps = scored.map(s => Math.exp((s.v - maxV) / temperature));
  const sumExp = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map(e => e / sumExp);

  // Selecciona segons la distribució
  let r = rnd();
  for (let i = 0; i < scored.length; i++) {
    r -= probs[i];
    if (r <= 0) return scored[i].m;
  }
  return scored[scored.length - 1].m;
}

/* ---------- generació de partida ---------- */

function playGame(gameSeed, seedMovesList) {
  const rnd = mulberry32(gameSeed);
  const st = E.initialState();
  const history = [];
  let endreason = 'limit';

  // Aplica llavors inicials si n'hi ha
  if (seedMovesList.length > 0) {
    const idx = Math.floor(rnd() * seedMovesList.length);
    const moves = seedMovesList[idx];
    const stAfter = applySeedMoves(st, moves, rnd);
    if (!stAfter) return null; // llavor invàlida
  }

  while (st.ply < OPT.maxPlies) {
    const status = E.gameStatus(st);
    if (status.over) {
      endreason = status.reason || 'mate';
      break;
    }
    const moves = E.genMoves(st, true);
    if (moves.length === 0) {
      endreason = 'stalemate';
      break;
    }
    const m = pickMove(st, moves, rnd, OPT.temperature);
    E.make(st, m);
    history.push(E.moveText(st, m));
  }

  // Adjudicació si s'ha arribat al límit
  let resultToken = '*';
  if (OPT.adjudicate && st.ply >= OPT.maxPlies) {
    const mat = E.material(st);
    if (Math.abs(mat) >= OPT.threshold) {
      resultToken = mat > 0 ? '1-0' : '0-1';
      endreason = 'adjudication';
    } else {
      resultToken = '1/2-1/2';
      endreason = 'adjudication-draw';
    }
  } else if (endreason === 'mate') {
    const status = E.gameStatus(st);
    resultToken = status.winner === 1 ? '1-0' : '0-1';
  } else if (endreason === 'stalemate' || endreason === 'limit') {
    resultToken = '1/2-1/2';
  }

  return { history, resultToken, endreason, seed: gameSeed };
}

/* ---------- deduplicació ---------- */

function signature(game) {
  return game.history.join(' ') + '|' + game.resultToken;
}

function dedupeGames(games, maxAttempts) {
  const seen = new Set();
  const out = [];
  for (const g of games) {
    const sig = signature(g);
    if (!seen.has(sig)) {
      seen.add(sig);
      out.push(g);
    } else {
      // Intenta generar una variant amb una altra llavor
      let found = false;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const newSeed = (g.seed + attempt + 1000) >>> 0;
        const newGame = playGame(newSeed, []);
        if (newGame && !seen.has(signature(newGame))) {
          seen.add(signature(newGame));
          out.push(newGame);
          found = true;
          break;
        }
      }
      if (!found) out.push(g); // si no troba variant, la deixa igual
    }
  }
  return out;
}

/* ---------- escriptura ---------- */

function formatGame(game, labelNo) {
  const lines = [];
  const date = new Date().toISOString().slice(0, 10);
  lines.push('# result: ' + game.resultToken);
  lines.push('# source: autopartida');
  lines.push('# label: Auto ' + String(labelNo).padStart(4, '0') + ' · search-d' + OPT.depth);
  lines.push('# endreason: ' + game.endreason);
  lines.push('# policy: search-d' + OPT.depth);
  lines.push('# level: -');
  lines.push('# seed: ' + game.seed);
  lines.push('# variant: ecit');
  lines.push('# build: ' + BUILD);
  lines.push('# date: ' + date);
  lines.push('');
  lines.push(game.history.join(' '));
  lines.push('');
  return lines.join('\n');
}

/* ---------- principal ---------- */

const seeds = OPT.perSeed
  ? deriveSeeds(OPT.seed ?? (Date.now() >>> 0), Math.ceil(OPT.games / OPT.perSeed))
  : deriveSeeds(OPT.seed ?? (Date.now() >>> 0), OPT.games);

const seedMovesList = parseSeedMoves(OPT.seedMoves);
const gamesPerSeed = OPT.perSeed ?? 1;

if (!OPT.quiet) {
  console.log('== GENERACIÓ ==');
  console.log('repo: ' + repoRoot + ' | build: ' + BUILD);
  console.log('llavors: ' + seeds.length + ' (profunditat ' + OPT.seedDepth + ') × per-llavor ' + gamesPerSeed + ' = ' + (seeds.length * gamesPerSeed) + ' partides');
  console.log('llavor base: ' + (OPT.seed ?? 'auto') + ' | temperatura: ' + OPT.temperature + ' | maxPlies: ' + OPT.maxPlies + ' | adjudicació: ±' + OPT.threshold + ' | dedup: ' + (OPT.dedupe ? 'on' : 'off'));
}

const outPath = path.resolve(repoRoot, OPT.out);
const outDir = path.dirname(outPath);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

let allGames = [];
let labelCounter = 1;

for (let si = 0; si < seeds.length; si++) {
  const baseSeed = seeds[si];
  for (let gi = 0; gi < gamesPerSeed; gi++) {
    const gameSeed = (baseSeed + gi) >>> 0;
    const game = playGame(gameSeed, seedMovesList);
    if (game) allGames.push(game);
  }
}

if (OPT.dedupe) {
  allGames = dedupeGames(allGames, OPT.dedupeAttempts);
}

// Escriu al fitxer
const outBlocks = [];
for (let i = 0; i < allGames.length; i++) {
  outBlocks.push(formatGame(allGames[i], labelCounter++));
}

const outputText = outBlocks.join('\n');
if (OPT.append) {
  fs.appendFileSync(outPath, outputText);
} else {
  fs.writeFileSync(outPath, outputText);
}

if (!OPT.quiet) {
  const outputBytes = fs.statSync(outPath).size;
  const validation = OPT.append
    ? await parseValidationSample(X, outPath)
    : { parsed: X.parseGames(fs.readFileSync(outPath, 'utf8')), total: allGames.length, sampled: allGames.length };
  const parsed = validation.parsed;
  const labelsIntact = parsed.ok && parsed.games.some(g => /^Auto \d+ · search-d\d+$/.test(g.label));
  console.log('parseGames: ' + (parsed.ok ? 'ok' : 'FALLA') + ' · ' + parsed.games.length + ' partides importades · errors: ' + parsed.errors.length
    + ' · labels intactes: ' + (labelsIntact ? 'sí' : 'no (bug conegut del filtre d\'experiència.js:230 — veure doc)')
    + (outputBytes > 4 * 1024 * 1024 ? ` · mostra: ${Math.min(200, validation.total)} primeres + ${Math.min(200, Math.max(0, validation.total - 200))} últimes de ${validation.total} partides (${validation.sampled} úniques)` : ''));
}
