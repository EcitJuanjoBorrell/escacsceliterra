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
    seed: 1, maxPlies: 120, adjudicate: 100, adjudicateBand: 30, out: null, quiet: false,
    openingMinPlies: 2, openingMaxPlies: 4, openingMaxEval: 150, openings: null
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--quiet') { options.quiet = true; continue; }
    if (arg === '--help') {
      console.log(`Ús: node scripts/ab-rules-test.mjs [opcions]
  --variant A|B|C       Variant a provar
  --king-rule RULE      Sobreescriu una regla del rei (repetible)
  --games N             Nombre total de partides (300)
  --openings M          Nombre d'obertures (per defecte: --games)
  --opening-min-plies N Mig-moviments mínims d'obertura (2)
  --opening-max-plies N Mig-moviments màxims d'obertura (4)
  --opening-max-eval N  Avaluació absoluta màxima en centipawns (150)
  --depth N             Profunditat de cerca (4)
  --ms N                Pressupost de cerca per jugada (60)
  --seed N              Llavor del generador (1)
  --max-plies N         Límit de mig-moviments per partida (120)
  --adjudicate N        Límit de mig-moviments abans d'adjudicar (100)
  --adjudicate-band N   Banda d'avaluació per a taules en centipawns (30)
  --out PATH            Fitxer JSON de sortida
  --quiet               Redueix la sortida de consola`);
      process.exit(0);
    }
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
    else if (arg === '--adjudicate-band') options.adjudicateBand = nonNegativeInt(value, arg);
    else if (arg === '--opening-min-plies') options.openingMinPlies = positiveInt(value, arg);
    else if (arg === '--opening-max-plies') options.openingMaxPlies = positiveInt(value, arg);
    else if (arg === '--opening-max-eval') options.openingMaxEval = nonNegativeInt(value, arg);
    else if (arg === '--openings') options.openings = positiveInt(value, arg);
    else if (arg === '--out') options.out = value;
    else fail('opció desconeguda: ' + arg);
  }
  if (options.openingMaxPlies < options.openingMinPlies) {
    fail('--opening-max-plies ha de ser >= --opening-min-plies');
  }
  if (options.openings === null) options.openings = options.games;
  return options;
}

const OPTIONS = parseArgs(process.argv.slice(2));
if (OPTIONS.adjudicate >= OPTIONS.maxPlies) {
  console.warn("[AB] WARNING: --adjudicate >= --max-plies; l'adjudicació per mig-moviments no s'activarà mai.");
}
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
const moveRecord = move => ({
  from: move.from, to: move.to, flag: move.flag, promo: move.promo || 0
});

function captureAt(state, move) {
  if (move.flag === E.F_EP) {
    const capSq = move.to + (state.turn === E.WHITE ? 16 : -16);
    return state.b[capSq] !== 0;
  }
  return move.flag === E.F_VCAP || state.b[move.to] !== 0;
}

function generateOpenings(count, rng) {
  const savedRules = { ...KING_RULES };
  const openings = [];
  const maxAttempts = count * 20;
  Object.assign(KING_RULES, variants.A);
  try {
    for (let attempt = 0; attempt < maxAttempts && openings.length < count; attempt++) {
      const targetParity = openings.length % 2;
      const parityLengths = [];
      for (let plies = OPTIONS.openingMinPlies; plies <= OPTIONS.openingMaxPlies; plies++) {
        if (plies % 2 === targetParity) parityLengths.push(plies);
      }
      const lengths = parityLengths.length ? parityLengths : Array.from(
        { length: OPTIONS.openingMaxPlies - OPTIONS.openingMinPlies + 1 },
        (_, index) => OPTIONS.openingMinPlies + index
      );
      const plies = lengths[Math.floor(rng() * lengths.length)];
      const state = E.initialState();
      const moves = [];
      for (let ply = 0; ply < plies; ply++) {
        const legalMoves = E.genMoves(state, true);
        if (!legalMoves.length) break;
        const move = legalMoves[Math.floor(rng() * legalMoves.length)];
        const text = E.moveText(state, move);
        moves.push({ ...moveRecord(move), text });
        E.make(state, move);
      }
      if (moves.length !== plies || Math.abs(E.evalState(state)) > OPTIONS.openingMaxEval) continue;
      openings.push({ plies, moves });
    }
  } finally {
    Object.assign(KING_RULES, savedRules);
  }
  if (openings.length < count) {
    console.warn(`[AB] WARNING: només s'han generat ${openings.length}/${count} obertures vàlides després de ${maxAttempts} intents.`);
  }
  return openings;
}

function replayOpening(opening) {
  const state = E.initialState();
  const positionKeys = [E.getKey(state).toString()];
  const stats = {
    kingVertMoves: 0, kingVertCaptures: 0, kingCelEntries: 0,
    captures: 0, promotions: 0, checksGiven: 0
  };
  for (const move of opening.moves) {
    const legal = E.genMoves(state, true).find(candidate =>
      candidate.from === move.from && candidate.to === move.to &&
      candidate.flag === move.flag && (candidate.promo || 0) === move.promo);
    if (!legal) return null;
    const mover = state.turn;
    const isKingVertical = Math.abs(state.b[legal.from]) === E.KING && legal.flag === E.F_VERT;
    const isCapture = captureAt(state, legal);
    if (isKingVertical) stats.kingVertMoves++;
    if (isKingVertical && isCapture) stats.kingVertCaptures++;
    if (isKingVertical && (legal.to >> 7) === 1) stats.kingCelEntries++;
    if (isCapture) stats.captures++;
    if (legal.promo) stats.promotions++;
    E.make(state, legal);
    positionKeys.push(E.getKey(state).toString());
    if (E.inCheck(state, -mover)) stats.checksGiven++;
  }
  return { state, positionKeys, stats };
}

const generatedOpenings = generateOpenings(OPTIONS.openings, random);
let skippedIllegal = 0;
const legalOpenings = [];
for (const opening of generatedOpenings) {
  const replay = replayOpening(opening);
  if (!replay) {
    skippedIllegal++;
    continue;
  }
  legalOpenings.push({ ...opening, ...replay });
}
const openingPools = [0, 1].map(parity =>
  legalOpenings.filter(opening => opening.plies % 2 === parity)
);

function playGame(gameIndex, opening) {
  const state = E.cloneState(opening.state);
  const moveSequence = opening.moves.map(moveRecord);

  const uniquePositions = new Set(opening.positionKeys);
  let plyCount = opening.plies;
  let { kingVertMoves, kingVertCaptures, kingCelEntries, captures, promotions, checksGiven } = opening.stats;
  let endReason = 'maxPlyReached';
  let result = '1/2-1/2';
  const errors = [];
  let searchCount = 0;
  let depthSum = 0;
  let depthShortfallCount = 0;
  let timeSum = 0;
  let timeMax = 0;

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
        break;
      }

      const mover = state.turn;
      const search = E.search(state, { maxDepth: OPTIONS.depth, timeMs: OPTIONS.ms });
      searchCount++;
      depthSum += search.depth;
      if (search.depth < OPTIONS.depth) depthShortfallCount++;
      timeSum += search.timeMs;
      timeMax = Math.max(timeMax, search.timeMs);
      if (!search.move) throw new Error('la cerca no ha retornat una jugada');

      const legal = E.genMoves(state, true).find(move =>
        move.from === search.move.from && move.to === search.move.to &&
        move.flag === search.move.flag && move.promo === search.move.promo);
      if (!legal) throw new Error('la cerca ha retornat una jugada il·legal');

      const isKingVertical = Math.abs(state.b[legal.from]) === E.KING && legal.flag === E.F_VERT;
      const isCapture = captureAt(state, legal);
      moveSequence.push(moveRecord(legal));
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

  const finalEval = E.evalState(state);
  if (endReason === 'adjudicated' || endReason === 'maxPlyReached') {
    // evalState és blanc-positiu: un valor positiu afavoreix les blanques.
    if (finalEval > OPTIONS.adjudicateBand) result = '1-0';
    else if (finalEval < -OPTIONS.adjudicateBand) result = '0-1';
    else result = '1/2-1/2';
  }

  return {
    plyCount,
    endReason,
    result,
    searchCount,
    depthSum,
    depthShortfallCount,
    timeSum,
    timeMax,
    finalEvalAbs: Math.abs(finalEval),
    kingVertMoves,
    kingVertCaptures,
    kingCelEntries,
    uniquePositions: uniquePositions.size,
    moveHash: crypto.createHash('sha256').update(JSON.stringify(moveSequence)).digest('hex'),
    captures,
    promotions,
    checksGiven,
    errors
  };
}

const games = [];
const errors = [];
if (legalOpenings.length) for (let game = 0; game < OPTIONS.games; game++) {
  const pool = openingPools[game % 2].length ? openingPools[game % 2] : legalOpenings;
  const opening = pool[Math.floor(game / 2) % pool.length];
  const report = playGame(game, opening);
  games.push(report);
  if (report.errors.length) errors.push(...report.errors);
  if (!OPTIONS.quiet && (game + 1) % 25 === 0) {
    console.log(`partides: ${game + 1}/${OPTIONS.games}`);
  }
}
else if (OPTIONS.games > 0) {
  console.warn('[AB] WARNING: no hi ha cap obertura legal per a la variant; no s’han jugat partides.');
}

const pct = (count, total) => total ? count * 100 / total : 0;
const decisive = games.filter(game => game.result === '1-0' || game.result === '0-1').length;
const draws = games.filter(game => game.result === '1/2-1/2').length;
const mates = games.filter(game => game.endReason === 'mate').length;
const adjudicated = games.filter(game => game.endReason === 'adjudicated').length;
const searchCount = games.reduce((sum, game) => sum + game.searchCount, 0);
const depthSum = games.reduce((sum, game) => sum + game.depthSum, 0);
const depthShortfall = games.reduce((sum, game) => sum + game.depthShortfallCount, 0);
const timeSum = games.reduce((sum, game) => sum + game.timeSum, 0);
const maxSearchMs = games.reduce((max, game) => Math.max(max, game.timeMax), 0);
const evalDecisive = games.filter(game =>
  (game.endReason === 'adjudicated' || game.endReason === 'maxPlyReached') &&
  (game.result === '1-0' || game.result === '0-1')
).length;
const uniqueGameCount = new Set(games.map(game => game.moveHash)).size;
const uniqueOpeningCount = new Set(generatedOpenings.map(opening =>
  JSON.stringify(opening.moves.map(moveRecord))
)).size;
const openingLengths = generatedOpenings.map(opening => opening.plies);
const openingPlies = {
  min: openingLengths.length ? Math.min(...openingLengths) : 0,
  max: openingLengths.length ? Math.max(...openingLengths) : 0
};

const summary = {
  gamesPlayed: games.length,
  uniqueOpeningCount,
  uniqueGameCount,
  skippedIllegal,
  openingPlies,
  avgDepth: searchCount ? depthSum / searchCount : 0,
  depthShortfall,
  depthShortfallPct: pct(depthShortfall, searchCount),
  avgSearchMs: searchCount ? timeSum / searchCount : 0,
  maxSearchMs,
  avgPly: average(games.map(game => game.plyCount)),
  medianPly: median(games.map(game => game.plyCount)),
  pctDecisive: pct(decisive, games.length),
  pctDraw: pct(draws, games.length),
  pctMate: pct(mates, games.length),
  pctAdjudicated: pct(adjudicated, games.length),
  pctAdjudicatedByEval: pct(evalDecisive, games.length),
  avgFinalEvalAbs: average(games.map(game => game.finalEvalAbs)),
  avgUniquePositions: average(games.map(game => game.uniquePositions)),
  avgCaptures: average(games.map(game => game.captures)),
  avgPromotions: average(games.map(game => game.promotions)),
  avgChecks: average(games.map(game => game.checksGiven)),
  avgKingVertMoves: average(games.map(game => game.kingVertMoves)),
  totalKingVertCaptures: games.reduce((sum, game) => sum + game.kingVertCaptures, 0),
  avgKingCelEntries: average(games.map(game => game.kingCelEntries)),
  errors: errors.length
};
if (summary.depthShortfallPct > 50) {
  console.warn("[AB] WARNING: més de la meitat de les cerques no arriben a la fondària demanada; s'està mesurant joc més superficial. Considera apujar --ms o baixar --depth.");
}
if (uniqueGameCount < games.length * 0.5) {
  console.warn(`[AB] WARNING: només ${uniqueGameCount} línies úniques de ${games.length} partides; la mostra no és estadísticament informativa. Revisa la generació d'obertures.`);
}

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
    openings: OPTIONS.openings,
    openingMinPlies: OPTIONS.openingMinPlies,
    openingMaxPlies: OPTIONS.openingMaxPlies,
    openingMaxEval: OPTIONS.openingMaxEval,
    maxPlies: OPTIONS.maxPlies,
    adjudicate: OPTIONS.adjudicate,
    adjudicateBand: OPTIONS.adjudicateBand
  },
  summary,
  games,
  errors,
  openings: generatedOpenings.map(({ plies, moves }) => ({
    plies,
    moves
  }))
};
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');

console.log('== RESUM A/B REGLES DEL REI ==');
console.log(`variant: ${OPTIONS.variant || 'personalitzada'} · kingRules: vertCapture=${KING_RULES.vertCapture} · celVisitsLimit=${KING_RULES.celVisitsLimit}`);
for (const [key, value] of Object.entries(summary)) {
  console.log(`${key}: ${typeof value === 'number' ? value.toFixed(2) : JSON.stringify(value)}`);
}
if (!OPTIONS.quiet) console.log(`openings: ${JSON.stringify(output.openings)}`);
console.log(`JSON: ${outPath}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const metrics = ['avgDepth', 'depthShortfall', 'depthShortfallPct', 'avgSearchMs', 'maxSearchMs'];
  const lines = [
    `## Resolució de cerca — ${OPTIONS.variant || 'personalitzada'}`,
    '',
    '| Mètrica | Valor |',
    '| --- | ---: |',
    ...metrics.map(metric => `| ${metric} | ${summary[metric].toFixed(2)} |`),
    ''
  ];
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'));
}
