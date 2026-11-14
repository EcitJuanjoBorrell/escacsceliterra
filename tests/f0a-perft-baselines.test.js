/* F0a — T1: baselines de perft per a V0–V5 (XARXA DE SEGURETAT DE REGRESSIÓ).
   Aquests números surten del motor actual (escacsceliterra-main 13-11-26.zip,
   rules.js SENSE modificar). CONGELEN comportament; NO demostren correcció.
   Són "baseline de regressió", NO "oracle verificat": si el motor canvia
   voluntàriament, aquest test ha d'actualitzar-se amb revisió humana de les
   diferències (docs/perft-baselines.md documenta cada posició completa). */
'use strict';
import { expect, test } from 'vitest';
import { Engine as E } from '../src/engine/engine.js';

let passed = 0, failed = 0;
const fails = [];
function ok(cond, name) {
  if (cond) { passed++; console.log('  ok  - ' + name); }
  else { failed++; fails.push(name); console.log('  FAIL- ' + name); }
}

const K = E.KING, Q = E.QUEEN, R = E.ROOK, C = E.KNIGHT, P = E.PAWN;
const W = E.WHITE, B = E.BLACK;
const GID_WQ = 1, GID_WK = 2;

function posFrom(list, opts = {}) {
  const st = E.initialState();
  st.b.fill(0); st.gh.fill(0); st.gid.fill(0);
  st.castling = { wk: false, wq: false, bk: false, bq: false, ilw_h: false, ilw_q: false, ilb_h: false, ilb_q: false };
  for (const [lvl, r, c, t, s] of list) {
    const sq = E.idxOf(lvl, r, c);
    st.b[sq] = t * s;
    if (opts.gh && opts.gh.has(sq)) st.gh[sq] = 1;
    if (opts.gid && opts.gid.has(sq)) st.gid[sq] = opts.gid.get(sq);
    if (t === K) st.k[s] = sq;
  }
  st.turn = opts.turn ?? W;
  if (opts.castling) Object.assign(st.castling, opts.castling);
  st.hist = [];
  return st;
}

// ---- Les mateixes 4 posicions que documenta docs/perft-baselines.md ----
function buildPosition(name) {
  if (name === 'P0-inicial') return E.initialState();

  if (name === 'P1-migjoc-fantasmes') {
    const list = [
      [0, 7, 4, K, W], [0, 7, 0, R, W], [0, 7, 7, R, W], [0, 6, 5, P, W], [0, 6, 6, P, W],
      [0, 0, 4, K, B], [0, 1, 0, P, B], [0, 1, 1, P, B],
      [1, 4, 3, Q, W], [1, 3, 5, C, W],
      [1, 4, 4, R, B], [1, 2, 2, C, B],
    ];
    return posFrom(list, {
      gh: new Set([E.idxOf(1, 4, 4), E.idxOf(1, 2, 2)]),
      gid: new Map([[E.idxOf(0, 7, 0), GID_WQ], [E.idxOf(0, 7, 7), GID_WK]]),
      castling: { wk: true, wq: true, ilw_h: true, ilw_q: true },
      turn: W,
    });
  }

  if (name === 'P2-final-reis-plans-diferents') {
    const list = [
      [1, 3, 4, K, W], [0, 7, 7, R, W], [0, 6, 5, P, W],
      [0, 4, 3, K, B], [0, 3, 0, P, B],
    ];
    return posFrom(list, {
      gid: new Map([[E.idxOf(0, 7, 7), GID_WK]]),
      turn: W,
    });
  }

  if (name === 'P3-enroc-internivell') {
    const list = [
      [0, 7, 4, K, W], [0, 7, 0, R, W], [1, 7, 4, R, W],
      [0, 0, 7, K, B], [0, 3, 0, R, B],
    ];
    return posFrom(list, {
      gid: new Map([[E.idxOf(0, 7, 0), GID_WQ], [E.idxOf(1, 7, 4), GID_WK]]),
      castling: { wk: true, wq: true, ilw_h: true, ilw_q: false },
      turn: W,
    });
  }
  throw new Error('posició desconeguda: ' + name);
}

// ---- Baseline congelada (generada amb scripts/f0a_perft_probe.mjs sobre el
//      ZIP 13-11-26, rules.js intacte) ----
const BASELINE = {
  'V0': { 'P0-inicial': [36, 1296, 52294], 'P1-migjoc-fantasmes': [65, 2013, 127644], 'P2-final-reis-plans-diferents': [25, 196, 4961], 'P3-enroc-internivell': [28, 509, 14515] },
  'V1': { 'P0-inicial': [36, 1296, 52294], 'P1-migjoc-fantasmes': [65, 2013, 127567], 'P2-final-reis-plans-diferents': [25, 196, 4961], 'P3-enroc-internivell': [29, 527, 15169] },
  'V2': { 'P0-inicial': [36, 1296, 52294], 'P1-migjoc-fantasmes': [65, 2013, 127567], 'P2-final-reis-plans-diferents': [25, 196, 4961], 'P3-enroc-internivell': [29, 527, 15169] },
  'V3': { 'P0-inicial': [36, 1296, 52294], 'P1-migjoc-fantasmes': [65, 2013, 127656], 'P2-final-reis-plans-diferents': [25, 196, 4961], 'P3-enroc-internivell': [29, 528, 15174] },
  'V4': { 'P0-inicial': [36, 1296, 52294], 'P1-migjoc-fantasmes': [65, 2013, 127713], 'P2-final-reis-plans-diferents': [25, 196, 4961], 'P3-enroc-internivell': [29, 527, 15169] },
  'V5': { 'P0-inicial': [36, 1296, 52294], 'P1-migjoc-fantasmes': [65, 2013, 127567], 'P2-final-reis-plans-diferents': [25, 196, 4961], 'P3-enroc-internivell': [28, 508, 14554] },
};

const POSITIONS = ['P0-inicial', 'P1-migjoc-fantasmes', 'P2-final-reis-plans-diferents', 'P3-enroc-internivell'];
const VARIANTS = ['V0', 'V1', 'V2', 'V3', 'V4', 'V5'];

console.log('--- F0a T1: baselines de regressió perft V0-V5 (NO oracle) ---');
const savedCfg = Object.assign({}, E.CFG);
for (const v of VARIANTS) {
  E.setConfig(E.variantConfig(v));
  for (const p of POSITIONS) {
    const st = buildPosition(p);
    for (let d = 1; d <= 3; d++) {
      const got = E.perft(E.cloneState(st), d);
      const exp = BASELINE[v][p][d - 1];
      ok(got === exp, `perft(${d}) ${v} ${p} = ${got} (baseline ${exp})`);
    }
  }
}
E.setConfig(savedCfg);

// Assercions estructurals que expliquen per què les baselines tenen sentit:
E.setConfig(E.variantConfig('V2'));
{
  // P3: l'enroc internivell és l'única diferència estructural entre V2 (29) i V0/V5 (28)
  const il = buildPosition('P3-enroc-internivell');
  const ms = E.genMoves(E.cloneState(il), true);
  ok(ms.filter(m => m.flag === E.F_IL).length === 1, 'P3 V2: exactament 1 jugada d\'enroc internivell (Re1↔Te1¹)');
  ok(ms.filter(m => m.flag === E.F_CQ).length === 1, 'P3 V2: O-O-O ordinari també disponible');
  E.setConfig(E.variantConfig('V0'));
  const il0 = buildPosition('P3-enroc-internivell');
  ok(E.genMoves(E.cloneState(il0), true).length === 28, 'P3 V0: 28 jugades (sense IL: perft(1) baseline)');
  E.setConfig(E.variantConfig('V5'));
  const il5 = buildPosition('P3-enroc-internivell');
  ok(E.genMoves(E.cloneState(il5), true).length === 28, 'P3 V5: 28 jugades (V5 tampoc té ilCastling)');

  // P1: amb V2 l'arrel té captures in-level contra fantasmes i el rei té O-O/O-O-O
  E.setConfig(E.variantConfig('V2'));
  const p1 = buildPosition('P1-migjoc-fantasmes');
  const ms1 = E.genMoves(E.cloneState(p1), true);
  ok(ms1.length === 65, 'P1 V2: 65 jugades legals a l\'arrel (baseline perft(1))');
  ok(ms1.some(m => m.to === E.idxOf(1, 4, 4)), 'P1 V2: la dama blanca pot capturar el fantasma Te4¹ in-level');
  // P0: 20 jugades clàssiques + 16 verticals (tot el Cel és buit) = 36
  const p0 = buildPosition('P0-inicial');
  const ms0 = E.genMoves(E.cloneState(p0), true);
  ok(ms0.length === 36, 'P0 V2: 36 = 20 clàssiques + 16 ascensions verticals');
  ok(ms0.filter(m => m.flag === E.F_VERT).length === 16, 'P0 V2: 16 jugades F_VERT a l\'arrel');
}
E.setConfig(savedCfg);

test('F0a perft baselines (regressió): ' + passed + ' ok, ' + failed + ' fail', () => {
  expect(fails, fails.join(' | ')).toEqual([]);
});
