import { describe, expect, it } from 'vitest';
import { Engine } from './engine.js';
import './ecitWire.js';
import * as Adapter from './ecitAdapter.js';

describe('Escacs Cel i Terra adapter wiring', () => {
  it('connects the engine with coordinate notation and immutable apply', () => {
    const api = Adapter.get();
    const state = api.initial();
    const move = api.legal(state).find(candidate =>
      candidate.from === Engine.idxOf(0, 6, 4) &&
      candidate.to === Engine.idxOf(0, 5, 4));

    expect(Adapter.status().ok).toBe(true);
    expect(api.toText(move)).toBe('0e2>0e3');
    expect(api.side(state)).toBe('w');

    const next = api.apply(state, move);
    expect(next).not.toBe(state);
    expect(state.turn).toBe(Engine.WHITE);
    expect(next.turn).toBe(Engine.BLACK);
    expect(api.status(next).over).toBe(false);
  });

  it('formats vertical moves, promotions, and interlevel castling', () => {
    const api = Adapter.get();
    const idx = Engine.idxOf;

    expect(api.toText({
      from: idx(0, 6, 4), to: idx(1, 6, 4), promo: 0, flag: Engine.F_VERT
    })).toBe('0e2>1e2');
    expect(api.toText({
      from: idx(0, 1, 4), to: idx(0, 0, 4), promo: Engine.QUEEN, flag: Engine.F_NORM
    })).toBe('0e7>0e8=q');
    expect(api.toText({
      from: idx(0, 7, 4), to: idx(1, 7, 4), promo: 0, flag: Engine.F_IL
    })).toBe('0e1<>1e1');
  });
});
