import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  Engine as E, applyMove, gameStatus, isCheck, legalMoves, zobrist
} from '../src/core/rules.js';

const W = E.WHITE, B = E.BLACK;
const P = E.PAWN, N = E.KNIGHT, BI = E.BISHOP, R = E.ROOK;
const Q = E.QUEEN, K = E.KING;
const at = (level, row, col) => E.idxOf(level, row, col);
const key = move => `${move.from}:${move.to}:${move.promo || 0}`;
const files = 'abcdefgh';
const algebraic = sq => `${files[E.colOf(sq)]}${8 - E.rowOf(sq)}`;
const promoLetter = { [E.QUEEN]: 'q', [E.ROOK]: 'r', [E.BISHOP]: 'b', [E.KNIGHT]: 'n' };

function position(pieces, options = {}) {
  const state = E.initialState();
  state.b.fill(0);
  state.gh.fill(0);
  state.gid.fill(0);
  state.castling = {
    wk: false, wq: false, bk: false, bq: false,
    ilw_h: false, ilw_q: false, ilb_h: false, ilb_q: false
  };
  state.k = { 1: -1, '-1': -1 };
  for (const [level, row, col, type, color] of pieces) {
    const sq = at(level, row, col);
    state.b[sq] = type * color;
    if (type === K) state.k[color] = sq;
  }
  for (const sq of options.ghosts || []) state.gh[sq] = 1;
  for (const [sq, gid] of options.gids || []) state.gid[sq] = gid;
  Object.assign(state.castling, options.castling || {});
  state.turn = options.turn ?? W;
  state.half = options.half ?? 0;
  state.hist = [];
  return state;
}

function setVariant() { E.setConfig(E.variantConfig('V2')); }
beforeEach(setVariant);
afterEach(() => E.setConfig(E.variantConfig('V2')));

describe('pure rules API and variant decisions', () => {
  it('exports the pure rules entry points and mutates state as documented', () => {
    E.setConfig(E.CLASSICAL_MODE);
    const state = E.initialState();
    expect(legalMoves(state)).toHaveLength(20);
    expect(isCheck(state, W)).toBe(false);
    expect(applyMove(state, legalMoves(state)[0])).toBe(state);
    expect(state.ply).toBe(1);
    expect(() => applyMove(state, { from: -1, to: -1, flag: 0 })).toThrow('illegal move');
    expect(gameStatus(state).over).toBe(false);
    expect(zobrist(state)).toBe(E.zobrist(state));
  });

  it('generates identical keys for identical state and distinguishes turn, ghost and rule mode', () => {
    const state = E.initialState();
    const clone = E.cloneState(state);
    expect(E.zobrist(state)).toBe(E.zobrist(clone));
    const original = E.zobrist(state);
    state.turn = B;
    expect(E.zobrist(state)).not.toBe(original);
    state.turn = W;
    state.gh[at(0, 6, 0)] = 1;
    expect(E.zobrist(state)).not.toBe(original);
    state.gh[at(0, 6, 0)] = 0;
    state.castling.wk = false;
    expect(E.zobrist(state)).not.toBe(original);
    E.setConfig(E.CLASSICAL_MODE);
    expect(E.zobrist(state)).not.toBe(original);
  });

  it('allows a traveler tower and queen to attack down from Cel to Terra', () => {
    for (const type of [R, Q]) {
      const state = position([
        [0, 7, 4, K, W], [0, 0, 0, K, B], [1, 7, 4, type, B]
      ], { turn: W });
      expect(E.isCheck(state, W)).toBe(true);
      expect(E.verticalAttackers(state, at(0, 7, 4), B)).toEqual([at(1, 7, 4)]);
    }
  });

  it('allows tower, queen and king vertical control from Terra to Cel', () => {
    for (const type of [R, Q, K]) {
      const state = position([
        [1, 7, 4, K, W], [1, 0, 0, K, B], [0, 7, 4, type, B]
      ], { turn: W });
      expect(E.isCheck(state, W)).toBe(true);
      expect(E.verticalAttackers(state, at(1, 7, 4), B)).toEqual([at(0, 7, 4)]);
    }
  });

  it('does not let a ghost attack the Earth square below, but keeps its Cel attacks', () => {
    const state = position([
      [0, 7, 4, K, W], [0, 0, 0, K, B], [1, 7, 4, R, B], [1, 7, 0, R, B]
    ], { ghosts: [at(1, 7, 4)], turn: W });
    expect(E.isCheck(state, W)).toBe(false);
    expect(E.attacked(state, at(1, 7, 1), B)).toBe(true);
    expect(E.verticalAttackers(state, at(0, 7, 4), B)).toEqual([]);
  });

  it('uses a king as vertical control and forbids kings stacked on the same coordinate', () => {
    const state = position([
      [0, 7, 4, K, W], [1, 7, 4, K, B]
    ], { turn: W });
    expect(E.attacked(state, at(0, 7, 4), B)).toBe(true);
    expect(E.isCheck(state, W)).toBe(true);
    expect(E.legalMoves(state).every(move =>
      !(move.to === at(1, 7, 4) && Math.abs(state.b[move.from]) === K))).toBe(true);
  });

  it('lets a king move vertically only to an empty square, never capture vertically', () => {
    const state = position([
      [0, 7, 4, K, W], [0, 0, 0, K, B]
    ], { turn: W });
    expect(E.legalMoves(state).some(move =>
      move.from === at(0, 7, 4) && move.to === at(1, 7, 4))).toBe(true);
    const occupied = position([
      [0, 7, 4, K, W], [0, 0, 0, K, B], [1, 7, 4, P, B]
    ], { turn: W });
    expect(E.legalMoves(occupied).some(move =>
      move.from === at(0, 7, 4) && move.to === at(1, 7, 4))).toBe(false);
  });

  it('restricts a vertical-check response to moving the king or capturing the attacker', () => {
    const attacker = at(1, 7, 4);
    const state = position([
      [0, 7, 4, K, W], [0, 0, 0, K, B],
      [1, 7, 4, R, B], [1, 5, 3, N, W], [0, 3, 0, BI, W]
    ], { turn: W });
    expect(E.isCheck(state, W)).toBe(true);
    const moves = E.legalMoves(state);
    expect(moves.some(move => move.from === at(1, 5, 3) && move.to === attacker)).toBe(true);
    expect(moves.every(move => move.from === at(0, 7, 4) || move.to === attacker)).toBe(true);
    expect(moves.some(move => move.from === at(0, 3, 0))).toBe(false);
  });

  it('does not allow interposition against vertical check', () => {
    const state = position([
      [0, 7, 4, K, W], [0, 0, 0, K, B], [1, 7, 4, R, B],
      [0, 6, 2, R, W]
    ], { turn: W });
    const moves = E.legalMoves(state);
    expect(moves.every(move => move.from === at(0, 7, 4) || move.to === at(1, 7, 4))).toBe(true);
  });

  it('does not generate a move that captures the opposing king', () => {
    const state = position([
      [0, 7, 0, R, W], [0, 0, 0, K, B], [0, 7, 4, K, W]
    ], { turn: W });
    expect(E.legalMoves(state).some(move => move.to === at(0, 0, 0))).toBe(false);
  });

  it('does not let a ghost change levels and preserves its flag after a move', () => {
    const origin = at(1, 4, 3);
    const state = position([
      [0, 7, 6, K, W], [0, 0, 6, K, B], [1, 4, 3, N, W]
    ], { ghosts: [origin], turn: W });
    const moves = E.legalMoves(state).filter(move => move.from === origin);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every(move => E.lvlOf(move.to) === 1)).toBe(true);
    E.applyMove(state, moves[0]);
    expect(state.gh[moves[0].to]).toBe(1);
  });

  it('prevents a ghost from participating in internal castling', () => {
    const rook = at(1, 7, 4);
    const state = position([
      [0, 7, 4, K, W], [0, 0, 4, K, B], [1, 7, 4, R, W]
    ], {
      ghosts: [rook], gids: [[rook, E.GID_WK]],
      castling: { ilw_h: true }, turn: W
    });
    expect(E.legalMoves(state).some(move => move.flag === E.F_IL)).toBe(false);
  });

  it('allows the original own tower to castle internally once per player', () => {
    const rook = at(1, 7, 4);
    const state = position([
      [0, 7, 4, K, W], [0, 0, 4, K, B], [1, 7, 4, R, W]
    ], { gids: [[rook, E.GID_WK]], castling: { ilw_h: true }, turn: W });
    const move = E.legalMoves(state).find(candidate => candidate.flag === E.F_IL);
    expect(move).toBeTruthy();
    E.applyMove(state, move);
    expect(state.k[W]).toBe(rook);
    expect(state.castling.ilw_h).toBe(false);
    expect(state.castling.ilw_q).toBe(false);
    expect(state.castling.wk).toBe(false);
  });

  it('creates a live, color-changed ghost after an Earth capture and resets halfmove clock', () => {
    const victim = at(0, 3, 4), ghost = victim ^ 128;
    const state = position([
      [0, 7, 4, R, W], [0, 3, 4, N, B], [0, 0, 4, K, B], [0, 7, 3, K, W]
    ], { turn: W, half: 99 });
    const move = E.legalMoves(state).find(candidate =>
      candidate.from === at(0, 7, 4) && candidate.to === victim);
    E.applyMove(state, move);
    expect(state.b[ghost]).toBe(N * W);
    expect(state.gh[ghost]).toBe(1);
    expect(state.half).toBe(0);
  });

  it('loses an Earth victim when its Cel square is occupied and still resets halfmove clock', () => {
    E.setConfig({ ...E.variantConfig('V2'), capBlock: 'lose' });
    const victim = at(0, 3, 4);
    const state = position([
      [0, 7, 4, R, W], [0, 3, 4, N, B], [1, 3, 4, BI, B],
      [0, 0, 4, K, B], [0, 7, 3, K, W]
    ], { turn: W, half: 99 });
    const move = E.legalMoves(state).find(candidate =>
      candidate.from === at(0, 7, 4) && candidate.to === victim);
    expect(move).toBeTruthy();
    E.applyMove(state, move);
    expect(state.b[victim ^ 128]).toBe(BI * B);
    expect(state.gh[victim ^ 128]).toBe(0);
    expect(state.half).toBe(0);
  });

  it('keeps a ghost pawn on Cel last rank as an immobile pawn, without promotion', () => {
    const last = at(1, 0, 1);
    const state = position([
      [0, 7, 6, K, W], [0, 0, 6, K, B], [1, 1, 1, P, W]
    ], { ghosts: [at(1, 1, 1)], turn: W });
    const step = E.legalMoves(state).find(move => move.from === at(1, 1, 1) && move.to === last);
    expect(step).toBeTruthy();
    expect(step.promo).toBe(0);
    E.applyMove(state, step);
    expect(state.b[last]).toBe(P * W);
    expect(state.gh[last]).toBe(1);
    expect(E.legalMoves(state).some(move => move.from === last)).toBe(false);
  });

  it('promotes a traveler descending from Cel onto the final Earth rank', () => {
    const origin = at(1, 0, 1), target = at(0, 0, 1);
    const state = position([
      [0, 7, 6, K, W], [0, 0, 6, K, B], [1, 0, 1, P, W]
    ], { turn: W });
    const moves = E.legalMoves(state).filter(move => move.from === origin && move.to === target);
    expect(moves.map(move => move.promo).sort()).toEqual([E.QUEEN, E.ROOK, E.BISHOP, E.KNIGHT].sort());
    const queen = moves.find(move => move.promo === Q);
    E.applyMove(state, queen);
    expect(state.b[target]).toBe(Q * W);
    expect(state.gh[target]).toBe(0);
  });

  it('treats a living ghost rook as material, and does not call king-and-rook insufficient', () => {
    const ghostRook = at(1, 4, 4);
    const state = position([
      [0, 7, 0, K, W], [0, 0, 0, K, B], [1, 4, 4, R, W]
    ], { ghosts: [ghostRook] });
    expect(E.insufficientMaterial(state)).toBe(false);
    expect(E.insufficientMaterial(position([
      [0, 7, 0, K, W], [0, 0, 0, K, B], [1, 4, 4, N, W]
    ], { ghosts: [at(1, 4, 4)] }))).toBe(true);
  });

  it('recognizes kings-only material as insufficient', () => {
    expect(E.insufficientMaterial(position([
      [0, 7, 0, K, W], [1, 0, 7, K, B]
    ]))).toBe(true);
  });

  it('reports insufficient material and the 50-move limit through gameStatus', () => {
    const kings = position([[0, 7, 0, K, W], [1, 0, 7, K, B]]);
    expect(E.gameStatus(kings)).toMatchObject({ over: true, result: 'material', winner: 0 });
    const rookPosition = position([
      [0, 7, 0, K, W], [0, 0, 7, K, B], [1, 4, 4, R, W]
    ], { half: 100 });
    expect(E.gameStatus(rookPosition)).toMatchObject({ over: true, result: '50mov', winner: 0 });
  });

  it('uses CLASSICAL_MODE to disable vertical moves, attacks and internal castling', () => {
    E.setConfig(E.CLASSICAL_MODE);
    const state = E.initialState();
    expect(E.legalMoves(state)).toHaveLength(20);
    expect(E.legalMoves(state).every(move => E.lvlOf(move.to) === 0)).toBe(true);
    expect(E.attacked(state, at(1, 7, 4), W)).toBe(false);
    expect(E.legalMoves(state).some(move => move.flag === E.F_IL)).toBe(false);
  });

  it('matches standard initial-position perft at depths one through five', () => {
    E.setConfig(E.CLASSICAL_MODE);
    const expected = [20, 400, 8902, 197281, 4865609];
    expected.forEach((nodes, index) => {
      expect(E.perft(E.cloneState(E.initialState()), index + 1)).toBe(nodes);
    });
  }, 120_000);

  it('matches chess.js legal moves through 10,000 seeded random classical games', () => {
    E.setConfig(E.CLASSICAL_MODE);
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
    for (let game = 0; game < 10_000; game++) {
      const chess = new Chess();
      const state = E.initialState();
      const repetitions = new Map([[chess.fen().split(' ').slice(0, 4).join(' '), 1]]);
      for (let ply = 0; ply < 200; ply++) {
        if (state.half >= 100) break;
        const ourMoves = E.legalMoves(state);
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
        E.applyMove(state, move);
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
    }
    console.info(`CLASSICAL_MODE differential: 10,000 games, ${positionsCompared} positions, ${divergences.length} divergences`);
    expect(divergences).toEqual([]);
  }, 600_000);
});
