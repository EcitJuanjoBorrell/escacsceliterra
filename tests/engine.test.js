/* Tests del motor 2 (Escac Cel i Terra — regles noves) */
'use strict';
import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
import { Engine as E } from '../src/engine/engine.js';
const require = createRequire(import.meta.url);
const Base = require('../src/engine/engine-v0.cjs');

let passed = 0, failed = 0;
const fails = [];
function ok(cond, name) {
  if (cond) { passed++; console.log('  ok  - ' + name); }
  else { failed++; fails.push(name); console.log('  FAIL- ' + name); }
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// posició artificial: llista de [nivell, fila, col, tipus, color]
function posFrom(list, opts) {
  opts = opts || {};
  const st = E.initialState();
  st.b.fill(0); st.gh.fill(0); st.gid.fill(0);
  st.castling = { wk: false, wq: false, bk: false, bq: false, ilw_h: false, ilw_q: false, ilb_h: false, ilb_q: false };
  for (const [lvl, r, c, t, s] of list) {
    const sq = E.idxOf(lvl, r, c);
    st.b[sq] = t * s;
    if (opts.gh && opts.gh.has(sq)) st.gh[sq] = 1;
    if (opts.gid && opts.gid.has(sq)) st.gid[sq] = opts.gid.get(sq);
    if (t === E.KING) st.k[s] = sq;
  }
  st.turn = opts.turn || E.WHITE;
  if (opts.castling) Object.assign(st.castling, opts.castling);
  st.hist = [];
  return st;
}

const T = E.ROOK, C = E.KNIGHT, A = E.BISHOP, D = E.QUEEN, R = E.KING, P = E.PAWN;
const W = E.WHITE, B = E.BLACK;

console.log('--- T1: perft V0 (config base) == motor original ---');
E.setConfig(E.variantConfig('V0'));
const st0 = E.initialState();
const base0 = Base.initialState();
for (const d of [1, 2, 3, 4]) {
  const p2 = E.perft(E.cloneState(st0), d);
  const p1 = Base.perft(Base.cloneState(base0), d);
  ok(p1 === p2, `perft(${d}): base=${p1} motor2=${p2}`);
}

console.log('--- T2: conversió celestial bàsica ---');
E.setConfig(E.variantConfig('V2'));
{
  // torre blanca e1 captura cavall negre e5 (terra)
  const st = posFrom([[0, 7, 4, T, W], [0, 3, 4, C, B], [0, 0, 4, R, B]]);
  const mv = E.genMoves(st, true).find(m => m.from === E.idxOf(0, 7, 4) && m.to === E.idxOf(0, 3, 4));
  ok(!!mv, 'la captura Te1xe5 és legal');
  E.make(st, mv);
  const celSq = E.idxOf(1, 3, 4);
  ok(st.b[celSq] === C * W, 'cavall blanc (bicolor) apareix al Cel e5¹');
  ok(st.gh[celSq] === 1, 'la peça convertida és fantasma (no pot baixar)');
  ok(st.b[E.idxOf(0, 3, 4)] === T * W, 'la torre capturadora es queda a e5 de Terra');
  const u = st.hist[st.hist.length - 1];
  ok(u.conv === celSq, 'registre de conversió correcte');
  ok(st.half === 0, 'rellotge de 50 jugades a zero (captura)');
  E.unmake(st);
  ok(st.b[E.idxOf(0, 7, 4)] === T * W && st.b[E.idxOf(0, 3, 4)] === C * B &&
     st.b[celSq] === 0 && st.gh[celSq] === 0, 'unmake restaura la posició sense conversió');
}

console.log('--- T3: els fantasmes no baixen, però jugen al Cel ---');
E.setConfig(E.variantConfig('V2'));
{
  const st = posFrom(
    [[1, 3, 4, C, W], [1, 0, 0, T, B], [0, 0, 4, R, B], [0, 7, 3, R, W]],
    { gh: new Set([E.idxOf(1, 3, 4)]), turn: W }
  );
  const moves = E.genMoves(st, true).filter(m => m.from === E.idxOf(1, 3, 4));
  ok(moves.length > 0, 'el fantasma té moviments dins del Cel');
  ok(moves.every(m => (m.to >> 7) === 1), 'cap moviment del fantasma baixa a Terra');
  // cavall cel e5¹ pot capturar torre negra a8¹? (b1¹->a8¹ no és moviment de cavall; usem d6¹)
}

console.log('--- T4: bloqueig de captura vs desplaçament ---');
{
  const base = [[0, 7, 4, T, W], [0, 3, 4, C, B], [1, 3, 4, T, B], [0, 0, 4, R, B], [0, 7, 3, R, W]];
  E.setConfig(Object.assign(E.variantConfig('V2'), { capBlock: 'block' }));
  const st1 = posFrom(base, { gid: new Map([[E.idxOf(0, 7, 3), 2]]) });
  const blocked = E.genMoves(st1, true).some(m => m.to === E.idxOf(0, 3, 4) && m.from === E.idxOf(0, 7, 4));
  ok(!blocked, "mode 'block': Te1xe5 no es genera (Cel e5¹ ocupat)");

  E.setConfig(Object.assign(E.variantConfig('V2'), { capBlock: 'displace' }));
  const st2 = posFrom(base, { gid: new Map([[E.idxOf(0, 7, 3), 2]]) });
  const cap = E.genMoves(st2, true).find(m => m.to === E.idxOf(0, 3, 4) && m.from === E.idxOf(0, 7, 4));
  ok(!!cap, "mode 'displace': la captura és legal");
  E.make(st2, cap);
  // casella lliure més propera a e5¹ (fila 3, col 4): anell 1, primer dr=-1,dc=-1 → d6¹
  ok(st2.b[E.idxOf(1, 2, 3)] === C * W, 'cavall convertit a la casella lliure més propera (d6¹)');
}

console.log('--- T4b: reglament v1.0 (capBlock \'lose\'): el Cel tapat no impedeix la captura ---');
{
  vi.resetModules();
  const fresh = await import('../src/engine/engine.js');
  ok(fresh.Engine.CFG.capBlock === 'lose', "per defecte el motor porta capBlock 'lose' (v1.0)");
}
{
  const base = [[0, 7, 4, T, W], [0, 3, 4, C, B], [1, 3, 4, T, B], [0, 0, 4, R, B], [0, 7, 3, R, W]];
  E.setConfig(Object.assign(E.variantConfig('V2'), { capBlock: 'lose' }));
  const st = posFrom(base, { gid: new Map([[E.idxOf(0, 7, 3), 2]]) });
  const cap = E.genMoves(st, true).find(m => m.to === E.idxOf(0, 3, 4) && m.from === E.idxOf(0, 7, 4));
  ok(!!cap, "'lose': Te1xe5 es genera encara que e5¹ estigui ocupat");
  E.make(st, cap);
  ok(st.b[E.idxOf(0, 3, 4)] === T * W, 'la torre capturadora es queda a e5');
  ok(st.b[E.idxOf(1, 3, 4)] === T * B, 'la torre negra que tapava el Cel hi continua');
  let ghost = false;
  for (let i = 128; i < 256; i++) if (st.b[i] === C * W || (st.gh[i] === 1 && st.b[i] !== T * B)) ghost = true;
  ok(!ghost, 'el cavall es perd definitivament: cap fantasma nou al Cel');
  E.unmake(st);
  ok(st.b[E.idxOf(0, 3, 4)] === C * B && st.b[E.idxOf(0, 7, 4)] === T * W, 'unmake restaura la posició');
  // amb el Cel lliure es converteix amb normalitat (mateix mode 'lose')
  const st2 = posFrom([[0, 7, 4, T, W], [0, 3, 4, C, B], [0, 0, 4, R, B], [0, 7, 3, R, W]]);
  const cap2 = E.genMoves(st2, true).find(m => m.to === E.idxOf(0, 3, 4) && m.from === E.idxOf(0, 7, 4));
  E.make(st2, cap2);
  ok(st2.b[E.idxOf(1, 3, 4)] === C * W && st2.gh[E.idxOf(1, 3, 4)] === 1,
    "'lose' amb el Cel lliure: conversió normal a e5¹");
}

console.log('--- T5: enroc internivell ---');
E.setConfig(E.variantConfig('V2'));
{
  // rei blanc e1 (T), torre blanca original e1¹ (C, gid 2) APILADA, rei negre e8 (T)
  const mk = () => posFrom(
    [[0, 7, 4, R, W], [1, 7, 4, T, W], [0, 0, 4, R, B]],
    { gid: new Map([[E.idxOf(1, 7, 4), 2]]),
      castling: { ilw_h: true } });
  const st = mk();
  const il = E.genMoves(st, true).find(m => m.flag === E.F_IL);
  ok(!!il, "es genera l'enroc internivell rei e1 ⇄ torre e1¹ (apilats)");
  if (il) {
    E.make(st, il);
    ok(st.k[W] === E.idxOf(1, 7, 4), 'el rei acaba al Cel e1¹');
    ok(st.b[E.idxOf(0, 7, 4)] === T * W, 'la torre acaba a Terra e1');
    ok(!st.castling.wk && !st.castling.wq && !st.castling.ilw_h, 'drets: enroc normal i IL d\u2019aquesta torre consumits');
    const st2 = mk();
    E.make(st2, il);
    E.unmake(st2);
    ok(st2.k[W] === E.idxOf(0, 7, 4) && st2.b[E.idxOf(1, 7, 4)] === T * W && st2.castling.ilw_h,
      'unmake de l\u2019enroc internivell correcte');
  }
  // torre NO apilada (altra coordenada del mateix nivell) → no es genera
  const stNA = posFrom(
    [[0, 7, 4, R, W], [1, 3, 4, T, W], [0, 0, 4, R, B]],
    { gid: new Map([[E.idxOf(1, 3, 4), 2]]), castling: { ilw_h: true } });
  ok(!E.genMoves(stNA, true).some(m => m.flag === E.F_IL),
    'torre a e5¹ (no apilada amb el rei e1): sense enroc internivell');
  // destí atacat → no es genera
  const st3 = posFrom(
    [[0, 7, 4, R, W], [1, 7, 4, T, W], [0, 0, 4, R, B], [1, 7, 7, T, B]],
    { gid: new Map([[E.idxOf(1, 7, 4), 2]]), castling: { ilw_h: true } });
  ok(!E.genMoves(st3, true).some(m => m.flag === E.F_IL),
    'destí atacat per torre negra h1¹: sense enroc internivell');
  // rei en escac → no es genera
  const st5 = posFrom(
    [[0, 7, 4, R, W], [1, 7, 4, T, W], [0, 0, 4, R, B], [0, 0, 4, D, B]],
    { gid: new Map([[E.idxOf(1, 7, 4), 2]]), castling: { ilw_h: true } });
  ok(!E.genMoves(st5, true).some(m => m.flag === E.F_IL),
    'rei blanc en escac (dama negra e8): sense enroc internivell');
  // torre fantasma: no es pot fer enroc
  const st6 = posFrom(
    [[0, 7, 4, R, W], [1, 7, 4, T, W], [0, 0, 4, R, B]],
    { gid: new Map([[E.idxOf(1, 7, 4), 2]]), gh: new Set([E.idxOf(1, 7, 4)]),
      castling: { ilw_h: true } });
  ok(!E.genMoves(st6, true).some(m => m.flag === E.F_IL),
    'torre convertida (fantasma): sense enroc internivell');
}

console.log('--- T6: promocions ---');
E.setConfig(E.variantConfig('V2'));
{
  // peó blanc al Cel e7¹ (fila 1) avança a e8¹: sense promoció
  const st = posFrom([[1, 1, 4, P, W], [0, 0, 4, R, B], [0, 7, 3, R, W]]);
  const adv = E.genMoves(st, true).find(m => m.from === E.idxOf(1, 1, 4) && m.to === E.idxOf(1, 0, 4));
  ok(!!adv && adv.promo === 0, 'avenç a e8¹ sense promoció');
  E.make(st, adv);
  ok(st.b[E.idxOf(1, 0, 4)] === P * W, ' continua sent peó al Cel');
}
{
  // peó blanc ja a e8¹ baixa a Terra e8: 4 promocions
  const st = posFrom([[1, 0, 4, P, W], [0, 0, 3, R, B], [0, 7, 3, R, W]]);
  const descs = E.genMoves(st, true).filter(m => m.from === E.idxOf(1, 0, 4) && m.flag === E.F_VERT);
  ok(descs.length === 4 && descs.every(m => m.promo !== 0), 'descens e8¹→e8 ofereix 4 promocions');
  E.make(st, descs.find(m => m.promo === E.QUEEN));
  ok(st.b[E.idxOf(0, 0, 4)] === D * W, 'baixa a Terra e8 i es converteix en dama');
}
E.setConfig(E.variantConfig('V1')); // promoDescent = false
{
  const st = posFrom([[1, 0, 4, P, W], [0, 0, 3, R, B], [0, 7, 3, R, W]]);
  const desc = E.genMoves(st, true).find(m => m.from === E.idxOf(1, 0, 4) && m.flag === E.F_VERT);
  ok(!!desc && desc.promo === 0, 'V1: descens sense promoció (peó zombi a e8)');
  // peó fantasma: no baixa
  const st2 = posFrom([[1, 3, 4, P, W], [0, 0, 4, R, B], [0, 7, 3, R, W]],
    { gh: new Set([E.idxOf(1, 3, 4)]) });
  ok(!E.genMoves(st2, true).some(m => m.from === E.idxOf(1, 3, 4) && m.flag === E.F_VERT),
    'peó fantasma: sense descens');
}

console.log('--- T7: escac vertical des del Cel ---');
E.setConfig(E.variantConfig('V2'));
{
  // una torre REAL al Cel sí que dona escac vertical cap avall
  const st = posFrom([[0, 4, 4, R, B], [1, 4, 4, T, W], [0, 7, 3, R, W]], { turn: B });
  ok(E.inCheck(st, B), 'rei negre e4 en escac per torre REAL a e4\u00b9 (foc vertical)');
  const moves = E.genMoves(st, true);
  ok(moves.every(m => m.from !== E.idxOf(0, 4, 4) || (m.to >> 7) === 0),
    'el rei no pot pujar a e4\u00b9: el pas vertical mai no captura');
  // un FANTASMA al Cel no colpeja cap avall (reglament: lluiten només dins del Cel)
  const stg = posFrom([[0, 4, 4, R, B], [1, 4, 4, T, W], [0, 7, 3, R, W]],
    { gh: new Set([E.idxOf(1, 4, 4)]), turn: B });
  ok(!E.inCheck(stg, B), 'torre FANTASMA a e4\u00b9 no colpeja cap avall: el rei e4 no est\u00e0 en escac');
  // per\u00f2 dins del Cel s\u00ed que ataca amb tota la llibertat del seu tipus
  const stk = posFrom([[1, 4, 0, R, B], [1, 4, 4, T, W], [0, 7, 3, R, W]],
    { gh: new Set([E.idxOf(1, 4, 4)]), turn: B });
  ok(E.inCheck(stk, B), 'torre fantasma e4\u00b9 S\u00cd que ataca el rei a a4\u00b9 (dins del Cel)');
}

console.log('--- T8: segona mort vs reconversió al Cel ---');
{
  E.setConfig(E.variantConfig('V2')); // heavenDeath = remove
  const base = [[1, 4, 3, T, W], [1, 4, 5, A, B], [0, 0, 4, R, B], [0, 7, 4, R, W]];
  const st1 = posFrom(base);
  const cap = E.genMoves(st1, true).find(m => m.to === E.idxOf(1, 4, 5));
  E.make(st1, cap);
  ok(st1.b[E.idxOf(1, 4, 5)] === T * W, "segona mort: l'alfil negre desapareix del Cel");

  E.setConfig(Object.assign(E.variantConfig('V4'), { capBlock: 'displace' })); // la reconversió necesita displacement
  const st2 = posFrom(base);
  const cap2 = E.genMoves(st2, true).find(m => m.to === E.idxOf(1, 4, 5));
  E.make(st2, cap2);
  // alfil blanc (reconvertit) a la casella lliure més propera a f5¹
  let found = false;
  for (let i = 128; i < 256; i++) if (st2.b[i] === A * W && st2.gh[i] === 1) found = true;
  ok(found, 'reconversió: alfil ara blanc i fantasma, dins del Cel');
  E.unmake(st2);
  ok(st2.b[E.idxOf(1, 4, 5)] === A * B, 'unmake de la reconversió correcte');
}

console.log('--- T9: fuzz make/unmake (totes les variants) ---');
for (const v of ['V0', 'V1', 'V2', 'V3', 'V4', 'V5']) {
  E.setConfig(E.variantConfig(v));
  const rng = mulberry32(12345 + v.charCodeAt(1));
  const st = E.initialState();
  let bad = null, plies = 0;
  for (let i = 0; i < 400 && !bad; i++) {
    const moves = E.genMoves(st, true);
    if (moves.length === 0) break;
    const snap = {
      b: st.b.slice(), gh: st.gh.slice(), gid: st.gid.slice(), turn: st.turn,
      castling: Object.assign({}, st.castling), ep: st.ep, half: st.half, ply: st.ply,
      k: { 1: st.k[1], '-1': st.k[-1] }
    };
    const m = moves[(rng() * moves.length) | 0];
    E.make(st, m);
    E.unmake(st);
    if (!E.stateEqual(snap, st)) bad = { i, m };
    E.make(st, m);
    plies++;
    const stat = E.gameStatus(st);
    if (stat.over) break;
  }
  ok(!bad, `variant ${v}: ${plies} jugades amb make/unmake exactes` + (bad ? ' ERROR a ' + bad.i : ''));
}

console.log('--- T10: cerca i estat de partida (V2) ---');
E.setConfig(E.variantConfig('V2'));
{
  const st = E.initialState();
  const info = E.search(st, { timeMs: 400, maxDepth: 3 });
  ok(!!info.move, 'search() retorna una jugada (prof. ' + info.depth + ', ' + info.nodes + ' nodes)');
  const stat = E.gameStatus(st);
  ok(stat.over === false && stat.moves.length > 20, 'posició inicial: partida oberta, ' + stat.moves.length + ' jugades legals');
}

console.log('--- T11: captura al pas (el «cercle vermell en casella buida») ---');
E.setConfig(E.variantConfig('V2'));
{
  const st = posFrom([
    [0, 6, 4, P, W],   // peó blanc e2
    [0, 4, 3, P, B],   // peó negre d4 (el veí que capturarà al pas)
    [0, 0, 4, R, B],   // rei negre e8
    [0, 7, 4, R, W],   // rei blanc e1
  ], { turn: E.WHITE });
  const e4 = E.idxOf(0, 4, 4), e3 = E.idxOf(0, 5, 4), e2 = E.idxOf(0, 6, 4),
        d4 = E.idxOf(0, 4, 3);
  const dbl = E.genMoves(st, true).find(m => m.from === e2 && m.flag === E.F_DBL);
  ok(!!dbl, 'el peó blanc té el doble pas e2-e4');
  E.make(st, dbl);
  ok(st.ep === e3, 'després de e2-e4 la casella de captura al pas és e3 (buida)');
  ok(st.b[e3] === 0 && st.b[e4] === P, 'e3 buida; la víctima és el peó blanc a e4');
  const ep = E.genMoves(st, true).find(m => m.from === d4 && m.flag === E.F_EP);
  ok(!!ep && ep.to === e3, 'el peó negre d4 pot capturar al pas cap a la casella buida e3');
  const celE4 = e4 ^ 128;
  E.make(st, ep);
  ok(st.b[e4] === 0 && st.b[e3] === -P, 'captura al pas executada: peó negre a e3, víctima fora');
  ok(st.b[celE4] === -P && st.gh[celE4] === 1, 'la víctima ascendeix com a fantasma negre al Cel (regla v1.0)');
  E.unmake(st);
  ok(st.b[e4] === P && st.b[e3] === 0 && st.b[celE4] === 0 && st.b[d4] === -P, 'unmake de la captura al pas exacte');
  E.unmake(st);

  // el dret caduca: després de qualsevol altra jugada, ja no hi ha captura al pas
  const st2 = posFrom([
    [0, 1, 3, P, B],   // peó negre d7
    [0, 3, 4, P, W],   // peó blanc e5 (el veí que capturaria al pas)
    [0, 0, 4, R, B], [0, 7, 4, R, W],
  ], { turn: E.BLACK });
  const d6 = E.idxOf(0, 2, 3);
  const dbl2 = E.genMoves(st2, true).find(m => m.from === E.idxOf(0, 1, 3) && m.flag === E.F_DBL);
  E.make(st2, dbl2);
  ok(st2.ep === d6, 'després de d7-d5 el blanc té el dret de captura al pas a d6');
  const epBla = E.genMoves(st2, true).find(m => m.flag === E.F_EP && m.to === d6);
  ok(!!epBla, 'el peó blanc e5 pot capturar al pas a d6 (buida)');
  E.make(st2, E.genMoves(st2, true).find(m => m.flag !== E.F_EP));
  ok(E.genMoves(st2, true).filter(m => m.flag === E.F_EP).length === 0,
     'el dret caduca: cap captura al pas després d\u2019una altra jugada blanca');
}

console.log('--- T14: ajudes de l\'Entrenador (coach) ---');
{
  // restaurar la configuració de l'app (reglament v1.0)
  E.setConfig({ conversion: true, capBlock: 'lose', heavenDeath: 'remove',
    ilCastling: true, promoDescent: true, promoCel: false });

  ok(E.sqToStr(E.idxOf(0, 7, 4)) === 'terra-e1', 'sqToStr: e1 de la Terra');
  ok(E.sqToStr(E.idxOf(1, 0, 0)) === 'cel-a8', 'sqToStr: a8 del Cel');

  // foc vertical: dama REAL blanca a terra-e4 amenaça la peça negra a cel-e4
  const stF = posFrom([[1, 4, 4, T, B], [0, 4, 4, D, W], [0, 0, 4, R, B], [0, 7, 3, R, W]], { turn: B });
  const atF = E.verticalAttackers(stF, E.idxOf(1, 4, 4), E.WHITE);
  ok(atF.length === 1 && atF[0] === E.idxOf(0, 4, 4), 'verticalAttackers: la dama de sota amenaça cel-e4');
  // una torre FANTASMA negra al cel no amenaça cap avall
  const stG = posFrom([[1, 4, 4, T, B], [0, 4, 4, D, W], [0, 0, 4, R, B], [0, 7, 3, R, W]],
    { turn: B, gh: new Set([E.idxOf(1, 4, 4)]) });
  ok(E.verticalAttackers(stG, E.idxOf(0, 4, 4), E.BLACK).length === 0,
    'verticalAttackers: la torre fantasma no colpeja cap avall');

  // conversió: captura a la Terra amb cel lliure -> pujarà fantasma; cel tapat -> es perd
  // (dama blanca e5, torre negra d4, peó negre f4, reis e8/e1, torre blanca d1)
  const stC = posFrom([[0, 4, 3, T, B], [0, 4, 5, P, B], [0, 3, 4, D, W],
    [0, 0, 4, R, B], [0, 7, 3, T, W], [0, 7, 4, R, W]], { turn: W });
  const capD4 = E.genMoves(stC, true).find(m => m.to === E.idxOf(0, 4, 3)); // dama e5xd4
  ok(!!capD4 && E.convertsTo(stC, capD4) === E.idxOf(1, 4, 3), 'convertsTo: exd4 puja fantasma a cel-d4');
  const capF4 = E.genMoves(stC, true).find(m => m.to === E.idxOf(0, 4, 5)); // dama e5xf4
  ok(!!capF4 && E.convertsTo(stC, capF4) === E.idxOf(1, 4, 5), 'convertsTo: exf4 puja fantasma a cel-f4');
  // cel tapat (peó blanc fantasma a cel-d4) i captura dins del Cel (torre blanca a5¹ x fantasma d5¹)
  const stT = posFrom([[0, 4, 3, T, B], [1, 4, 3, P, B], [1, 4, 0, T, W], [0, 3, 4, D, W],
    [0, 0, 4, R, B], [0, 7, 3, T, W], [0, 7, 4, R, W]],
    { turn: W, gh: new Set([E.idxOf(1, 4, 3)]) });
  const capT = E.genMoves(stT, true).find(m => m.to === E.idxOf(0, 4, 3));
  ok(!!capT && E.convertsTo(stT, capT) === -1, 'convertsTo: cel tapat -> la víctima es perd');
  const capCel = E.genMoves(stT, true).find(m => m.to === E.idxOf(1, 4, 3));
  ok(!!capCel && E.convertsTo(stT, capCel) === -1, 'convertsTo: captura al cel -> no és conversió');

  // varietat d\'obertura: sense opcions, la cerca és determinista; amb varietat, mou legal
  const stV = posFrom([
    [0, 0, 0, R, B], [0, 0, 7, R, B], [0, 7, 0, R, W], [0, 7, 7, R, W], [0, 7, 4, R, W],
    [0, 0, 4, R, B], [0, 5, 3, P, W], [0, 2, 3, P, B],
  ], { turn: E.WHITE });
  const r1 = E.search(stV, { timeMs: 300, maxDepth: 3, blunder: 0 });
  const r2 = E.search(stV, { timeMs: 300, maxDepth: 3, blunder: 0 });
  ok(r1.move && r2.move && r1.move.from === r2.move.from && r1.move.to === r2.move.to,
    'search sense varietat: determinista');
  const r3 = E.search(stV, { timeMs: 300, maxDepth: 3, blunder: 0, variety: 200 });
  ok(r3.move && E.genMoves(stV, true).some(m => m.from === r3.move.from && m.to === r3.move.to),
    'search amb varietat: mou una jugada legal');
}

console.log('--- T15: persistència del fantasma (mai no perd la condició, mai no baixa, mai no promociona) ---');
{
  const b7 = E.idxOf(1, 1, 1), b8c = E.idxOf(1, 0, 1), b8t = E.idxOf(0, 0, 1);
  // peó fantasma servint blanc a cel-b7: avança a l'última fila del Cel sense promocionar
  const stG = posFrom([[0, 7, 6, R, E.WHITE], [0, 0, 6, R, E.BLACK], [1, 1, 1, P, E.WHITE]],
                      { gh: new Set([b7]), turn: E.WHITE });
  const mvG = E.genMoves(stG, true).filter(m => m.from === b7);
  ok(mvG.length === 1 && mvG[0].to === b8c && mvG[0].promo === 0, 'fantasma-peó: b7->b8 sense promoció');
  ok(!mvG.some(m => m.flag === E.F_VERT), 'fantasma-peó: cap moviment vertical');
  E.make(stG, mvG[0]); stG.turn = E.WHITE;
  ok(stG.gh[b8c] === 1 && Math.abs(stG.b[b8c]) === P,
    'mogut: encara és fantasma i segueix sent peó (zombi a l\'última fila del Cel)');
  ok(E.genMoves(stG, true).every(m => m.from !== b8c), 'zombi a cel-b8: cap jugada (no baixa ni avança)');
  E.unmake(stG);
  ok(stG.gh[b7] === 1, 'unmake restaura la condició de fantasma');
  // un cavall fantasma conserva la condició en saltar
  const d4 = E.idxOf(1, 4, 3);
  const stC = posFrom([[0, 7, 6, R, E.WHITE], [0, 0, 6, R, E.BLACK], [1, 4, 3, C, E.WHITE]],
                      { gh: new Set([d4]), turn: E.WHITE });
  const mvC = E.genMoves(stC, true).filter(m => m.from === d4);
  E.make(stC, mvC[0]); stC.turn = E.WHITE;
  ok(stC.gh[mvC[0].to] === 1 && !E.genMoves(stC, true).some(m => m.from === mvC[0].to && m.flag === E.F_VERT),
    'cavall fantasma: conserva la condició en saltar i mai no baixa');
  E.unmake(stC);
  // el VIATGER (peó pujat voluntàriament, sense gh) sí que baixa i corona A TERRA
  const stV2 = posFrom([[0, 7, 6, R, E.WHITE], [0, 0, 6, R, E.BLACK], [1, 0, 1, P, E.WHITE]], { turn: E.WHITE });
  const mvV = E.genMoves(stV2, true).filter(m => m.from === b8c);
  ok(mvV.length === 4 && mvV.every(m => m.flag === E.F_VERT && m.promo && m.to === b8t),
    'viatger a cel-b8: només 4 descenss de promoció a terra-b8');
  const q = mvV.find(m => m.promo === E.QUEEN);
  E.make(stV2, q);
  ok(stV2.b[b8t] === E.QUEEN && stV2.gh[b8t] === 0, 'la corona passa DAMUNT LA TERRA (promoció de descens)');
}

// ---------- v1.2: correccions i optimitzacions de la cerca ----------
{
  const saved = Object.assign({}, E.CFG);

  // (a) reconversió al Cel (V4) sense desplaçament: ara reconverteix, i el unmake no esborra la captora
  // el cavall blanc de cel-b6 captura el peó negre de cel-a8; tot l'entorn del peó està ocupat
  // excepte la casella que el cavall acaba de deixar buida (cel-b6), que és on cau el fantasma
  E.setConfig(E.variantConfig('V4'));
  const K = E.KNIGHT, P = E.PAWN, Kg = E.KING;
  const W = E.WHITE, B = E.BLACK;
  const list = [[0, 7, 6, Kg, W], [0, 0, 6, Kg, B],
    [1, 2, 1, K, W],                       // captora (cel-b6)
    [1, 0, 0, P, B],                       // víctima (cel-a8)
    [1, 0, 1, P, B], [1, 1, 0, P, B], [1, 1, 1, P, B],        // anell 1 ocupat
    [1, 0, 2, P, W], [1, 1, 2, P, W], [1, 2, 0, P, W], [1, 2, 2, P, W]]; // anell 2 ocupat (menys l'origen)
  const stR = posFrom(list, { turn: W });
  const origin = E.idxOf(1, 2, 1), victimSq = E.idxOf(1, 0, 0);
  const capt = E.genMoves(stR, true).find(m => m.from === origin && m.to === victimSq);
  const before = E.cloneState(stR);
  ok(!!capt, 'V4: el cavall del Cel pot capturar al Cel');
  E.make(stR, capt);
  ok(stR.b[victimSq] === K * W && stR.b[origin] === P * W && stR.gh[origin] === 1,
    'V4 sense displace: la víctima es reconverteix a la casella lliure més propera (aquí, l\'origen)');
  E.unmake(stR);
  ok(E.stateEqual(before, stR) && stR.b[origin] === K * W,
    'V4: unmake restaura la captora encara que el fantasma hagi caigut a la seva casella d\'origen');

  // (b) make/unmake exacte a 2 plies amb la reconversió activa
  let bad = 0;
  for (let g = 0; g < 6; g++) {
    const r = mulberry32(900 + g), st = E.initialState();
    for (let i = 0; i < 45; i++) {
      const ms = E.genMoves(st, true);
      if (!ms.length) break;
      for (const m of ms) {
        const s0 = E.cloneState(st);
        E.make(st, m);
        for (const m2 of E.genMoves(st, true).slice(0, 12)) {
          const s1 = E.cloneState(st);
          E.make(st, m2); E.unmake(st);
          if (!E.stateEqual(s1, st)) bad++;
        }
        E.unmake(st);
        if (!E.stateEqual(s0, st)) bad++;
      }
      const w = ms.filter(m => m.flag === E.F_IL || m.flag === E.F_VERT || st.b[m.to] !== 0 || m.promo);
      E.make(st, (w.length && r() < 0.5) ? w[(r() * w.length) | 0] : ms[(r() * ms.length) | 0]);
    }
  }
  ok(bad === 0, 'V4: make/unmake exacte a 2 plies en partides aleatòries (errors: ' + bad + ')');

  // (c) genPseudo(st, true) (només captures/promocions) == filtre antic de la quiescència
  E.setConfig(saved);
  const key = m => m.from + '.' + m.to + '.' + m.flag + '.' + m.promo;
  const isCap = (st, m) => m.flag !== E.F_IL && (m.flag === E.F_EP || st.b[m.to] !== 0 || m.promo !== 0);
  let capsBad = 0, capsN = 0;
  for (let g = 0; g < 12; g++) {
    const r = mulberry32(300 + g), st = E.initialState();
    for (let i = 0; i < 70; i++) {
      const ms = E.genMoves(st, true);
      if (!ms.length) break;
      const a = E.genPseudo(st).filter(m => isCap(st, m)).map(key).sort().join();
      const c = E.genPseudo(st, true).map(key).sort().join();
      capsN++; if (a !== c) capsBad++;
      const w = ms.filter(m => m.flag === E.F_IL || m.flag === E.F_VERT || st.b[m.to] !== 0 || m.promo);
      E.make(st, (w.length && r() < 0.5) ? w[(r() * w.length) | 0] : ms[(r() * ms.length) | 0]);
    }
  }
  ok(capsBad === 0 && capsN > 400, 'genPseudo(capsOnly) coincideix amb el filtre de captures (' + capsN + ' posicions)');

  // (d) la cerca optimitzada (PVS + assassins + historial) dóna el mateix valor que un alfa-beta simple
  const MATE = 100000;
  function refQ(st, alpha, beta, ply) {
    const stand = (st.turn === E.WHITE ? 1 : -1) * E.evalState(st);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (ply > 48) return alpha;
    const mover = st.turn;
    for (const m of E.genPseudo(st).filter(x => isCap(st, x))) {
      E.make(st, m);
      if (E.inCheck(st, mover)) { E.unmake(st); continue; }
      const sc = -refQ(st, -beta, -alpha, ply + 1);
      E.unmake(st);
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }
  function refNega(st, depth, alpha, beta, ply) {
    if (st.half >= 100) return 0;
    if (depth <= 0) return refQ(st, alpha, beta, ply);
    const mover = st.turn; let legal = 0;
    for (const m of E.genPseudo(st)) {
      E.make(st, m);
      if (E.inCheck(st, mover)) { E.unmake(st); continue; }
      legal++;
      const sc = -refNega(st, depth - 1, -beta, -alpha, ply + 1);
      E.unmake(st);
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    if (legal === 0) return E.inCheck(st, mover) ? -(MATE - ply) : 0;
    return alpha;
  }
  function refRoot(state, depth) {
    const st = E.cloneState(state); let best = -Infinity;
    for (const m of E.genMoves(st, true)) {
      E.make(st, m);
      best = Math.max(best, -refNega(st, depth - 1, -Infinity, -best, 1));
      E.unmake(st);
    }
    return best;
  }
  let sBad = 0, sN = 0;
  for (let g = 0; g < 5; g++) {
    const r = mulberry32(40 + g), st = E.initialState();
    for (let i = 0; i < 8 + g * 4; i++) {
      const ms = E.genMoves(st, true); if (!ms.length) break;
      E.make(st, ms[(r() * ms.length) | 0]);
    }
    for (const d of [1, 2, 3]) {
      const got = E.search(st, { timeMs: 1e9, maxDepth: d }).score;
      const exp = refRoot(st, d);
      sN++; if (got !== exp) sBad++;
    }
  }
  ok(sBad === 0, 'cerca optimitzada == alfa-beta de referència (' + sN + ' cerques, ' + sBad + ' diferències)');
  E.setConfig(saved);
}

test('suite completa del motor: ' + passed + ' ok, ' + failed + ' fail', () => {
  expect(fails, fails.join(' | ')).toEqual([]);
});
