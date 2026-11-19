import { configure } from './ecitAdapter.js';
import * as Engine from './engine.js';

console.info('[ecitWire] carregat');

const Rules = Engine.Engine;

const FILES = 'abcdefgh';
const PROMOTIONS = {
  [Rules.KNIGHT]: 'n',
  [Rules.BISHOP]: 'b',
  [Rules.ROOK]: 'r',
  [Rules.QUEEN]: 'q'
};

function toText(move) {
  const square = index =>
    Rules.lvlOf(index) + FILES[Rules.colOf(index)] + (8 - Rules.rowOf(index));
  const separator = move.flag === Rules.F_IL ? '<>' : '>';
  const promotion = PROMOTIONS[move.promo] ? '=' + PROMOTIONS[move.promo] : '';
  return square(move.from) + separator + square(move.to) + promotion;
}

const result = configure({
  initial: () => Rules.initialState(),
  legal: state => Engine.legalMoves(state),
  apply: (state, move) => {
    const next = Rules.cloneState(state);
    Engine.applyMove(next, move);
    return next;
  },
  status: state => {
    const result = Engine.gameStatus(state);
    const reason = result.result || undefined;
    return {
      over: result.over,
      result: result.over ? (result.winner > 0 ? 'w' : result.winner < 0 ? 'b' : 'd') : null,
      check: result.check,
      ...(reason ? { reason } : {})
    };
  },
  side: state => state.turn === Rules.WHITE ? 'w' : 'b',
  score: state => Rules.evalState(state),
  choose: (state, level) => Rules.search(state, {
    maxDepth: Math.max(1, Math.min(5, Math.floor(Number(level) || 1))),
    timeMs: 250
  }).move,
  toText
});

console.info('[ecitWire] resultat configure:', result);
