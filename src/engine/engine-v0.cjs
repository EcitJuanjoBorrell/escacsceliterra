/* ============================================================
   MOTOR D'ESCACS DE DOS NIVELLS (N0 base + N1 superior)
   - Codis de peça: signe = color (1 blanc, -1 negre), valor = tipus
     1=peó, 2=cavall, 3=alfil, 4=torre, 5=dama, 6=rei
   - Taulell: Array(256). Índex = nivell*128 + fila*16 + columna
     fila 0 = fila 8 (partida de les negres), fila 7 = fila 1
   - Moviment vertical: mateixa fila+columna, l'altre nivell, destí buit
   - Atac vertical: torre, dama i rei ataquen la casella corresponent
     de l'altre nivell (mateixa fila+columna)
   ============================================================ */
'use strict';

const WHITE = 1, BLACK = -1;
const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
const MATE = 100000;
const TIMEOUT = { timeout: true };

// Flags de moviment
const F_NORM = 0, F_DBL = 1, F_EP = 2, F_CK = 3, F_CQ = 4, F_VERT = 5;

// Offsets dins d'un nivell (graella 16x8)
const KNIGHT_OFFS = [33, 31, 18, 14, -33, -31, -18, -14];
const KING_OFFS = [1, -1, 16, -16, 15, 17, -15, -17];
const ROOK_DIRS = [1, -1, 16, -16];
const BISHOP_DIRS = [15, 17, -15, -17];

// Caselles clau de l'enroc (nivell 0)
const SQ_A1 = 112, SQ_E1 = 116, SQ_H1 = 119;
const SQ_A8 = 0, SQ_E8 = 4, SQ_H8 = 7;

function idxOf(lvl, row, col) { return lvl * 128 + row * 16 + col; }
function rowOf(i) { return (i >> 4) & 7; }
function colOf(i) { return i & 15; }
function lvlOf(i) { return i >> 7; }
function otherLevel(i) { return i ^ 128; }
// dins del mateix nivell i dins del tauler?
// (el truc 0x88 s'aplica als 7 bits baixos: el bit 7 és el nivell)
function inLvl(i, lvl) {
  return i >= 0 && i < 256 && (i >> 7) === lvl && ((i & 127) & 0x88) === 0;
}

const FILE_CHARS = 'abcdefgh';
function squareName(i) { return FILE_CHARS[colOf(i)] + (8 - rowOf(i)) + (lvlOf(i) === 1 ? '\u00b9' : ''); }
const PIECE_LETTER = { 1: 'P', 2: 'C', 3: 'A', 4: 'T', 5: 'D', 6: 'R' };
const PIECE_VALUE = { 1: 100, 2: 300, 3: 310, 4: 500, 5: 900, 6: 0 };

// ---------------- Estat ----------------
function initialState() {
  const b = new Array(256).fill(0);
  const back = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];
  for (let c = 0; c < 8; c++) {
    b[idxOf(0, 0, c)] = -back[c];
    b[idxOf(0, 1, c)] = -PAWN;
    b[idxOf(0, 6, c)] = PAWN;
    b[idxOf(0, 7, c)] = back[c];
  }
  return {
    b, turn: WHITE,
    castling: { wk: true, wq: true, bk: true, bq: true },
    ep: -1, half: 0, ply: 0,
    k: { 1: SQ_E1, '-1': SQ_E8 },
    hist: []
  };
}

function cloneState(st) {
  return {
    b: st.b.slice(), turn: st.turn,
    castling: { wk: st.castling.wk, wq: st.castling.wq, bk: st.castling.bk, bq: st.castling.bq },
    ep: st.ep, half: st.half, ply: st.ply,
    k: { 1: st.k[1], '-1': st.k[-1] },
    hist: []
  };
}

// ---------------- Atacs ----------------
// La casella `sq` (qualsevol nivell) està atacada pel color `by`?
// Dins del mateix nivell: regles estàndard (només bloquegen peces del mateix nivell).
// Verticalment: torre/dama/rei enemics a la casella corresponent de l'altre nivell.
function attacked(st, sq, by) {
  const b = st.b, lvl = sq >> 7;
  const other = sq ^ 128;

  // atac vertical (torre, dama, rei)
  const ov = b[other];
  if (ov === ROOK * by || ov === QUEEN * by || ov === KING * by) return true;

  // cavalls (mateix nivell)
  for (let i = 0; i < 8; i++) {
    const t = sq + KNIGHT_OFFS[i];
    if (inLvl(t, lvl) && b[t] === KNIGHT * by) return true;
  }
  // rei adjacent (mateix nivell)
  for (let i = 0; i < 8; i++) {
    const t = sq + KING_OFFS[i];
    if (inLvl(t, lvl) && b[t] === KING * by) return true;
  }
  // peons: un peó blanc de sota ataca amunt
  const d = by === WHITE ? 1 : -1;
  let t = sq + 15 * d;
  if (inLvl(t, lvl) && b[t] === PAWN * by) return true;
  t = sq + 17 * d;
  if (inLvl(t, lvl) && b[t] === PAWN * by) return true;
  // torres i dames (línies)
  for (let i = 0; i < 4; i++) {
    const dir = ROOK_DIRS[i];
    t = sq + dir;
    while (inLvl(t, lvl)) {
      const p = b[t];
      if (p !== 0) { if (p === ROOK * by || p === QUEEN * by) return true; break; }
      t += dir;
    }
  }
  // alfils i dames (diagonals)
  for (let i = 0; i < 4; i++) {
    const dir = BISHOP_DIRS[i];
    t = sq + dir;
    while (inLvl(t, lvl)) {
      const p = b[t];
      if (p !== 0) { if (p === BISHOP * by || p === QUEEN * by) return true; break; }
      t += dir;
    }
  }
  return false;
}

function inCheck(st, color) {
  return attacked(st, st.k[color], -color);
}

// ---------------- Generació de moviments ----------------
function pushPawnMoves(st, from, piece, out) {
  const b = st.b, lvl = from >> 7, s = piece > 0 ? WHITE : BLACK;
  const dir = s === WHITE ? -16 : 16;
  const homeRow = s === WHITE ? 6 : 1;
  const promoRow = s === WHITE ? 0 : 7;
  const promos = [QUEEN, ROOK, BISHOP, KNIGHT];

  // avenç d'una casella
  const f1 = from + dir;
  if (inLvl(f1, lvl) && b[f1] === 0) {
    if (rowOf(f1) === promoRow) {
      for (const pr of promos) out.push({ from, to: f1, promo: pr, flag: F_NORM });
    } else {
      out.push({ from, to: f1, promo: 0, flag: F_NORM });
      // doble avenç: només des de la fila inicial i només al nivell base
      if (lvl === 0 && rowOf(from) === homeRow) {
        const f2 = from + 2 * dir;
        if (b[f2] === 0) out.push({ from, to: f2, promo: 0, flag: F_DBL });
      }
    }
  }
  // captures diagonals
  for (const dc of [-1, 1]) {
    const t = from + dir + dc;
    if (!inLvl(t, lvl)) continue;
    const tp = b[t];
    if (tp !== 0 && (tp > 0 ? 1 : -1) !== s) {
      if (rowOf(t) === promoRow) {
        for (const pr of promos) out.push({ from, to: t, promo: pr, flag: F_NORM });
      } else out.push({ from, to: t, promo: 0, flag: F_NORM });
    } else if (tp === 0 && t === st.ep) {
      out.push({ from, to: t, promo: 0, flag: F_EP });
    }
  }
}

function genPseudo(st) {
  const b = st.b, s = st.turn, out = [];
  for (let lvl = 0; lvl < 2; lvl++) {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const from = idxOf(lvl, row, col);
        const piece = b[from];
        if (piece === 0 || (piece > 0 ? 1 : -1) !== s) continue;
        const type = Math.abs(piece);

        // 1) moviment vertical (ascens / descens), destí buit, sense captura
        const vert = otherLevel(from);
        if (b[vert] === 0) out.push({ from, to: vert, promo: 0, flag: F_VERT });

        // 2) moviments dins del nivell
        if (type === PAWN) {
          pushPawnMoves(st, from, piece, out);
        } else if (type === KNIGHT || type === KING) {
          const offs = type === KNIGHT ? KNIGHT_OFFS : KING_OFFS;
          for (let i = 0; i < 8; i++) {
            const t = from + offs[i];
            if (!inLvl(t, lvl)) continue;
            const tp = b[t];
            if (tp === 0 || (tp > 0 ? 1 : -1) !== s) out.push({ from, to: t, promo: 0, flag: F_NORM });
          }
          if (type === KING) genCastles(st, from, piece, out);
        } else {
          const dirs = type === ROOK ? ROOK_DIRS : type === BISHOP ? BISHOP_DIRS : KING_OFFS;
          for (let i = 0; i < dirs.length; i++) {
            const dir = dirs[i];
            let t = from + dir;
            while (inLvl(t, lvl)) {
              const tp = b[t];
              if (tp === 0) out.push({ from, to: t, promo: 0, flag: F_NORM });
              else { if ((tp > 0 ? 1 : -1) !== s) out.push({ from, to: t, promo: 0, flag: F_NORM }); break; }
              t += dir;
            }
          }
        }
      }
    }
  }
  return out;
}

function genCastles(st, from, piece, out) {
  const s = piece > 0 ? WHITE : BLACK;
  if (from !== (s === WHITE ? SQ_E1 : SQ_E8)) return;
  const enemy = -s;
  const home = s === WHITE ? 112 : 0; // base de les caselles de la fila 1/8
  if (st.castling[s === WHITE ? 'wk' : 'bk']) {
    const f1 = home + 5, g1 = home + 6, h1 = home + 7;
    if (st.b[f1] === 0 && st.b[g1] === 0 && st.b[h1] === ROOK * s &&
        !attacked(st, from, enemy) && !attacked(st, f1, enemy) && !attacked(st, g1, enemy)) {
      out.push({ from, to: g1, promo: 0, flag: F_CK });
    }
  }
  if (st.castling[s === WHITE ? 'wq' : 'bq']) {
    const a1 = home, d1 = home + 3, c1 = home + 2, b1 = home + 1;
    if (st.b[d1] === 0 && st.b[c1] === 0 && st.b[b1] === 0 && st.b[a1] === ROOK * s &&
        !attacked(st, from, enemy) && !attacked(st, d1, enemy) && !attacked(st, c1, enemy)) {
      out.push({ from, to: c1, promo: 0, flag: F_CQ });
    }
  }
}

function genMoves(st, legal = true) {
  const pseudo = genPseudo(st);
  if (!legal) return pseudo;
  const out = [];
  const mover = st.turn;
  for (const m of pseudo) {
    make(st, m);
    if (!inCheck(st, mover)) out.push(m);
    unmake(st);
  }
  return out;
}

// ---------------- Fer / desfer moviment ----------------
function make(st, m) {
  const b = st.b;
  const piece = b[m.from];
  const s = piece > 0 ? WHITE : BLACK;
  const u = {
    m, piece, cap: 0, capSq: -1,
    ep: st.ep, half: st.half,
    cast: { wk: st.castling.wk, wq: st.castling.wq, bk: st.castling.bk, bq: st.castling.bq }
  };
  st.hist.push(u);
  st.ep = -1;

  if (m.flag === F_VERT) {
    b[m.to] = piece; b[m.from] = 0;
    st.half++;
  } else if (m.flag === F_CK || m.flag === F_CQ) {
    const home = s === WHITE ? 112 : 0;
    const rookFrom = m.flag === F_CK ? home + 7 : home;
    const rookTo = m.flag === F_CK ? home + 5 : home + 3;
    b[m.to] = piece; b[m.from] = 0;
    b[rookTo] = b[rookFrom]; b[rookFrom] = 0;
    st.half++;
  } else if (m.flag === F_EP) {
    u.capSq = m.to + (s === WHITE ? 16 : -16);
    u.cap = b[u.capSq]; b[u.capSq] = 0;
    b[m.to] = piece; b[m.from] = 0;
    st.half = 0;
  } else {
    const tp = b[m.to];
    if (tp !== 0) { u.cap = tp; u.capSq = m.to; }
    b[m.to] = m.promo ? m.promo * s : piece;
    b[m.from] = 0;
    st.half = (Math.abs(piece) === PAWN || tp !== 0) ? 0 : st.half + 1;
    if (m.flag === F_DBL) {
      // casella de captura al pas (només nivell base)
      st.ep = (m.from + m.to) / 2;
    }
  }

  // drets d'enroc
  if (Math.abs(piece) === KING) {
    if (s === WHITE) { st.castling.wk = false; st.castling.wq = false; }
    else { st.castling.bk = false; st.castling.bq = false; }
  }
  if (m.from === SQ_A1 || m.to === SQ_A1) st.castling.wq = false;
  if (m.from === SQ_H1 || m.to === SQ_H1) st.castling.wk = false;
  if (m.from === SQ_A8 || m.to === SQ_A8) st.castling.bq = false;
  if (m.from === SQ_H8 || m.to === SQ_H8) st.castling.bk = false;

  if (Math.abs(piece) === KING) st.k[s] = m.to;
  st.turn = -st.turn;
  st.ply++;
}

function unmake(st) {
  const u = st.hist.pop();
  if (!u) return;
  const m = u.m, b = st.b;
  const s = u.piece > 0 ? WHITE : BLACK;
  b[m.from] = u.piece;
  b[m.to] = (u.capSq === m.to) ? u.cap : 0;
  if (m.flag === F_EP) { b[u.capSq] = u.cap; b[m.to] = 0; }
  if (m.flag === F_CK || m.flag === F_CQ) {
    const home = s === WHITE ? 112 : 0;
    const rookFrom = m.flag === F_CK ? home + 7 : home;
    const rookTo = m.flag === F_CK ? home + 5 : home + 3;
    b[rookFrom] = b[rookTo]; b[rookTo] = 0;
  }
  if (Math.abs(u.piece) === KING) st.k[s] = m.from;
  st.castling = u.cast;
  st.ep = u.ep; st.half = u.half;
  st.turn = -st.turn;
  st.ply--;
}

// ---------------- Avaluació ----------------
// Taules (perspectiva blanc, fila 0 = fila 8): taula[fila*8+col]
const PST_PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0,
  60, 60, 60, 60, 60, 60, 60, 60,
  18, 20, 28, 34, 34, 28, 20, 18,
  8, 10, 16, 26, 26, 16, 10, 8,
  4, 6, 10, 20, 20, 10, 6, 4,
  2, 2, 4, 6, 6, 4, 2, 2,
  2, 2, 2, -6, -6, 2, 2, 2,
  0, 0, 0, 0, 0, 0, 0, 0
];
const PST_KNIGHT = [
  -50, -30, -20, -20, -20, -20, -30, -50,
  -30, -10, 0, 4, 4, 0, -10, -30,
  -20, 4, 12, 16, 16, 12, 4, -20,
  -20, 2, 16, 22, 22, 16, 2, -20,
  -20, 4, 16, 22, 22, 16, 4, -20,
  -20, 2, 12, 16, 16, 12, 2, -20,
  -30, -10, 0, 2, 2, 0, -10, -30,
  -50, -30, -20, -20, -20, -20, -30, -50
];
const PST_BISHOP = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 4, 0, 0, 0, 0, 4, -10,
  -10, 8, 8, 8, 8, 8, 8, -10,
  -10, 0, 8, 10, 10, 8, 0, -10,
  -10, 4, 4, 10, 10, 4, 4, -10,
  -10, 0, 8, 8, 8, 8, 0, -10,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -20, -10, -10, -10, -10, -10, -10, -20
];
const PST_ROOK = [
  0, 0, 0, 0, 0, 0, 0, 0,
  6, 12, 12, 12, 12, 12, 12, 6,
  -4, 0, 0, 0, 0, 0, 0, -4,
  -4, 0, 0, 0, 0, 0, 0, -4,
  -4, 0, 0, 0, 0, 0, 0, -4,
  -4, 0, 0, 0, 0, 0, 0, -4,
  -4, 0, 0, 0, 0, 0, 0, -4,
  0, 0, 0, 6, 6, 0, 0, 0
];
const PST_QUEEN = [
  -20, -10, -10, -4, -4, -10, -10, -20,
  -10, 0, 2, 0, 0, 2, 0, -10,
  -10, 2, 4, 4, 4, 4, 2, -10,
  -4, 0, 4, 4, 4, 4, 0, -4,
  -4, 0, 4, 4, 4, 4, 0, -4,
  -10, 2, 4, 4, 4, 4, 2, -10,
  -10, 0, 2, 0, 0, 2, 0, -10,
  -20, -10, -10, -4, -4, -10, -10, -20
];
const PST_KING = [
  -40, -50, -50, -60, -60, -50, -50, -40,
  -40, -50, -50, -60, -60, -50, -50, -40,
  -40, -50, -50, -60, -60, -50, -50, -40,
  -40, -50, -50, -60, -60, -50, -50, -40,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  14, 14, -8, -14, -14, -8, 14, 14,
  20, 30, 10, 0, 0, 10, 30, 20
];
// Bonus per controlar el nivell superior (peça a N1)
const N1_BONUS = { 1: 25, 2: 30, 3: 30, 4: 40, 5: 40, 6: 0 };

function evalState(st) {
  const b = st.b;
  let score = 0;
  for (let lvl = 0; lvl < 2; lvl++) {
    const base = lvl * 128;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const p = b[base + row * 16 + col];
        if (p === 0) continue;
        const type = p > 0 ? p : -p;
        const s = p > 0 ? 1 : -1;
        const pstRow = s === WHITE ? row : 7 - row;
        const pstIdx = pstRow * 8 + col;
        let v = PIECE_VALUE[type];
        switch (type) {
          case PAWN: v += PST_PAWN[pstIdx]; break;
          case KNIGHT: v += PST_KNIGHT[pstIdx]; break;
          case BISHOP: v += PST_BISHOP[pstIdx]; break;
          case ROOK: v += PST_ROOK[pstIdx]; break;
          case QUEEN: v += PST_QUEEN[pstIdx]; break;
          case KING: v += PST_KING[pstIdx]; break;
        }
        if (lvl === 1) v += N1_BONUS[type];
        score += s * v;
      }
    }
  }
  return score;
}

// ---------------- Fi de partida ----------------
// Amb aquestes regles, rei + una única peça (o rei sol) no pot fer mai mat:
// el rei fuig sempre cap a l'altre nivell (cap peça menys torre/dama/rei
// no ataca verticalment, i rei+torre/dama no cobreixen totes les fugides).
function sideCanNeverMate(st, color) {
  let pawns = 0, pieces = 0, lastType = 0;
  const b = st.b;
  for (let i = 0; i < 256; i++) {
    const p = b[i];
    if (p === 0 || (p > 0 ? 1 : -1) !== color) continue;
    const t = Math.abs(p);
    if (t === KING) continue;
    pawns += (t === PAWN) ? 1 : 0;
    pieces++; lastType = t;
  }
  if (pawns > 0) return false;
  if (pieces === 0) return true;
  if (pieces === 1 && (lastType === KNIGHT || lastType === BISHOP)) return true;
  if (pieces === 1 && (lastType === ROOK || lastType === QUEEN)) {
    // només és inútil si l'adversari no té cap altra peça que pugui bloquejar la fugida
    let oppPieces = 0;
    for (let i = 0; i < 256; i++) {
      const p = b[i];
      if (p !== 0 && (p > 0 ? 1 : -1) === -color && Math.abs(p) !== KING) oppPieces++;
    }
    if (oppPieces === 0) return true;
  }
  return false;
}

function insufficientMaterial(st) {
  return sideCanNeverMate(st, WHITE) && sideCanNeverMate(st, BLACK);
}

function gameStatus(st) {
  const moves = genMoves(st, true);
  const check = inCheck(st, st.turn);
  if (moves.length === 0) {
    return { over: true, moves, check, result: check ? 'mate' : 'ofegat', winner: check ? -st.turn : 0 };
  }
  if (st.half >= 100) return { over: true, moves, check, result: '50mov', winner: 0 };
  if (insufficientMaterial(st)) return { over: true, moves, check, result: 'material', winner: 0 };
  return { over: false, moves, check, result: null, winner: 0 };
}

// ---------------- Notació ----------------
function moveText(st, m) {
  const piece = st.b[m.from];
  const letter = PIECE_LETTER[Math.abs(piece)];
  if (m.flag === F_CK) return 'O-O';
  if (m.flag === F_CQ) return 'O-O-O';
  if (m.flag === F_VERT) {
    return letter + squareName(m.from) + (lvlOf(m.to) === 1 ? '\u2191N1' : '\u2193N0');
  }
  const isEp = m.flag === F_EP;
  const cap = isEp || st.b[m.to] !== 0;
  let txt = letter + squareName(m.from) + (cap ? '\u00d7' : '\u2192') + squareName(m.to);
  if (m.promo) txt += '=' + PIECE_LETTER[m.promo];
  if (isEp) txt += ' ep';
  return txt;
}

// ---------------- Cerca (minimax amb poda alfa-beta) ----------------
function orderMoves(st, moves, pv) {
  const b = st.b;
  for (const m of moves) {
    let sc = 0;
    const victim = m.flag === F_EP ? PAWN : Math.abs(b[m.to]);
    if (victim !== 0) sc = 10000 + PIECE_VALUE[victim] * 10 - Math.abs(b[m.from]);
    if (m.promo === QUEEN) sc += 9000;
    else if (m.promo) sc += PIECE_VALUE[m.promo];
    if (m.flag === F_VERT) sc += 20; // el moviment vertical és estratègicament valuós
    if (pv && m.from === pv.from && m.to === pv.to && m.flag === pv.flag) sc += 1000000;
    m._s = sc;
  }
  moves.sort((a, c) => c._s - a._s);
}

let _nodes = 0, _deadline = 0;

function qsearch(st, alpha, beta, ply) {
  _nodes++;
  if ((_nodes & 2047) === 0 && Date.now() > _deadline) throw TIMEOUT;
  const stand = (st.turn === WHITE ? 1 : -1) * evalState(st);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (ply > 48) return alpha;
  const moves = genPseudo(st);
  const caps = moves.filter(m => m.flag === F_EP || st.b[m.to] !== 0 || m.promo !== 0);
  orderMoves(st, caps, null);
  const mover = st.turn;
  for (const m of caps) {
    make(st, m);
    if (inCheck(st, mover)) { unmake(st); continue; }
    const sc = -qsearch(st, -beta, -alpha, ply + 1);
    unmake(st);
    if (sc >= beta) return beta;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}

function negamax(st, depth, alpha, beta, ply) {
  _nodes++;
  if ((_nodes & 2047) === 0 && Date.now() > _deadline) throw TIMEOUT;
  if (st.half >= 100) return 0;
  if (depth <= 0) return qsearch(st, alpha, beta, ply);
  const moves = genPseudo(st);
  orderMoves(st, moves, null);
  const mover = st.turn;
  let legal = 0;
  for (const m of moves) {
    make(st, m);
    if (inCheck(st, mover)) { unmake(st); continue; }
    legal++;
    const sc = -negamax(st, depth - 1, -beta, -alpha, ply + 1);
    unmake(st);
    if (sc >= beta) return beta;
    if (sc > alpha) alpha = sc;
  }
  if (legal === 0) {
    return inCheck(st, mover) ? -(MATE - ply) : 0;
  }
  return alpha;
}

// opts: { timeMs, maxDepth, blunder }
function search(state, opts) {
  opts = opts || {};
  const st = cloneState(state);
  const timeMs = opts.timeMs || 1000;
  const maxDepth = opts.maxDepth || 4;
  const t0 = Date.now();
  _deadline = t0 + timeMs;
  _nodes = 0;

  const rootMoves = genMoves(st, true);
  const info = { move: null, score: 0, depth: 0, nodes: 0, timeMs: 0, random: false };
  if (rootMoves.length === 0) return info;

  // nivell fàcil: de tant en tant, jugada aleatòria (errors tàctics evidents)
  if (opts.blunder && Math.random() < opts.blunder) {
    info.move = rootMoves[(Math.random() * rootMoves.length) | 0];
    info.random = true;
    info.timeMs = Date.now() - t0;
    return info;
  }

  let bestMove = null, bestScore = 0, doneDepth = 0;
  for (let depth = 1; depth <= maxDepth; depth++) {
    orderMoves(st, rootMoves, bestMove);
    let alpha = -Infinity, beta = Infinity;
    let iterBest = null, iterScore = -Infinity;
    try {
      for (const m of rootMoves) {
        make(st, m);
        const sc = -negamax(st, depth - 1, -beta, -alpha, 1);
        unmake(st);
        if (sc > iterScore) { iterScore = sc; iterBest = m; }
        if (sc > alpha) alpha = sc;
      }
    } catch (e) {
      if (e === TIMEOUT) break;
      throw e;
    }
    bestMove = iterBest; bestScore = iterScore; doneDepth = depth;
    if (bestScore > MATE - 1000) break; // mat trobat
    if (Date.now() - t0 > timeMs * 0.45) break; // no arribarà a acabar la següent iteració
  }
  info.move = bestMove || rootMoves[0];
  info.score = bestScore;
  info.depth = doneDepth;
  info.nodes = _nodes;
  info.timeMs = Date.now() - t0;
  return info;
}

// ---------------- Perft (per a tests) ----------------
function perft(st, depth) {
  if (depth === 0) return 1;
  let n = 0;
  const moves = genMoves(st, true);
  for (const m of moves) {
    make(st, m);
    n += perft(st, depth - 1);
    unmake(st);
  }
  return n;
}

const Engine = {
  WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
  F_NORM, F_DBL, F_EP, F_CK, F_CQ, F_VERT,
  PIECE_LETTER, PIECE_VALUE,
  idxOf, rowOf, colOf, lvlOf, otherLevel, squareName,
  initialState, cloneState,
  attacked, inCheck,
  genPseudo, genMoves,
  make, unmake,
  evalState, gameStatus, insufficientMaterial,
  moveText, search, perft
};

if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
