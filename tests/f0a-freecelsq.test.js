/* F0a — T3: TEST PENDENT de l'SPEC v2 — freeCelSq amb víctima JA al Cel (V4).
   Les dues afirmacions de l'SPEC podrien xocar:
     · §1.1: amb capBlock 'block', si la casella del Cel damunt de la víctima
       està ocupada, la víctima es perd (-1).
     · §1.1 (comentari de codi, rules.js:198-202): una víctima capturada JA al
       Cel (heavenDeath 'convert', V4) no té «casella exacta» lliure — hi acaba
       d'arribar el captor —, així que SEMPRE es busca la casella lliure més
       propera.
   Aquest test determina què passa REALMENT en V4 (conversion: true,
   capBlock: 'block', heavenDeath: 'convert') amb una captura F_NORM dins del
   Cel, sense modificar el motor. Reporta el resultat tal qual. */
'use strict';
import { expect, test } from 'vitest';
import { Engine as E } from '../src/engine/engine.js';

let passed = 0, failed = 0;
const fails = [];
function ok(cond, name) {
  if (cond) { passed++; console.log('  ok  - ' + name); }
  else { failed++; fails.push(name); console.log('  FAIL- ' + name); }
}

const K = E.KING, R = E.ROOK, C = E.KNIGHT, P = E.PAWN;
const W = E.WHITE, B = E.BLACK;

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

const savedCfg = Object.assign({}, E.CFG);
E.setConfig(E.variantConfig('V4'));

console.log('--- F0a T3: freeCelSq amb víctima ja al Cel (V4, capBlock \'block\') ---');

// S1 — Anell 1 + c8¹ + c7¹ + a6¹ ocupats: la primera casella lliure (anells
// Chebyshev creixents al voltant d'a8¹) és b6¹, exactament l'ORIGEN del captor.
// Esperat: la víctima es RECONVÉRTIEX a b6¹ com a peó blanc fantasma (gh=1);
// això CONFIRMA el comentari de rules.js:198-202 i refuta la lectura ingènua
// de «amb 'block' la víctima es perd» per a víctimes del Cel.
{
  const kn = E.idxOf(1, 2, 1);   // cavall blanc cel-b6¹ (captor)
  const vict = E.idxOf(1, 0, 0); // peó negre cel-a8¹ (víctima)
  const blockers = [
    [1, 1, 0, P, B], // a7¹ (anell 1)
    [1, 0, 1, P, B], // b8¹ (anell 1)
    [1, 1, 1, P, B], // b7¹ (anell 1)
    [1, 0, 2, P, B], // c8¹ (anell 2, primer candidat)
    [1, 1, 2, P, B], // c7¹ (anell 2)
    [1, 2, 0, P, B], // a6¹ (anell 2)
  ];
  const st = posFrom([
    ...blockers,
    [1, 2, 1, C, W], [1, 0, 0, P, B],
    [0, 7, 6, K, W], [0, 0, 6, K, B],   // reis a terra g1/g8, lluny
  ], { turn: W });
  const before = E.cloneState(st);
  const mv = E.genMoves(E.cloneState(st), true)
    .find(m => m.from === kn && m.to === vict && m.flag === E.F_NORM);
  ok(!!mv, 'S1: la captura Cb6¹xa8¹ existeix i és legal en V4');
  if (mv) {
    E.make(st, mv);
    const u = st.hist[st.hist.length - 1];
    ok(st.b[vict] === C * W, 'S1: el cavall blanc queda a a8¹ (casella de la víctima)');
    ok(st.b[kn] === P * W && st.gh[kn] === 1,
      'S1: la víctima es RECONVÉRTIEX a b6¹ (l\'origen del captor) com a peó blanc FANTASMA (gh=1)');
    ok(u.conv === kn, 'S1: l\'Undo registra la reconversió (u.conv = b6¹)');
    E.unmake(st);
    ok(E.stateEqual(before, st), 'S1: unmake restaura exactament la posició anterior');
  }
}

// S2 — Només l'anell 1 ocupat: el primer candidat lliure de l'anell 2 és c8¹
// (ordre de recorregut de freeCelSq: dr=0, dc=+2 abans de les files inferiors).
{
  const kn = E.idxOf(1, 2, 1), vict = E.idxOf(1, 0, 0);
  const st = posFrom([
    [1, 1, 0, P, B], [1, 0, 1, P, B], [1, 1, 1, P, B],  // anell 1 ocupat
    [1, 2, 1, C, W], [1, 0, 0, P, B],
    [0, 7, 6, K, W], [0, 0, 6, K, B],
  ], { turn: W });
  const mv = E.genMoves(E.cloneState(st), true)
    .find(m => m.from === kn && m.to === vict);
  ok(!!mv, 'S2: la captura Cb6¹xa8¹ existeix');
  if (mv) {
    E.make(st, mv);
    const u = st.hist[st.hist.length - 1];
    ok(u.conv === E.idxOf(1, 0, 2) && st.b[E.idxOf(1, 0, 2)] === P * W && st.gh[E.idxOf(1, 0, 2)] === 1,
      'S2: reconversió a c8¹ (la lliure més propera per ordre d\'anells), gh=1');
    E.unmake(st);
  }
}

// S3 — TROBALLA REAL (el disseny inicial d'aquest cas era impossible): el test
// va intentar omplir el Cel sencer per forçar freeCelSq → -1, però la captura
// in-level ALLIBERA sempre l'origen del captor (b[m.from] = 0 ABANS de
// placeConverted), i l'origen és sempre a distància Chebyshev ≤ 7 de la víctima
// (és un moviment dins del mateix nivell), dins de l'àmbit de la recerca
// d'anells (d = 1..7). Conseqüència: per a una captura F_NORM dins del Cel en
// V4, la reconversió MAI pot fallar — el pitjor cas és caure a l'origen del
// captor alliberat. freeCelSq → -1 és inassolible per a víctimes del Cel via
// F_NORM (amb F_VCAP cap al Cel no hi ha reconversió directa, SPEC inv. 9).
{
  const kn = E.idxOf(1, 2, 1), vict = E.idxOf(1, 0, 0);
  const list = [
    [1, 2, 1, C, W], [1, 0, 0, P, B],
    [0, 7, 6, K, W], [0, 0, 6, K, B],
  ];
  const st = posFrom(list, { turn: W });
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = E.idxOf(1, r, c);
      if (sq === kn || sq === vict) continue;
      st.b[sq] = P * B; // omplim el Cel amb peons negres (cap rei)
    }
  }
  const before = E.cloneState(st);
  const mv = E.genMoves(E.cloneState(st), true).find(m => m.from === kn && m.to === vict);
  ok(!!mv, 'S3: la captura existeix encara amb el Cel ple');
  if (mv) {
    E.make(st, mv);
    const u = st.hist[st.hist.length - 1];
    ok(u.conv === kn && st.b[kn] === P * W && st.gh[kn] === 1,
      'S3: amb el Cel ple, la reconversió cau a l\'ORIGEN del captor (b6¹), peó blanc fantasma');
    ok(st.b[vict] === C * W, 'S3: el cavall queda a a8¹ — la víctima NO es perd');
    E.unmake(st);
    ok(E.stateEqual(before, st), 'S3: unmake restaura la posició plena');
  }
}

// S0 (contrast) — Víctima a TERRA amb la casella del Cel de sota ocupada i
// capBlock 'block': la captura NO es genera. Així queda clar que l'afirmació
// «amb 'block' la víctima es perd» és de les víctimes de TERRA, i el cas del
// Cel (S1/S2) no hi xoca: són regles diferents per a víctimes de plans diferents.
{
  const st = posFrom([
    [0, 7, 4, R, W],      // torre blanca terra-e1
    [0, 4, 4, P, B],      // peó negre terra-e4 (víctima de Terra)
    [1, 4, 4, C, B],      // cavall negre cel-e4¹ (la casella de sota OCUPADA)
    [0, 7, 7, K, W],      // rei blanc terra-h1
    [0, 0, 0, K, B],      // rei negre terra-a8
  ], { turn: W });
  const ms = E.genMoves(E.cloneState(st), true);
  ok(!ms.some(m => m.from === E.idxOf(0, 7, 4) && m.to === E.idxOf(0, 4, 4)),
    'S0 (contrast): amb capBlock \'block\' i e4¹ ocupada, Te1xe4 NO es genera (víctima de Terra)');
  // NOTA: el filtre de blocatge viu DINS de genPseudo (rules.js:404-416), no a
  // genMoves: ni tan sols la pseudo-legal la conté.
  const msPseudo = E.genPseudo(E.cloneState(st), false).filter(m => m.from === E.idxOf(0, 7, 4) && m.to === E.idxOf(0, 4, 4));
  ok(msPseudo.length === 0, 'S0 (contrast): la captura tampoc és pseudo-legal — el filtre de blocatge és a genPseudo');
}

E.setConfig(savedCfg);

test('F0a freeCelSq amb víctima ja al Cel (V4): ' + passed + ' ok, ' + failed + ' fail', () => {
  expect(fails, fails.join(' | ')).toEqual([]);
});
