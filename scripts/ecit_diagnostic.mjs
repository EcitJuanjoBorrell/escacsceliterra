'use strict';
/* Diagnòstic del corpus d'autopartides ECIT (fitxer txt amb capçaleres # result/source/label).
   Reprodueix cada partida amb el motor REAL (rules.js del repo) i calcula:
   - resultats × estat real de final (mate/ofegat/50mov/material/sense acabar)
   - censura de llargada (partides que toquen el màxim de plies)
   - repetició de posicions (via getKey de F1b: tauler+gh+gid+torn+drets+ep)
   - cobertura per ply i observacions per (posició,jugada) amb llindars n≥3/5/10/20
   - solidesa amb la fórmula PROPIA de experience.js (wilson+minObservations) vs alternativa
   - prova d'adjudicació per material (quantes "taules" es convertirien en decisives)
   - comptabilitat de bytes: format actual (trail+snapshot) vs txt compacte
   Ús: node ecit_diagnostic.mjs <fitxer.txt> <arrel repo>
*/
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [txtPath, repoRoot] = process.argv.slice(2);
if (!txtPath || !repoRoot) { console.error('Ús: node ecit_diagnostic.mjs <txt> <repoRoot>'); process.exit(1); }

const rulesMod = await import(pathToFileURL(path.join(repoRoot, 'src', 'core', 'rules.js')).href);
const E = rulesMod.Engine2 ?? rulesMod.Engine;

const PROMO_CODE = { n: 2, b: 3, r: 4, q: 5 };
const TOKEN_RE = /^([01])?([a-h])([1-8])\s*(<>|>)\s*([01])?([a-h])([1-8])(?:=([nbrq]))?$/;

function parseToken(tok) {
  const m = TOKEN_RE.exec(tok.trim());
  if (!m) return null;
  const fromL = m[1] === undefined ? 0 : Number(m[1]);
  const toL = m[5] === undefined ? fromL : Number(m[5]);
  return {
    tok,
    from: E.idxOf(fromL, 8 - Number(m[3]), m[2].charCodeAt(0) - 97),
    to: E.idxOf(toL, 8 - Number(m[7]), m[6].charCodeAt(0) - 97),
    swap: m[4] === '<>',
    promo: m[8] ? PROMO_CODE[m[8]] : null
  };
}

function sqName(i) { // per a diagnòstic d'errors
  const lvl = Math.floor(i / 128), row = Math.floor((i % 128) / 16), col = i % 16;
  return lvl + 'abcdefgh'[col] + (8 - row);
}

// ---- llegir i partir el txt ----
const raw = fs.readFileSync(txtPath, 'utf8');
const blocks = raw.replace(/^\uFEFF/, '').trim().split(/\n\s*\n/);
const games = [];
for (const block of blocks) {
  const lines = block.split('\n').filter(l => l.trim());
  let result = null, source = '', label = '';
  const moveLines = [];
  for (const l of lines) {
    const meta = /^#\s*(result|source|label)\s*:\s*(.+)$/i.exec(l);
    if (meta) {
      const k = meta[1].toLowerCase(), v = meta[2].trim();
      if (k === 'result') result = v === '1-0' ? 'w' : v === '0-1' ? 'b' : 'd';
      else if (k === 'source') source = v;
      else label = v;
    } else if (!l.startsWith('#')) moveLines.push(l);
  }
  const tokens = moveLines.join(' ').split(/[\s]+/).filter(Boolean);
  if (tokens.length) games.push({ result, source, label, tokens });
}

// ---- reproduir amb el motor real ----
const stats = {
  games: games.length, results: { w: 0, b: 0, d: 0 },
  illegal: [], swapTokens: 0,
  endStatus: { mate: 0, ofegat: 0, '50mov': 0, material: 0, senseacabar: 0 },
  hitMax: 0, pliesList: [],
  perPly: [],                      // ply -> {obs, keys:Set, om:Map omKey->[w,d,l]}
  gamesShuffle: [],                // per partida: revisites
  decisivePlies: [],
  materialEnd: [],
  policyLabels: new Map(),
  first4: new Map()
};
const MAXPLY_WINDOW = [[1, 2], [3, 4], [5, 8], [9, 12], [13, 16], [17, 24], [25, 999]];
const PV = { 1: 100, 2: 300, 3: 310, 4: 500, 5: 900, 6: 0 };

for (const g of games) {
  stats.results[g.result === 'w' ? 'w' : g.result === 'b' ? 'b' : 'd']++;
  const pol = (g.label.split('·')[1] || '?').trim();
  stats.policyLabels.set(pol, (stats.policyLabels.get(pol) || 0) + 1);
  const f4 = g.tokens.slice(0, 4).join(' ');
  stats.first4.set(f4, (stats.first4.get(f4) || 0) + 1);

  let st = E.initialState();
  const visits = new Map(); // key -> n (posicions dins la partida)
  let replOk = true;
  for (let i = 0; i < g.tokens.length; i++) {
    const p = parseToken(g.tokens[i]);
    if (!p) { stats.illegal.push({ label: g.label, ply: i + 1, tok: g.tokens[i], why: 'token illegible' }); replOk = false; break; }
    if (p.swap) stats.swapTokens++;
    const ms = E.genMoves(st, true);
    const hit = ms.find(m => m.from === p.from && m.to === p.to
      && (p.swap ? m.flag === E.F_IL : m.flag !== E.F_IL)
      && (p.promo ? m.promo === p.promo : !m.promo));
    if (!hit) {
      stats.illegal.push({ label: g.label, ply: i + 1, tok: p.tok, why: 'cap jugada legal coincideix (from=' + sqName(p.from) + ' to=' + sqName(p.to) + ')' });
      replOk = false; break;
    }
    const ply = i + 1;
    while (stats.perPly.length < ply) stats.perPly.push({ obs: 0, keys: new Set(), om: new Map() });
    const PP = stats.perPly[ply - 1];
    const keyBefore = E.getKey(st).toString();
    PP.obs++;
    PP.keys.add(keyBefore);
    const omKey = keyBefore + '|' + p.tok;
    let rec = PP.om.get(omKey);
    if (!rec) { rec = [0, 0, 0]; PP.om.set(omKey, rec); }
    if (g.result === 'd') rec[1]++; else if (g.result === (ply % 2 === 1 ? 'w' : 'b')) rec[0]++; else rec[2]++;
    visits.set(keyBefore, (visits.get(keyBefore) || 0) + 1);
    E.make(st, hit);
  }
  if (!replOk) continue;

  const plies = g.tokens.length;
  stats.pliesList.push(plies);
  if (plies >= 120) stats.hitMax++;
  const end = E.gameStatus(st);
  const status = end.over ? end.result : 'senseacabar';
  stats.endStatus[status] = (stats.endStatus[status] || 0) + 1;
  // material final (des del tauler real)
  let mb = 0;
  for (let i = 0; i < 256; i++) { const pc = st.b[i]; if (pc) mb += Math.sign(pc) * (PV[Math.abs(pc)] || 0); }
  stats.materialEnd.push({ label: g.label, result: g.result, plies, status, mb });
  // repetició
  let revisits = 0, maxVis = 0, firstRepPly = null;
  {
    const seenAt = new Map();
    // tornem a passar per les claus: les tenim a visits (sense ply). Recalculem amb ply:
  }
  // recompte amb ply de primera repetició: refem el recorregt (barat)
  if (true) {
    let s2 = E.initialState();
    const seen = new Map();
    for (let i = 0; i < g.tokens.length; i++) {
      const p = parseToken(g.tokens[i]);
      const k = E.getKey(s2).toString();
      if (seen.has(k) && firstRepPly === null) firstRepPly = i + 1;
      if (seen.has(k)) revisits++;
      seen.set(k, (seen.get(k) || 0) + 1);
      maxVis = Math.max(maxVis, seen.get(k) + 0);
      const ms = E.genMoves(s2, true);
      const hit = ms.find(m => m.from === p.from && m.to === p.to
        && (p.swap ? m.flag === E.F_IL : m.flag !== E.F_IL)
        && (p.promo ? m.promo === p.promo : !m.promo));
      if (!hit) break;
      E.make(s2, hit);
    }
    maxVis = 0; for (const v of seen.values()) maxVis = Math.max(maxVis, v);
  }
  if (revisits > 0) stats.gamesShuffle.push({ label: g.label, plies, revisits, maxVis, firstRepPly });
  if (g.result !== 'd') stats.decisivePlies.push({ label: g.label, result: g.result, plies, status });
}

// ---- aggregates ----
const out = { stats, windows: [], thresholds: {}, solidity: {} };

for (const [a, b] of MAXPLY_WINDOW) {
  let obs = 0, uniqK = 0, uniqOM = 0;
  const omCounts = [];
  for (let p = a; p <= b && p <= stats.perPly.length; p++) {
    const PP = stats.perPly[p - 1];
    if (!PP) continue;
    obs += PP.obs; uniqK += PP.keys.size; uniqOM += PP.om.size;
    for (const rec of PP.om.values()) omCounts.push(rec[0] + rec[1] + rec[2]);
  }
  const pass = t => omCounts.filter(c => c >= t).length;
  out.windows.push({ window: a + '-' + (b === 999 ? '120' : b), obs, uniqK, uniqOM, n3: pass(3), n5: pass(5), n10: pass(10), n20: pass(20) });
}

// solidesa: fórmula PROPIA (experience.js) sobre tot el corpus
function wilsonX(w, d, n, z = 1.96) {
  if (!n) return 0;
  const p = (w + d * 0.5) / n;
  const dd = 1 + z * z / n;
  const centre = p + z * z / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p) + d * 0.25 / n) / n);
  return Math.max(0, (centre - spread) / dd);
}
let ownTotal = 0, ownPass = 0, altTotal = 0, altPass = 0, omAll = [];
for (const PP of stats.perPly) {
  for (const rec of PP.om.values()) {
    const n = rec[0] + rec[1] + rec[2];
    omAll.push({ w: rec[0], d: rec[1], l: rec[2], n });
    ownTotal++;
    if (n >= 3 && wilsonX(rec[0], rec[1], n) >= 0.35) ownPass++;
    // alternativa: seguretat per taxa de derrotes (regla dels tres + Wilson UB)
    const ub = n === 0 ? 1 : (rec[2] + (n * 0 + 3 * (rec[2] === 0 ? 1 : 0)) / n);
    const ubWilson = (() => { // Wilson UB per a p=derrotes
      const pLoss = rec[2] / n, z = 1.96, dd = 1 + z * z / n;
      const c = pLoss + z * z / (2 * n), s = z * Math.sqrt((pLoss * (1 - pLoss)) / n);
      return Math.min(1, (c + s) / dd);
    })();
    altTotal++;
    if (n >= 10 && (rec[2] === 0 ? 3 / n : ubWilson) < 0.15) altPass++;
  }
}
out.solidity = { ownTotal, ownPass, altTotal, altPass };

// taules → adjudicació per material
const draws = stats.materialEnd.filter(x => x.result === 'd');
out.adjudication = {
  draws: draws.length,
  d_1pawn: draws.filter(x => Math.abs(x.mb) >= 100).length,
  d_25pawn: draws.filter(x => Math.abs(x.mb) >= 250).length,
  d_5pawn: draws.filter(x => Math.abs(x.mb) >= 500).length,
  censored: draws.filter(x => x.status === 'senseacabar').length,
  censored_25: draws.filter(x => x.status === 'senseacabar' && Math.abs(x.mb) >= 250).length
};

// bytes
const avgKeyLen = (() => { // mida de clau tipus positionKey (aprox amb el format real de experience.js)
  let s = E.initialState(); E.make(s, E.genMoves(s, true)[0]);
  return null;
})();
const txtBytes = Buffer.byteLength(raw);
out.bytes = {
  txtBytes, games: games.length,
  perGameTxt: Math.round(txtBytes / games.length),
  headersPerGame: 70, // ~3 capçaleres
  note: 'format llibre actual ve del report'
};

fs.writeFileSync(path.join(repoRoot, 'scripts', 'ecit_diag_out.json'), JSON.stringify(out, null, 1));

// ---- print ----
console.log('== CORPUS ==');
console.log('partides:', stats.games, '| resultats:', JSON.stringify(stats.results), '| polítiques:', JSON.stringify([...stats.policyLabels]));
console.log('obertures úniques (primeres 4 jugades):', stats.first4.size, '| top3:', [...stats.first4.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[1] + '× «' + x[0] + '»'));
console.log('tokens enroc internivell:', stats.swapTokens, '| partides amb error de reproducció:', stats.illegal.length, stats.illegal.slice(0, 3));
console.log('== LLARGADES ==');
const sorted = [...stats.pliesList].sort((a, b) => a - b);
const q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
console.log('plies min/p50/p90/max:', sorted[0], q(0.5), q(0.9), sorted[sorted.length - 1], '| toquen el màxim (≥120):', stats.hitMax);
console.log('== FINALS (motor real) ==', JSON.stringify(stats.endStatus));
console.log('== REPETICIÓ ==');
console.log('partides amb ≥1 posició repetida:', stats.gamesShuffle.length, '/', stats.games);
const totRev = stats.gamesShuffle.reduce((a, x) => a + x.revisits, 0);
const totPlies = stats.pliesList.reduce((a, b) => a + b, 0);
console.log('plies que revisiten una posició ja vista:', totRev, '/', totPlies, '(' + (100 * totRev / totPlies).toFixed(1) + '%)');
console.log('max visites d\u2019una mateixa posició (pitjor partida):', Math.max(0, ...stats.gamesShuffle.map(x => x.maxVis)));
console.log('== COBERTURA per finestra de ply ==');
console.log('finestra | obs | posicions úniques | (pos,jugada) úniques | n≥3 | n≥5 | n≥10 | n≥20');
for (const w of out.windows) console.log(`${w.window.padEnd(8)} | ${String(w.obs).padEnd(6)} | ${String(w.uniqK).padEnd(18)} | ${String(w.uniqOM).padEnd(20)} | ${w.n3} | ${w.n5} | ${w.n10} | ${w.n20}`);
console.log('== SÒLIDESES (entrades (pos,move) totals:', ownTotal, ') ==');
console.log('criteri PROPI (n≥3 i wilson≥0.35):', ownPass, '(' + (100 * ownPass / ownTotal).toFixed(1) + '%)');
console.log('criteri alternativa (n≥10 i taxa de derrotes<15%):', altPass, '(' + (100 * altPass / altTotal).toFixed(1) + '%)');
console.log('== ADJUDICACIÓ (les', draws.length, 'taules) ==');
console.log('|mat| ≥1 peó:', out.adjudication.d_1pawn, '| ≥2,5 peons:', out.adjudication.d_25pawn, '| ≥5 peons:', out.adjudication.d_5pawn, '| censurades (sense acabar):', out.adjudication.censored, '| censurades amb |mat|≥2,5:', out.adjudication.censored_25);
console.log('== FINALS PER ESTAT (mida mb de les taules) ==');
console.log(decisiveStats());
function decisiveStats() {
  const d = stats.materialEnd.filter(x => x.result === 'd');
  const by = s => d.filter(x => x.status === s).length;
  return 'ofegat:' + by('ofegat') + ' 50mov:' + by('50mov') + ' material:' + by('material') + ' senseacabar:' + by('senseacabar') + ' (mate no pot ser taula)';
}
console.log('== PARTIDES DECISIVES ==', JSON.stringify(stats.decisivePlies));
console.log('== BYTES ==');
console.log('txt cru:', txtBytes, 'B |', Math.round(txtBytes / games.length), 'B/partida (capçaleres ~70 B)');
