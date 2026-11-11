import { afterEach, describe, expect, it } from 'vitest';
import { Engine as E } from './engine.js';

const W = E.WHITE;
const B = E.BLACK;
const P = E.PAWN;
const R = E.ROOK;
const Q = E.QUEEN;
const K = E.KING;
const sq = (level, row, col) => E.idxOf(level, row, col);

function makePosition(pieces, turn = W) {
  const state = E.initialState();
  state.b.fill(0);
  state.gh.fill(0);
  state.gid.fill(0);
  state.castling = {
    wk: false, wq: false, bk: false, bq: false,
    ilw_h: false, ilw_q: false, ilb_h: false, ilb_q: false
  };
  state.k = { 1: -1, '-1': -1 };
  state.turn = turn;
  state.ep = -1;
  state.half = 0;
  state.ply = 0;
  state.hist = [];
  for (const [level, row, col, type, color, ghost = false] of pieces) {
    const index = sq(level, row, col);
    state.b[index] = type * color;
    state.gh[index] = Number(ghost);
    if (type === K) state.k[color] = index;
  }
  return state;
}

function capturePosition(fromLevel, toLevel, ghost = false) {
  return makePosition([
    [fromLevel, 4, 4, R, W, ghost],
    [toLevel, 4, 4, P, B],
    [0, 7, 0, K, W],
    [0, 0, 7, K, B]
  ]);
}

afterEach(() => E.setConfig(E.variantConfig('V2')));

describe('vertical capture rules', () => {
  it('lets a traveler rook on Cel capture a Terra pawn and convert it to a ghost', () => {
    E.setConfig(E.variantConfig('V2'));
    const state = capturePosition(1, 0);
    const from = sq(1, 4, 4);
    const to = sq(0, 4, 4);
    const move = E.genMoves(state).find(candidate =>
      candidate.from === from && candidate.to === to && candidate.flag === E.F_VCAP);

    expect(move).toBeTruthy();
    E.make(state, move);
    expect(state.b[to]).toBe(R * W);
    expect(state.b[from]).toBe(P * W);
    expect(state.gh[from]).toBe(1);
  });

  it('does not let a ghost rook on Cel capture down to Terra', () => {
    E.setConfig(E.variantConfig('V2'));
    const state = capturePosition(1, 0, true);
    const from = sq(1, 4, 4);
    const to = sq(0, 4, 4);

    expect(E.genMoves(state).some(move =>
      move.from === from && move.to === to && move.flag === E.F_VCAP)).toBe(false);
  });

  it('lets a Terra rook capture a Cel pawn and removes the victim permanently', () => {
    E.setConfig(E.variantConfig('V2'));
    const state = capturePosition(0, 1);
    const from = sq(0, 4, 4);
    const to = sq(1, 4, 4);
    const move = E.genMoves(state).find(candidate =>
      candidate.from === from && candidate.to === to && candidate.flag === E.F_VCAP);

    expect(move).toBeTruthy();
    E.make(state, move);
    expect(state.b[to]).toBe(R * W);
    expect(state.b[from]).toBe(0);
    expect(state.gh[to]).toBe(0);
    expect(state.b.filter(piece => piece === P * B)).toHaveLength(0);
  });

  it.each([
    ['Cel to Terra', 1, 0],
    ['Terra to Cel', 0, 1]
  ])('restores state exactly after make/unmake for vertical capture %s', (_name, fromLevel, toLevel) => {
    E.setConfig(E.variantConfig('V2'));
    const state = capturePosition(fromLevel, toLevel);
    const before = E.cloneState(state);
    const move = E.genMoves(state).find(candidate =>
      candidate.from === sq(fromLevel, 4, 4) &&
      candidate.to === sq(toLevel, 4, 4) &&
      candidate.flag === E.F_VCAP);

    expect(move).toBeTruthy();
    E.make(state, move);
    E.unmake(state);
    expect(E.stateEqual(state, before)).toBe(true);
  });

  it('allows only king moves or capturing the attacker in vertical check', () => {
    E.setConfig(E.variantConfig('V2'));
    const king = sq(0, 4, 4);
    const attacker = sq(1, 4, 4);
    const state = makePosition([
      [0, 4, 4, K, W],
      [0, 0, 0, K, B],
      [1, 4, 4, R, B],
      [1, 4, 7, Q, W],
      [0, 7, 1, R, W]
    ]);

    expect(E.inCheck(state, W)).toBe(true);
    const moves = E.genMoves(state);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every(move => move.from === king || move.to === attacker)).toBe(true);
    expect(moves.some(move => move.from === sq(1, 4, 7) && move.to === attacker)).toBe(true);
    expect(moves.some(move => move.from === sq(0, 7, 1))).toBe(false);
  });
});

describe('classical chess perft', () => {
  it('matches standard initial-position values for depths one through four', () => {
    E.setConfig(E.CLASSICAL_MODE);
    const standard = [20, 400, 8902, 197281];

    for (let depth = 1; depth <= standard.length; depth++) {
      expect(E.perft(E.cloneState(E.initialState()), depth)).toBe(standard[depth - 1]);
    }
  }, 30_000);
});
