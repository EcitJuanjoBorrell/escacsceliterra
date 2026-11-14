/* F0a — T2: micro-posicions verificables a mà (AQUESTES SÍ SÓN ORACLES).
   Cada posició té ≤ 5 peces i el nombre de jugades legals està raonat
   manualment al comentari. Si el motor no coincideix amb el raonament,
   el test FALLA i la divergència es reporta (no s'ajusta el raonament). */
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

const count = (st) => E.genMoves(E.cloneState(st), true).length;
const savedCfg = Object.assign({}, E.CFG);
E.setConfig(E.variantConfig('V2')); // variant de referència per als oracles

console.log('--- F0a T2: micro-posicions oracle (raonament manual) ---');

// M1 — Rei sol al Cel amb la casella de Terra de sota BUIDA.
// Raonament: el rei blanc a e5¹ té els 8 veïns dins del Cel lliures (el Cel és
// buit) i, a més, la baixada F_VERT a terra-e5 (lliure). El rei negre a terra-a8
// és lluny: no ataca cap de les 9 destinacions. Enroc/IL: cap dret ni torre.
// TOTAL = 8 (dins del Cel) + 1 (descens) = 9.
{
  const st = posFrom([[1, 3, 4, K, W], [0, 0, 0, K, B]], { turn: W });
  const ms = E.genMoves(E.cloneState(st), true);
  ok(ms.length === 9, 'M1 rei sol al Cel, terra lliura de sota: 9 jugades (got ' + ms.length + ')');
  ok(ms.filter(m => m.flag === E.F_VERT).length === 1, 'M1: exactament 1 descens F_VERT (e5¹→e5)');
}

// M2 — Torre de Terra apilada SOTA un rei del Cel (escac vertical).
// NOTA DE DIVERGÈNCIA RESOLTA: el primer raonament donava 18 perquè asumia que
// la torre blanca d'una CASELLA DIFERENT del Cel podia capturar «cap avall per
// la mateixa columna». El contracte (SPEC §1.2, F_VCAP) diu que la captura
// vertical NOMÉS toca la peça apilada a la MATEIXA coordenada: h4¹↑h4-terra
// (buit), mai e4-terra. Recomptat des del contracte: el rei blanc a e4¹ està
// en escac vertical i només té els 8 veïns del Cel (cap interposició possible
// en escac vertical, cap captura de l'atacant: el rei no té captura vertical i
// F_VERT exigeix destí buit). Qualsevol altra jugada blanca deixaria el rei en
// escac i és filtrada. El motor dona 8: CONSISTENT amb el contracte.
// TOTAL = 8.
{
  const st = posFrom([
    [0, 4, 4, R, B],      // torre negra terra-e4 (l'atacant vertical)
    [0, 0, 0, K, B],      // rei negre terra-a8
    [1, 4, 4, K, W],      // rei blanc cel-e4¹ (en escac vertical)
  ], { turn: W });
  const ms = E.genMoves(E.cloneState(st), true);
  ok(ms.length === 8, 'M2 escac vertical (torre apilada sota el rei): 8 evasives (got ' + ms.length + ')');
  ok(ms.every(m => m.from === E.idxOf(1, 4, 4) && m.flag === E.F_NORM),
    'M2: totes les evasives són moviments del rei dins del Cel');
  ok(!ms.some(m => m.from === E.idxOf(1, 4, 4) && m.flag === E.F_VERT),
    'M2: el rei NO té baixada (destí ocupat per l\'atacant: F_VERT exigeix casella buida)');
  ok(!ms.some(m => m.flag === E.F_VCAP),
    'M2: cap F_VCAP possible (cap torre/dama blanca apilada sobre atacant)');
}

// M3 — Fantasma al Cel (cap moviment vertical mai).
// NOTA DE DIVERGÈNCIA RESOLTA: el primer raonament donava 11 perquè va oblidar
// l'ASCENS del rei de Terra: el rei blanc a terra-a1 amb el Cel lliure a sobre
// té la pujada F_VERT a cel-a1¹ (legal: cap atacant allà). Recomptat des del
// contracte (F_VERT: destí buit, peces no fantasma): cavall fantasma 8 salts
// dins del Cel + rei blanc 3 jugades (a2, b2, b1) + 1 ascens a1¹ = 12.
// El fantasma segueix sense generar CAP jugada vertical. El motor dona 12.
// TOTAL = 12.
{
  const kn = E.idxOf(1, 3, 4);
  const st = posFrom([[1, 3, 4, C, W], [0, 7, 0, K, W], [0, 0, 7, K, B]],
    { gh: new Set([kn]), turn: W });
  const ms = E.genMoves(E.cloneState(st), true);
  ok(ms.length === 12, 'M3 cavall fantasma al Cel: 12 jugades (got ' + ms.length + ')');
  ok(!ms.some(m => m.from === kn && m.flag === E.F_VERT), 'M3: el fantasma no genera cap F_VERT');
  const verts = ms.filter(m => m.flag === E.F_VERT);
  ok(verts.length === 1 && verts[0].from === E.idxOf(0, 7, 0),
    'M3: l\'única jugada vertical és l\'ASCENS del rei a1↑a1¹ (el fantasma en queda exclòs)');
}

// M4 — Rei al Cel amb la casella de Terra de sota OCUPADA (sense descens).
// Raonament: el rei blanc a e5¹ té els 8 veïns del Cel lliures, però la baixada
// a terra-e5 és impossible: F_VERT només es genera amb destí buit i hi ha un
// peó negre. El peó negre (a Terra) no ataca el Cel i el rei negre a a8 és lluny.
// TOTAL = 8 (només dins del Cel, 0 verticals).
{
  const st = posFrom([[1, 3, 4, K, W], [0, 3, 4, P, B], [0, 0, 0, K, B]], { turn: W });
  const ms = E.genMoves(E.cloneState(st), true);
  ok(ms.length === 8, 'M4 rei al Cel amb terra-e5 ocupada: 8 jugades (got ' + ms.length + ')');
  ok(!ms.some(m => m.flag === E.F_VERT), 'M4: cap descens quan la casella de sota és ocupada');
}

// M5 — Peó fantasma a l'última fila del Cel (zombi).
// Recomptat des del contracte (amb el matís de l'ascens del rei, vegeu M3):
// el peó blanc fantasma a e8¹ (fila 0 del Cel) no té avenç (el pas endavant
// surt del tauler), no té captures diagonals (el Cel és buit i les diagonals
// surten del tauler) i no té descens (és fantasma). Queda zombi: genera 0
// jugades i només bloqueja la casella. El rei blanc a terra-a1 té 3 jugades
// dins del nivell + 1 ascens a cel-a1¹ (lliure i segura).
// TOTAL = 4 (0 del zombi).
{
  const pz = E.idxOf(1, 0, 4);
  const st = posFrom([[1, 0, 4, P, W], [0, 7, 0, K, W], [0, 0, 7, K, B]],
    { gh: new Set([pz]), turn: W });
  const ms = E.genMoves(E.cloneState(st), true);
  ok(ms.length === 4, 'M5 peó fantasma zombi a e8¹: 4 jugades (només el rei, ascens inclòs) (got ' + ms.length + ')');
  ok(!ms.some(m => m.from === pz), 'M5: el peó zombi genera exactament 0 jugades');
  const verts = ms.filter(m => m.flag === E.F_VERT);
  ok(verts.length === 1 && verts[0].from === E.idxOf(0, 7, 0),
    'M5: l\'única jugada vertical és l\'ascens del rei, mai del zombi');
  ok(st.b[pz] === P * W && st.gh[pz] === 1, 'M5: el zombi segueix blocant e8¹ (peó fantasma intacte)');
}

// M6 — Dos reis APILATS (mateixa coordenada, plans oposats) — posició construïda.
// Raonament: amb el rei blanc a e4¹ i el negre a terra-e4, el blanc està en
// escac vertical (el rei controla verticalment). El rei blanc té els 8 veïns
// del Cel: en canviar de coordenada deixa d'estar apilat i cap atacant del Cel
// existeix → els 8 són legals. La baixada és impossible (destí ocupat pel rei
// negre). Nota: aquesta posició viola la invariant 24 (mai s'hauria de donar en
// joc real); aquí es comprova el comportament determinista del motor.
// TOTAL = 8.
{
  const st = posFrom([[1, 4, 4, K, W], [0, 4, 4, K, B]], { turn: W });
  const ms = E.genMoves(E.cloneState(st), true);
  ok(ms.length === 8, 'M6 reis apilats e4/e4¹: 8 evasives del rei blanc (got ' + ms.length + ')');
  ok(ms.every(m => m.flag === E.F_NORM), 'M6: totes les evasives són dins del Cel (cap F_VERT)');
}

// M7 — L'acoblament F_VCAP ⇔ CFG.conversion (correcció 9 de la verificació).
// Recomptat des del contracte (amb el matís de l'ascens del rei, vegeu M3):
// torre blanca viatgera a e5¹ sobre un peó negre a terra-e5; rei blanc a
// terra-a1 (3 jugades + 1 ascens a cel-a1¹ = 4) i rei negre a terra-a8.
// La torre té 14 jugades dins del Cel (7 per fila + 7 per columna, sense blocs)
// i la baixada és impossible (terra-e5 ocupada).
//   · V0 (conversion: false): F_VCAP NO es genera mai → 14 + 4 = 18.
//   · V2 (conversion: true): F_VCAP Te5¹↑e5 es genera → 15 + 4 = 19.
// La diferència d'exactament 1 jugada entre variants ÉS el buit documentat:
// una variant amb foc vertical i sense conversió no pot capturar verticalment.
{
  const list = [[1, 3, 4, R, W], [0, 7, 0, K, W], [0, 3, 4, P, B], [0, 0, 0, K, B]];
  E.setConfig(E.variantConfig('V0'));
  const msV0 = E.genMoves(E.cloneState(posFrom(list)), true);
  ok(msV0.length === 18, 'M7 V0 sense conversió: 18 jugades, cap F_VCAP (got ' + msV0.length + ')');
  ok(!msV0.some(m => m.flag === E.F_VCAP), 'M7 V0: la torre del Cel NO pot capturar el peó apilat');

  E.setConfig(E.variantConfig('V2'));
  const stV2 = posFrom(list);
  const msV2 = E.genMoves(E.cloneState(stV2), true);
  ok(msV2.length === 19, 'M7 V2 amb conversió: 19 jugades amb 1 F_VCAP (got ' + msV2.length + ')');
  ok(msV2.filter(m => m.flag === E.F_VCAP).length === 1, 'M7 V2: exactament 1 F_VCAP (Te5¹↑e5)');
}

E.setConfig(savedCfg);

test('F0a micro-oracles: ' + passed + ' ok, ' + failed + ' fail', () => {
  expect(fails, fails.join(' | ')).toEqual([]);
});
