/* F1b — Infraestructura de hash amb CLAU MANDROSA: st.key és un BigInt vàlid o
   null (bruta); make() no paga cap zobrist, getKey(st) materialitza la clau quan
   algú la demana, i el hash de CFG va en cache (invalidat a setConfig).
   Hereta tots els casos de F1 (adaptats a la forma mandrosa) i afegeix els casos
   propis de la mandrosa (a–g). La igualtat de claus es comprova amb
   getKey(a) === getKey(b): stateEqual compara posició, no la cau derivada.
   Aquesta fase és NOMÉS infraestructura: no pot canviar cap jugada legal, cap
   avaluació ni cap resultat de partida (les 72 baselines de perft de F0a
   han de sortir exactament iguals — es verifiquen a f0a-perft-baselines.test.js). */
'use strict';
import { expect, test } from 'vitest';
import { Engine as E } from '../src/engine/engine.js';

let passed = 0, failed = 0;
const fails = [];
function ok(cond, name) {
  if (cond) { passed++; console.log('  ok  - ' + name); }
  else { failed++; fails.push(name); console.log('  FAIL- ' + name); }
}

const W = E.WHITE, B = E.BLACK, K = E.KING, R = E.ROOK;

// PRNG determinista (mulberry32): la mateixa llavor genera sempre la mateixa partida.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isBigint(x) { return typeof x === 'bigint'; }

// (a) initialState: key materialitzada un cop, keys buida (paral·lela a hist, també buida)
{
  const st = E.initialState();
  ok(isBigint(st.key), 'a: st.key és un BigInt materialitzat per initialState');
  ok(st.key === E.zobrist(st), 'a: st.key === zobrist(st) a la posició inicial');
  ok(st.keys.length === 0, 'a: st.keys.length === 0');
  ok(st.hist.length === 0, 'a: st.hist.length === 0');
  ok(E.initialState().key === st.key, 'a: dues initialState() tenen la mateixa clau (determinisme)');
}

// (b)+(c) 30 jugades legals deterministes des de l'inicial, amb invariant
//         keys.length === hist.length després de CADA make i CADA unmake.
{
  const st = E.initialState();
  const rnd = mulberry32(20261114);
  const preKeys = []; // clau abans de cada jugada
  const N = 30;
  let played = 0;
  for (let i = 0; i < N; i++) {
    const ms = E.genMoves(st, true);
    if (!ms.length) { ok(false, 'b: partida acabada abans de 30 jugades (a la jugada ' + i + ')'); break; }
    const m = ms[Math.floor(rnd() * ms.length)];
    preKeys.push(st.key);
    E.make(st, m);
    played++;
    ok(st.key === null, 'b: jugada ' + (i + 1) + ' — st.key === null just després del make (clau mandrosa)');
    const kNow = E.getKey(st);
    ok(kNow === E.zobrist(st), 'b: jugada ' + (i + 1) + ' — getKey(st) === zobrist(st)');
    ok(st.key === kNow, 'b: jugada ' + (i + 1) + ' — getKey materialitza i deixa st.key vàlida');
    ok(st.keys.length === st.hist.length, 'b: jugada ' + (i + 1) + ' — invariant keys.length === hist.length (' + st.keys.length + ')');
    ok(st.keys.length === i + 1 && st.hist.length === i + 1, 'b: jugada ' + (i + 1) + ' — la pila creix en paral·lel');
    ok(st.keys[st.keys.length - 1] === preKeys[i], 'b: jugada ' + (i + 1) + ' — keys[last] és la clau prèvia');
  }
  ok(played === N, 'b/c: s\u2019han jugat exactament ' + N + ' jugades legals (jugades: ' + played + ')');
  ok(st.keys.length === st.hist.length && st.keys.length === N, 'b/c: invariant abans de desfer tot');

  // genMoves fa make/unmake interns per filtrar legalitat: la clau no canvia
  const keyBeforeGen = E.getKey(st);
  E.genMoves(st, true);
  ok(E.getKey(st) === keyBeforeGen, 'b/c: genMoves (make/unmake interns) deixa la clau intacta');
  ok(st.keys.length === st.hist.length, 'b/c: invariant intacta després de genMoves');

  const keyInicial = preKeys[0];
  for (let i = played - 1; i >= 0; i--) {
    E.unmake(st);
    ok(E.getKey(st) === E.zobrist(st), 'c: unmake ' + (i + 1) + ' — getKey(st) === zobrist(st)');
    ok(st.key === preKeys[i], 'c: unmake ' + (i + 1) + ' — la clau coincideix amb la prèvia a la jugada corresponent');
    ok(st.keys.length === st.hist.length && st.keys.length === i, 'c: unmake ' + (i + 1) + ' — invariant keys.length === hist.length (' + st.keys.length + ')');
  }
  ok(st.key === keyInicial && E.getKey(st) === E.zobrist(st), 'c: després de desfer-ho tot, clau = clau inicial');
  ok(st.keys.length === 0 && st.hist.length === 0, 'c: després de desfer-ho tot, keys i hist buides');
}

// (d) V0–V5: partida curta de 10 jugades per variant, make i unmake amb invariant
{
  const savedCfg = Object.assign({}, E.CFG);
  for (const v of ['V0', 'V1', 'V2', 'V3', 'V4', 'V5']) {
    E.setConfig(E.variantConfig(v));
    const st = E.initialState();
    ok(st.key === E.zobrist(st), 'd ' + v + ': clau inicial coherent amb el CFG de la variant');
    const rnd = mulberry32(42 + ['V0', 'V1', 'V2', 'V3', 'V4', 'V5'].indexOf(v));
    const preKeys = [];
    const N = 10;
    let played = 0;
    let seqOk = true, invOk = true, undoKeyOk = true;
    for (let i = 0; i < N; i++) {
      const ms = E.genMoves(st, true);
      if (!ms.length) { seqOk = false; break; }
      const m = ms[Math.floor(rnd() * ms.length)];
      preKeys.push(st.key);
      E.make(st, m);
      played++;
      if (st.key !== null) seqOk = false; // mandrosa: cap make no calcula zobrist
      if (E.getKey(st) !== E.zobrist(st) || !isBigint(E.getKey(st))) seqOk = false;
      if (st.keys.length !== st.hist.length || st.keys.length !== i + 1) invOk = false;
    }
    ok(seqOk && played === N, 'd ' + v + ': ' + played + '/10 jugades, st.key null al make i getKey(st) === zobrist(st)');
    ok(invOk, 'd ' + v + ': invariant keys.length === hist.length a cada make');
    for (let i = played - 1; i >= 0; i--) {
      E.unmake(st);
      if (st.key !== preKeys[i] || E.getKey(st) !== E.zobrist(st)) undoKeyOk = false;
      if (st.keys.length !== st.hist.length || st.keys.length !== i) invOk = false;
    }
    ok(undoKeyOk, 'd ' + v + ': cada unmake restaura exactament la clau prèvia');
    ok(invOk, 'd ' + v + ': invariant a cada unmake');
    ok(st.keys.length === 0 && st.hist.length === 0, 'd ' + v + ': pila buida al final');
  }
  E.setConfig(savedCfg);
}

// (e) cloneState preserva l'estat de la clau (vàlida o null) i deixa hist/keys buits
{
  const st = E.initialState();
  const c = E.cloneState(st);
  ok(c.key === st.key, 'e: el clon preserva la clau materialitzada');
  ok(c.key === E.zobrist(c), 'e: la clau del clon és coherent amb la seva posició');
  ok(c.keys.length === 0 && c.hist.length === 0, 'e: el clon té keys i hist buides');
  ok(c.keys !== st.keys && c.hist !== st.hist, 'e: keys i hist del clon són arrays nous (no compartits)');

  // clon d'un estat AMB historial (sense getKey: clau null mandrosa)
  const rnd = mulberry32(7);
  for (let i = 0; i < 5; i++) {
    const ms = E.genMoves(st, true);
    E.make(st, ms[Math.floor(rnd() * ms.length)]);
  }
  ok(st.key === null, 'e: l\u2019original sense getKey té la clau null (mandrosa)');
  const c2 = E.cloneState(st);
  ok(c2.key === st.key, 'e: clon d\u2019estat amb historial preserva l\u2019estat de la clau (null aquí)');
  ok(E.getKey(c2) === E.zobrist(c2), 'e: getKey del clon amb historial coherent amb la seva posició');
  ok(c2.keys.length === 0 && c2.hist.length === 0, 'e: clon amb historial → keys i hist buides al clon');
  ok(st.keys.length === 5 && st.hist.length === 5, 'e: l\u2019original conserva la seva pila (5)');
  ok(E.getKey(c2) === E.getKey(st), 'e: dues caus independents (clon i original) materialitzen el mateix valor');
  ok(E.stateEqual(st, c2) === true, 'e: stateEqual(original, clon) — compara posició, no la cau');
}

// (f) claus DIFERENTS per a: torn diferent, un dret d'enroc menys, ep diferent,
//     CFG diferent (V2 vs V4). Mutacions directes → refreshKey abans de comparar.
{
  const base = E.initialState();
  const kTurnW = E.refreshKey(base);

  const stTurnB = E.initialState();
  stTurnB.turn = B;
  ok(stTurnB.key !== E.zobrist(stTurnB), 'f: mutació directa de torn deixa la clau (en caché) OBSOLETA (contracte documentat)');
  const kTurnB = E.refreshKey(stTurnB);
  ok(isBigint(kTurnB) && kTurnB === stTurnB.key, 'f: refreshKey retorna i assigna la clau');
  ok(kTurnW !== kTurnB, 'f: mateixa posició amb torn diferent → claus DIFERENTS');

  const stNoWk = E.initialState();
  stNoWk.castling.wk = false;
  const kNoWk = E.refreshKey(stNoWk);
  ok(kTurnW !== kNoWk, 'f: un dret d\u2019enroc menys → clau DIFERENT');

  const stEp = E.initialState();
  stEp.ep = E.idxOf(0, 2, 3); // casella ep plausible (a3 del bàndol negre)
  const kEp = E.refreshKey(stEp);
  ok(kTurnW !== kEp, 'f: ep diferent → clau DIFERENT');

  const savedCfg = Object.assign({}, E.CFG);
  E.setConfig(E.variantConfig('V2'));
  const stV2 = E.initialState();
  const kV2 = stV2.key;
  const coherentV2 = kV2 === E.zobrist(stV2);
  E.setConfig(E.variantConfig('V4'));
  const stV4 = E.initialState();
  const kV4 = stV4.key;
  const coherentV4 = kV4 === E.zobrist(stV4);
  E.setConfig(savedCfg);
  ok(kV2 !== kV4, 'f: CFG diferent (V2 vs V4) → claus DIFERENTS');
  ok(coherentV2 && coherentV4, 'f: cada clau de variant és coherent dins del seu CFG');

  ok(!(kTurnW === kNoWk || kTurnW === kEp || kNoWk === kEp), 'f: totes les variants de posició donen claus mútuament diferents');
}

// (g) una peça marcada com a fantasma (gh=1) canvia la clau
{
  const mkPos = (withGhost) => {
    const st = E.initialState();
    st.b.fill(0); st.gh.fill(0); st.gid.fill(0);
    st.castling = { wk: false, wq: false, bk: false, bq: false, ilw_h: false, ilw_q: false, ilb_h: false, ilb_q: false };
    st.b[E.idxOf(0, 7, 4)] = K * W;
    st.b[E.idxOf(1, 4, 4)] = R * W;
    st.k[W] = E.idxOf(0, 7, 4);
    st.turn = W;
    if (withGhost) st.gh[E.idxOf(1, 4, 4)] = 1;
    return st;
  };
  const stPlain = mkPos(false), stGhost = mkPos(true);
  const kPlain = E.refreshKey(stPlain);
  const kGhost = E.refreshKey(stGhost);
  ok(kPlain !== kGhost, 'g: gh=1 → clau DIFERENT de la mateixa posició sense marcador');
  ok(kPlain === E.zobrist(stPlain) && kGhost === E.zobrist(stGhost), 'g: ambdues claus coherents amb zobrist');
}

// (h) metodologia de posicions artificials: la clau (en caché) és obsoleta fins a refreshKey
{
  const st = E.initialState();
  const k0 = st.key;
  st.b[E.idxOf(0, 6, 4)] = 0; // traiem el peó blanc de e2 (fila 6)
  ok(st.key === k0 && st.key !== E.zobrist(st), 'h: mutar st.b directament NO actualitza la clau (cal refreshKey)');
  const k1 = E.refreshKey(st);
  ok(k1 === E.zobrist(st) && k1 !== k0, 'h: refreshKey recalcula i retorna la clau nova');
}

// (L) CLAU MANDROSA: casos propis (a–g del contracte F1b)
{
  const st = E.initialState();
  const k0 = st.key; // materialitzada per initialState
  const ms = E.genMoves(st, true);
  E.make(st, ms[0]);
  ok(st.key === null, 'L-a: després de make(), st.key === null (no s\u2019ha calculat cap zobrist)');
  const k1 = E.getKey(st);
  ok(isBigint(k1) && st.key === k1 && k1 === E.zobrist(st), 'L-b: getKey(st) materialitza i deixa st.key vàlida');
  ok(E.getKey(st) === k1 && st.key === k1, 'L-c: dues crides a getKey() sense canvi de posició retornen el mateix');
  ok(st.keys.length === st.hist.length && st.keys.length === 1, 'L: invariant després del make');

  // (d): jugades SENSE getKey() entremig en un estat nou: keys conté nulls i la invariant es manté
  const st2 = E.initialState();
  const k0b = st2.key;
  E.make(st2, E.genMoves(st2, true)[0]);
  E.make(st2, E.genMoves(st2, true)[0]);
  E.make(st2, E.genMoves(st2, true)[0]);
  ok(st2.key === null, 'L-d: després de 3 makes sense cap getKey, st.key és null');
  ok(st2.keys.length === st2.hist.length && st2.keys.length === 3, 'L-d: invariant keys.length === hist.length (3)');
  ok(st2.keys[0] === k0b, 'L-d: keys[0] és la clau materialitzada inicial');
  ok(st2.keys[1] === null && st2.keys[2] === null, 'L-d: keys conté nulls on ningú va demanar la clau');

  // (e): unmake restaura exactament el valor previ (null o vàlid)
  E.unmake(st2);
  ok(st2.key === null, 'L-e: unmake restaura la clau previa NULL exacta');
  ok(st2.keys.length === 2 && st2.keys.length === st2.hist.length, 'L-e: invariant després del primer unmake');
  E.unmake(st2);
  ok(st2.key === null, 'L-e: unmake restaura null (2n)');
  E.unmake(st2);
  ok(st2.key === k0b && E.getKey(st2) === E.zobrist(st2), 'L-e: unmake restaura la clau materialitzada inicial (k0)');
  ok(st2.keys.length === 0 && st2.hist.length === 0, 'L-e: pila buida al final');
  // i el mateix camí en un estat AMB getKey a cada pas: unmake restaura valors vàlids
  const st3 = E.initialState();
  const k0c = st3.key;
  for (let i = 0; i < 3; i++) { E.make(st3, E.genMoves(st3, true)[0]); E.getKey(st3); }
  ok(st3.keys[0] === k0c && st3.keys[1] !== null && st3.keys[2] !== null, 'L-e: amb getKey a cada pas, keys conté claus vàlides');
  for (let i = 0; i < 3; i++) E.unmake(st3);
  ok(st3.key === k0c && E.getKey(st3) === E.zobrist(st3), 'L-e: desfer tot amb claus vàlides restaura la inicial exacta');

  // (f): posicions IGUALS, una amb clau materialitzada i l'altra null
  const play3 = (s) => {
    const rnd = mulberry32(99);
    for (let i = 0; i < 3; i++) {
      const mv = E.genMoves(s, true);
      E.make(s, mv[Math.floor(rnd() * mv.length)]);
    }
  };
  const a = E.initialState();
  play3(a);
  E.getKey(a); // materialitzada
  const b2 = E.initialState();
  play3(b2);   // mateixa seqüència determinista, SENSE getKey → null
  ok(a.key !== null && b2.key === null, 'L-f: posicions iguals amb clau materialitzada vs null');
  ok(E.stateEqual(a, b2) === true, 'L-f: stateEqual diu TRUE (la clau és cau derivada, no estat autoritzatiu)');
  ok(E.getKey(a) === E.getKey(b2), 'L-f: getKey(a) === getKey(b2) — mateixa posició, mateixa clau');
  ok(a.key !== null && b2.key !== null, 'L-f: després de getKey, totes dues materialitzades');

  // (g): el cache del hash de CFG s'invalida a setConfig
  const savedCfg = Object.assign({}, E.CFG);
  E.setConfig(E.variantConfig('V2'));
  const stA = E.initialState();
  E.make(stA, E.genMoves(stA, true)[0]); // clau null
  const kA = E.getKey(stA);              // materialitza amb el hash de CFG en cache (V2)
  ok(kA === E.zobrist(stA), 'L-g V2: getKey coherent amb zobrist dins del CFG V2');
  E.setConfig(E.variantConfig('V4'));    // invalida el cache del hash de CFG
  const stB = E.initialState();
  E.make(stB, E.genMoves(stB, true)[0]); // clau null
  const kB = E.getKey(stB);              // materialitza amb el hash RECALCULAT (V4)
  ok(kB === E.zobrist(stB), 'L-g V4: getKey coherent dins del CFG V4 (cache invalidat)');
  ok(kA !== kB, 'L-g: setConfig(V2)→getKey i setConfig(V4)→getKey donen claus DIFERENTS');
  ok(E.getKey(stB) === kB, 'L-g: segona getKey dins del mateix CFG no canvia (cache estable)');
  E.setConfig(savedCfg);
}

console.log('--- F1b infraestructura de hash (clau mandrosa): ' + passed + ' ok, ' + failed + ' fail ---');

test('F1b hash (clau mandrosa + cache CFG): ' + passed + ' ok, ' + failed + ' fail', () => {
  expect(fails).toEqual([]);
});
