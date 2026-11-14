/* F0a — Variant CI-friendly del diferencial chess.js.
   Mateixa lògica que el test 'matches chess.js legal moves through 10,000
   seeded random classical games' de tests/rules.test.js:291-340 (mateixa
   llavor, mateixa comparació ordenada, mateix límit de 200 plies i de
   repetició triple), però amb 200 partides en comptes de 10.000.
   Raó: en l'entorn de verificació sandbox el test de 10.000 partides triga
   ~1 h (551 ms/partida mesurats amb la mateixa lògica sense límit de plies) i
   no cap dins del seu propi timeout de 600 s; aquesta variant dóna la mateixa
   garantia estructural en ~1-2 min. El test de 10.000 segueix sent la
   referència per a màquines de desenvolupament. */
'use strict';
import { expect, test } from 'vitest';
import { Chess } from 'chess.js';
import { Engine as E, legalMoves, applyMove } from '../src/core/rules.js';

const GAMES = 200;

test('F0a: matches chess.js legal moves on ' + GAMES + ' seeded random classical games', async () => {
  E.setConfig(E.CLASSICAL_MODE);
  const files = 'abcdefgh';
  const algebraic = sq => `${files[E.colOf(sq)]}${8 - E.rowOf(sq)}`;
  const promoLetter = { [E.QUEEN]: 'q', [E.ROOK]: 'r', [E.BISHOP]: 'b', [E.KNIGHT]: 'n' };

  let seed = 0x6d2b79f5;
  const random = () => {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let value = seed;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };

  let positionsCompared = 0;
  const divergences = [];
  for (let game = 0; game < GAMES; game++) {
    const chess = new Chess();
    const state = E.initialState();
    const repetitions = new Map([[chess.fen().split(' ').slice(0, 4).join(' '), 1]]);
    for (let ply = 0; ply < 200; ply++) {
      if (state.half >= 100) break;
      const ourMoves = legalMoves(state);
      const ours = ourMoves
        .map(move => `${algebraic(move.from)}${algebraic(move.to)}${promoLetter[move.promo] || ''}`)
        .sort();
      const theirs = chess.moves({ verbose: true })
        .map(move => `${move.from}${move.to}${move.promotion || ''}`)
        .sort();
      positionsCompared++;
      if (ours.length !== theirs.length || ours.some((move, index) => move !== theirs[index])) {
        divergences.push({ game, ply, ours, theirs });
        break;
      }
      if (!ours.length) break;
      const move = ourMoves[Math.floor(random() * ourMoves.length)];
      applyMove(state, move); // valida contra legalMoves i muta; llança si és ilegal
      chess.move({
        from: algebraic(move.from),
        to: algebraic(move.to),
        ...(move.promo ? { promotion: promoLetter[move.promo] } : {})
      });
      const repetitionKey = chess.fen().split(' ').slice(0, 4).join(' ');
      const repetitionsOfPosition = (repetitions.get(repetitionKey) || 0) + 1;
      repetitions.set(repetitionKey, repetitionsOfPosition);
      if (repetitionsOfPosition === 3) break;
    }
    if (divergences.length) break;
    await new Promise(r => setTimeout(r, 0));
  }
  console.info(`F0a CLASSICAL_MODE differential (${GAMES} games): ${positionsCompared} positions, ${divergences.length} divergences`);
  expect(divergences).toEqual([]);
}, 300_000);
