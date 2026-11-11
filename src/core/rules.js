/* ============================================================
   MOTOR 2 — ESCAC CEL I TERRA amb les REGLES NOVES (experiment)
   Pure rules/search module: no DOM or three.js dependencies.
   State is mutable; legalMoves restores it after make/unmake, while
   applyMove validates and mutates it.
   Derivat de scripts/src/engine.js (mateixa representació):
   - Índex = nivell*128 + fila*16 + columna; fila 0 = fila 8.
   - Nivell 0 = TERRA, nivell 1 = CEL.
   REGLES NOVES (configurables per a les variants):
   - conversion  : la peça capturada a TERRA "ascendeix al cel",
     canvia al bàndol de qui captura (peça bicolor) i no pot mai
     tornar a baixar (gh=1, "fantasma").
   - capBlock    : 'lose'    → la captura a Terra sempre és legal; si
                 la casella del Cel damunt de la víctima està ocupada
                 la peça es perd definitivament (reglament v1.0);
                   'block'   → si la casella del Cel damunt de la
                 víctima està ocupada, la captura no és legal;
                   'displace' → la peça convertida es col·loca a la
                 casella lliure del Cel més propera (anells Chebyshev).
   - heavenDeath : 'remove'  → segona mort: peça capturada al Cel
                 s'elimina definitivament;
                   'convert' → torna a canviar de bàndol dins del Cel
                 (col·locada a la casella lliure més propera).
   - ilCastling  : enroc internivell: rei i torre original pròpia en
     nivells oposats intercanvien les caselles, un cop per torre.
   - promoDescent: el peó que baixa del Cel a l'última fila de Terra
     promociona (arribada a Terra = promoció).
   - promoCel    : (només baseline V0) promoció permesa al Cel.
   ============================================================ */
'use strict';

const WHITE = 1, BLACK = -1;
const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
const MATE = 100000;
const TIMEOUT = { timeout: true };

const F_NORM = 0, F_DBL = 1, F_EP = 2, F_CK = 3, F_CQ = 4, F_VERT = 5, F_IL = 6, F_VCAP = 7;

const KNIGHT_OFFS = [33, 31, 18, 14, -33, -31, -18, -14];
const KING_OFFS = [1, -1, 16, -16, 15, 17, -15, -17];
const ROOK_DIRS = [1, -1, 16, -16];
const BISHOP_DIRS = [15, 17, -15, -17];

const SQ_A1 = 112, SQ_E1 = 116, SQ_H1 = 119;
const SQ_A8 = 0, SQ_E8 = 4, SQ_H8 = 7;

// gids de torres originals per als enrocs internivell
const GID_WQ = 1, GID_WK = 2, GID_BQ = 3, GID_BK = 4;

function idxOf(lvl, row, col) { return lvl * 128 + row * 16 + col; }
function rowOf(i) { return (i >> 4) & 7; }
function colOf(i) { return i & 15; }
function lvlOf(i) { return i >> 7; }
function otherLevel(i) { return i ^ 128; }
function inLvl(i, lvl) {
  return i >= 0 && i < 256 && (i >> 7) === lvl && ((i & 127) & 0x88) === 0;
}

const FILE_CHARS = 'abcdefgh';
function squareName(i) { return FILE_CHARS[colOf(i)] + (8 - rowOf(i)) + (lvlOf(i) === 1 ? '\u00b9' : ''); }
const PIECE_LETTER = { 1: 'P', 2: 'C', 3: 'A', 4: 'T', 5: 'D', 6: 'R' };
const PIECE_VALUE = { 1: 100, 2: 300, 3: 310, 4: 500, 5: 900, 6: 0 };

// ---------------- Configuració de regles ----------------
const CFG = {
  celestial: true,
  conversion: true,
  capBlock: 'lose',
  heavenDeath: 'remove',
  ilCastling: true,
  promoDescent: true,
  promoCel: false
};
const CLASSICAL_MODE = Object.freeze({
  celestial: false,
  conversion: false,
  capBlock: 'block',
  heavenDeath: 'remove',
  ilCastling: false,
  promoDescent: false,
  promoCel: false
});
function setConfig(o) { Object.assign(CFG, o); }
function variantConfig(name) {
  switch (name) {
    case 'V0': return { celestial: true, conversion: false, capBlock: 'block', heavenDeath: 'remove', ilCastling: false, promoDescent: false, promoCel: true };
    case 'V1': return { celestial: true, conversion: true, capBlock: 'block', heavenDeath: 'remove', ilCastling: true, promoDescent: false, promoCel: false };
    case 'V2': return { celestial: true, conversion: true, capBlock: 'block', heavenDeath: 'remove', ilCastling: true, promoDescent: true, promoCel: false };
    case 'V3': return { celestial: true, conversion: true, capBlock: 'displace', heavenDeath: 'remove', ilCastling: true, promoDescent: true, promoCel: false };
    case 'V4': return { celestial: true, conversion: true, capBlock: 'block', heavenDeath: 'convert', ilCastling: true, promoDescent: true, promoCel: false };
    case 'V5': return { celestial: true, conversion: true, capBlock: 'block', heavenDeath: 'remove', ilCastling: false, promoDescent: true, promoCel: false };
    default: throw new Error('variant desconeguda: ' + name);
  }
}

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
  const gh = new Uint8Array(256);
  const gid = new Uint8Array(256);
  gid[idxOf(0, 7, 0)] = GID_WQ; // torre blanca a1 (costat dama)
  gid[idxOf(0, 7, 7)] = GID_WK; // torre blanca h1 (costat rei)
  gid[idxOf(0, 0, 0)] = GID_BQ;
  gid[idxOf(0, 0, 7)] = GID_BK;
  return {
    b, gh, gid, turn: WHITE,
    castling: {
      wk: true, wq: true, bk: true, bq: true,
      ilw_h: true, ilw_q: true, ilb_h: true, ilb_q: true
    },
    ep: -1, half: 0, ply: 0,
    k: { 1: SQ_E1, '-1': SQ_E8 },
    hist: []
  };
}

function cloneState(st) {
  return {
    b: st.b.slice(),
    gh: st.gh.slice(),
    gid: st.gid.slice(),
    turn: st.turn,
    castling: {
      wk: st.castling.wk, wq: st.castling.wq, bk: st.castling.bk, bq: st.castling.bq,
      ilw_h: st.castling.ilw_h, ilw_q: st.castling.ilw_q,
      ilb_h: st.castling.ilb_h, ilb_q: st.castling.ilb_q
    },
    ep: st.ep, half: st.half, ply: st.ply,
    k: { 1: st.k[1], '-1': st.k[-1] },
    hist: []
  };
}

function stateEqual(a, c) {
  for (let i = 0; i < 256; i++) {
    if (a.b[i] !== c.b[i] || a.gh[i] !== c.gh[i] || a.gid[i] !== c.gid[i]) return false;
  }
  const ca = a.castling, cc = c.castling;
  for (const kk of ['wk', 'wq', 'bk', 'bq', 'ilw_h', 'ilw_q', 'ilb_h', 'ilb_q']) {
    if (ca[kk] !== cc[kk]) return false;
  }
  return a.turn === c.turn && a.ep === c.ep && a.half === c.half && a.ply === c.ply &&
    a.k[1] === c.k[1] && a.k[-1] === c.k[-1];
}

// ---------------- Atacs ----------------
function attacked(st, sq, by) {
  const b = st.b, lvl = sq >> 7;
  const other = sq ^ 128;
  const ov = b[other];
  // Només els fantasmes del Cel deixen de controlar la casella de Terra inferior.
  if (CFG.celestial && !(lvl === 0 && st.gh[other]) &&
      (ov === ROOK * by || ov === QUEEN * by || ov === KING * by)) return true;
  for (let i = 0; i < 8; i++) {
    const t = sq + KNIGHT_OFFS[i];
    if (inLvl(t, lvl) && b[t] === KNIGHT * by) return true;
  }
  for (let i = 0; i < 8; i++) {
    const t = sq + KING_OFFS[i];
    if (inLvl(t, lvl) && b[t] === KING * by) return true;
  }
  const d = by === WHITE ? 1 : -1;
  let t = sq + 15 * d;
  if (inLvl(t, lvl) && b[t] === PAWN * by) return true;
  t = sq + 17 * d;
  if (inLvl(t, lvl) && b[t] === PAWN * by) return true;
  for (let i = 0; i < 4; i++) {
    const dir = ROOK_DIRS[i];
    t = sq + dir;
    while (inLvl(t, lvl)) {
      const p = b[t];
      if (p !== 0) { if (p === ROOK * by || p === QUEEN * by) return true; break; }
      t += dir;
    }
  }
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

function inCheck(st, color) { return attacked(st, st.k[color], -color); }

// ---------------- Conversió celestial ----------------
// Casella del Cel per col·locar la peça convertida. En 'lose' (v1.0) i
// 'block' només val la casella exacta damunt de la víctima; en 'displace'
// es busquen anells Chebyshev creixents. Una víctima capturada JA al Cel
// (heavenDeath 'convert', variant V4) no té «casella exacta» lliure — hi
// acaba d'arribar el captor —, així que sempre es busca la més propera.
function freeCelSq(st, victimSq) {
  const victimOnEarth = (victimSq >> 7) === 0;
  const start = victimOnEarth ? victimSq + 128 : victimSq;
  if (victimOnEarth && st.b[start] === 0) return start;
  if (victimOnEarth && CFG.capBlock !== 'displace') return -1;
  const r0 = rowOf(start), c0 = colOf(start);
  for (let d = 1; d <= 7; d++) {
    for (let dr = -d; dr <= d; dr++) {
      for (let dc = -d; dc <= d; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== d) continue;
        const r = r0 + dr, c = c0 + dc;
        if (r < 0 || r > 7 || c < 0 || c > 7) continue;
        const sq = 128 + r * 16 + c;
        if (st.b[sq] === 0) return sq;
      }
    }
  }
  return -1;
}

function clearILRight(st, g) {
  if (g === GID_WQ) st.castling.ilw_q = false;
  else if (g === GID_WK) st.castling.ilw_h = false;
  else if (g === GID_BQ) st.castling.ilb_q = false;
  else if (g === GID_BK) st.castling.ilb_h = false;
}

// La víctima ascendeix i canvia al bàndol `s` (qui captura). ghost = no pot baixar.
function placeConverted(st, u, s) {
  const t = Math.abs(u.cap);
  const target = freeCelSq(st, u.capSq);
  if (target >= 0) {
    st.b[target] = t * s;
    st.gh[target] = 1;
    st.gid[target] = 0;
    u.conv = target;
  }
  if (u.capGid) clearILRight(st, u.capGid); // la torre original transformada ja no farà enroc
}

// ---------------- Generació de moviments ----------------
// capsOnly (per a la quiescència): només captures, captura al pas i promocions
function pushPawnMoves(st, from, piece, out, capsOnly) {
  const b = st.b, lvl = from >> 7, s = piece > 0 ? WHITE : BLACK;
  const dir = s === WHITE ? -16 : 16;
  const homeRow = s === WHITE ? 6 : 1;
  const promoRow = s === WHITE ? 0 : 7;
  const promos = [QUEEN, ROOK, BISHOP, KNIGHT];
  const canPromo = (lvl === 0) || CFG.promoCel;

  const f1 = from + dir;
  if (inLvl(f1, lvl) && b[f1] === 0) {
    if (rowOf(f1) === promoRow && canPromo) {
      for (const pr of promos) out.push({ from, to: f1, promo: pr, flag: F_NORM });
    } else if (capsOnly) {
      // avenços tranquils: no entren a la quiescència
    } else if (rowOf(f1) === promoRow) {
      // arriba a l'última fila del Cel sense promoció (peó zombi)
      out.push({ from, to: f1, promo: 0, flag: F_NORM });
    } else {
      out.push({ from, to: f1, promo: 0, flag: F_NORM });
      if (lvl === 0 && rowOf(from) === homeRow) {
        const f2 = from + 2 * dir;
        if (b[f2] === 0) out.push({ from, to: f2, promo: 0, flag: F_DBL });
      }
    }
  }
  for (const dc of [-1, 1]) {
    const t = from + dir + dc;
    if (!inLvl(t, lvl)) continue;
    const tp = b[t];
    if (tp !== 0 && (tp > 0 ? 1 : -1) !== s && Math.abs(tp) !== KING) {
      if (rowOf(t) === promoRow && canPromo) {
        for (const pr of promos) out.push({ from, to: t, promo: pr, flag: F_NORM });
      } else out.push({ from, to: t, promo: 0, flag: F_NORM });
    } else if (tp === 0 && t === st.ep) {
      out.push({ from, to: t, promo: 0, flag: F_EP });
    }
  }
}

function genCastles(st, from, piece, out) {
  const s = piece > 0 ? WHITE : BLACK;
  if (from !== (s === WHITE ? SQ_E1 : SQ_E8)) return;
  const enemy = -s;
  const home = s === WHITE ? 112 : 0;
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

// Enroc internivell: el rei i una torre ORIGINAL pròpia APILATS (mateixa
// coordenada, nivell oposat) intercanvien les caselles. Un cop per torre.
// El rei no ha d'estar en escac i la seva destinació no ha d'estar atacada.
function genILCastles(st, from, piece, out) {
  if (!CFG.ilCastling) return;
  const s = piece > 0 ? WHITE : BLACK;
  const enemy = -s;
  if (attacked(st, from, enemy)) return; // rei en escac: sense enroc
  // reglament: la torre ha d'estar apilada amb el rei (mateixa coordenada, altre nivell)
  const sq = from ^ 128;
  if (st.b[sq] !== ROOK * s) return;
  if (st.gh[sq] !== 0) return;
  const g = st.gid[sq];
  if (g === GID_WQ && !st.castling.ilw_q) return;
  if (g === GID_WK && !st.castling.ilw_h) return;
  if (g === GID_BQ && !st.castling.ilb_q) return;
  if (g === GID_BK && !st.castling.ilb_h) return;
  if (g === 0) return; // torre de promoció: no és original
  if (attacked(st, sq, enemy)) return; // el rei no pot acabar en casella atacada
  out.push({ from, to: sq, promo: 0, flag: F_IL });
}

// capsOnly = true: només el que interessa a la quiescència (captures, captura
// al pas i promocions; sense moviments tranquils, enrocs ni passos verticals
// sense promoció). És exactament el filtre que abans feia qsearch després de
// generar-ho tot, però sense construir els moviments que després es descartaven.
function genPseudo(st, capsOnly = false) {
  const b = st.b, gh = st.gh, s = st.turn, out = [];
  for (let lvl = 0; lvl < 2; lvl++) {
    if (!CFG.celestial && lvl === 1) continue;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const from = idxOf(lvl, row, col);
        const piece = b[from];
        if (piece === 0 || (piece > 0 ? 1 : -1) !== s) continue;
        const type = Math.abs(piece);
        const isGhost = gh[from] === 1;

        if (CFG.celestial && CFG.conversion && !isGhost && (type === ROOK || type === QUEEN)) {
          const target = from ^ 128;
          if (b[target] !== 0 && (b[target] > 0 ? 1 : -1) !== s &&
              Math.abs(b[target]) !== KING) {
            out.push({ from, to: target, promo: 0, flag: F_VCAP });
          }
        }

        // 1) moviment vertical (els fantasmes no poden baixar mai)
        if (CFG.celestial && !isGhost) {
          const vert = from ^ 128;
          if (b[vert] === 0) {
            if (type === PAWN && lvl === 1 && CFG.promoDescent &&
                row === (s === WHITE ? 0 : 7)) {
              for (const pr of [QUEEN, ROOK, BISHOP, KNIGHT]) {
                out.push({ from, to: vert, promo: pr, flag: F_VERT });
              }
            } else if (!capsOnly) {
              out.push({ from, to: vert, promo: 0, flag: F_VERT });
            }
          }
        }

        // 2) moviments dins del nivell
        if (type === PAWN) {
          pushPawnMoves(st, from, piece, out, capsOnly);
        } else if (type === KNIGHT || type === KING) {
          const offs = type === KNIGHT ? KNIGHT_OFFS : KING_OFFS;
          for (let i = 0; i < 8; i++) {
            const t = from + offs[i];
            if (!inLvl(t, lvl)) continue;
            const tp = b[t];
            if (tp === 0 ? !capsOnly : (tp > 0 ? 1 : -1) !== s && Math.abs(tp) !== KING) {
              out.push({ from, to: t, promo: 0, flag: F_NORM });
            }
          }
          if (type === KING && !capsOnly) {
            genCastles(st, from, piece, out);
            genILCastles(st, from, piece, out);
          }
        } else {
          const dirs = type === ROOK ? ROOK_DIRS : type === BISHOP ? BISHOP_DIRS : KING_OFFS;
          for (let i = 0; i < dirs.length; i++) {
            const dir = dirs[i];
            let t = from + dir;
            while (inLvl(t, lvl)) {
              const tp = b[t];
              if (tp === 0) {
                if (!capsOnly) out.push({ from, to: t, promo: 0, flag: F_NORM });
              } else {
                if ((tp > 0 ? 1 : -1) !== s && Math.abs(tp) !== KING) out.push({ from, to: t, promo: 0, flag: F_NORM });
                break;
              }
              t += dir;
            }
          }
        }
      }
    }
  }
  // regla de bloqueig: captura a Terra impossible si el Cel damunt és ocupat
  if (CFG.celestial && CFG.conversion && CFG.capBlock === 'block') {
    return out.filter(m => {
      if (m.flag === F_EP) {
        const sp = st.b[m.from] > 0 ? 1 : -1;
        const victimSq = m.to + (sp === WHITE ? 16 : -16);
        return st.b[victimSq ^ 128] === 0;
      }
      if (m.flag === F_NORM || m.flag === F_DBL) {
        if ((m.to >> 7) === 0 && st.b[m.to] !== 0) return st.b[m.to ^ 128] === 0;
      }
      return true;
    });
  }
  return out;
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
  const b = st.b, gh = st.gh, gid = st.gid;
  const piece = b[m.from];
  const s = piece > 0 ? WHITE : BLACK;
  const u = {
    m, piece, mvGid: gid[m.from], mvGh: gh[m.from],
    cap: 0, capSq: -1, capGh: 0, capGid: 0,
    ep: st.ep, half: st.half,
    cast: {
      wk: st.castling.wk, wq: st.castling.wq, bk: st.castling.bk, bq: st.castling.bq,
      ilw_h: st.castling.ilw_h, ilw_q: st.castling.ilw_q,
      ilb_h: st.castling.ilb_h, ilb_q: st.castling.ilb_q
    },
    conv: null
  };
  st.hist.push(u);
  st.ep = -1;

  if (m.flag === F_VERT) {
    b[m.to] = m.promo ? m.promo * s : piece;
    b[m.from] = 0;
    gh[m.to] = u.mvGh; gid[m.to] = u.mvGid; gh[m.from] = 0; gid[m.from] = 0;
    st.half = m.promo ? 0 : st.half + 1; // la promoció per descens és moviment de peó
  } else if (m.flag === F_IL) {
    const rook = b[m.to], rGid = gid[m.to];
    b[m.to] = piece; b[m.from] = rook;
    gh[m.to] = 0; gh[m.from] = 0;
    gid[m.to] = 0; gid[m.from] = rGid;
    st.k[s] = m.to;
    // reglament v1.0: l'enroc internivell es pot fer UNA vegada per jugador
    if (s === WHITE) {
      st.castling.wk = false; st.castling.wq = false;
      st.castling.ilw_h = false; st.castling.ilw_q = false;
    } else {
      st.castling.bk = false; st.castling.bq = false;
      st.castling.ilb_h = false; st.castling.ilb_q = false;
    }
    clearILRight(st, rGid);
    st.half++;
  } else if (m.flag === F_CK || m.flag === F_CQ) {
    const home = s === WHITE ? 112 : 0;
    const rookFrom = m.flag === F_CK ? home + 7 : home;
    const rookTo = m.flag === F_CK ? home + 5 : home + 3;
    b[m.to] = piece; b[m.from] = 0;
    gh[m.to] = u.mvGh; gid[m.to] = u.mvGid; gh[m.from] = 0; gid[m.from] = 0;
    b[rookTo] = b[rookFrom]; b[rookFrom] = 0;
    gid[rookTo] = gid[rookFrom]; gid[rookFrom] = 0;
    st.half++;
  } else if (m.flag === F_VCAP) {
    u.capSq = m.to;
    u.cap = b[m.to]; u.capGh = gh[m.to]; u.capGid = gid[m.to];
    b[m.from] = 0; gh[m.from] = 0; gid[m.from] = 0;
    b[m.to] = piece; gh[m.to] = u.mvGh; gid[m.to] = u.mvGid;
    st.half = 0;
    if ((m.to >> 7) === 0 && CFG.conversion) placeConverted(st, u, s);
    if ((m.to >> 7) === 1 && u.capGid) clearILRight(st, u.capGid);
  } else if (m.flag === F_EP) {
    u.capSq = m.to + (s === WHITE ? 16 : -16);
    u.cap = b[u.capSq]; u.capGh = gh[u.capSq]; u.capGid = gid[u.capSq];
    b[u.capSq] = 0; gh[u.capSq] = 0; gid[u.capSq] = 0;
    b[m.to] = piece; b[m.from] = 0;
    gh[m.to] = u.mvGh; gid[m.to] = u.mvGid; gh[m.from] = 0; gid[m.from] = 0;
    st.half = 0;
    if (CFG.conversion) placeConverted(st, u, s);
  } else {
    const tp = b[m.to];
    if (tp !== 0) {
      u.cap = tp; u.capSq = m.to; u.capGh = gh[m.to]; u.capGid = gid[m.to];
    }
    b[m.to] = m.promo ? m.promo * s : piece;
    b[m.from] = 0;
    gh[m.to] = u.mvGh; gid[m.to] = u.mvGid; gh[m.from] = 0; gid[m.from] = 0;
    st.half = (Math.abs(piece) === PAWN || tp !== 0) ? 0 : st.half + 1;
    if (m.flag === F_DBL) st.ep = (m.from + m.to) / 2;
    if (tp !== 0) {
      if ((m.to >> 7) === 0) {
        if (CFG.conversion) placeConverted(st, u, s);
      } else if (CFG.heavenDeath === 'convert') {
        // reconversió dins del Cel: canvia de bàndol, casella lliure propera
        placeConverted(st, u, s);
      } else {
        if (u.capGid) clearILRight(st, u.capGid); // segona mort d'una torre original
      }
    }
  }

  if (Math.abs(piece) === KING) {
    if (s === WHITE) { st.castling.wk = false; st.castling.wq = false; }
    else { st.castling.bk = false; st.castling.bq = false; }
  }
  if (m.from === SQ_A1 || m.to === SQ_A1) st.castling.wq = false;
  if (m.from === SQ_H1 || m.to === SQ_H1) st.castling.wk = false;
  if (m.from === SQ_A8 || m.to === SQ_A8) st.castling.bq = false;
  if (m.from === SQ_H8 || m.to === SQ_H8) st.castling.bk = false;

  if (Math.abs(piece) === KING && m.flag !== F_IL) st.k[s] = m.to;
  st.turn = -st.turn;
  st.ply++;
}

function unmake(st) {
  const u = st.hist.pop();
  if (!u) return;
  const m = u.m, b = st.b, gh = st.gh, gid = st.gid;
  const s = u.piece > 0 ? WHITE : BLACK;

  // Primer es retira la peça convertida i DESPRÉS es restaura la resta: amb la
  // reconversió al Cel (heavenDeath 'convert') el fantasma pot haver anat a parar
  // a la casella que la captora acaba de deixar buida (m.from); esborrar-lo al
  // final eliminava la captora que acabem de tornar al seu lloc.
  if (u.conv !== null && u.conv >= 0) {
    b[u.conv] = 0; gh[u.conv] = 0; gid[u.conv] = 0;
  }

  if (m.flag === F_IL) {
    const rook = b[m.from];
    b[m.from] = u.piece; // el rei torna a la seva casella
    b[m.to] = rook;      // la torre torna al Cel/Terra d'on venia
    gh[m.from] = u.mvGh; gh[m.to] = 0;
    gid[m.to] = gid[m.from]; gid[m.from] = 0;
  } else if (m.flag === F_CK || m.flag === F_CQ) {
    const home = s === WHITE ? 112 : 0;
    const rookFrom = m.flag === F_CK ? home + 7 : home;
    const rookTo = m.flag === F_CK ? home + 5 : home + 3;
    b[m.from] = u.piece; b[m.to] = 0;
    gh[m.from] = u.mvGh; gh[m.to] = 0;
    gid[m.from] = u.mvGid; gid[m.to] = 0;
    b[rookFrom] = b[rookTo]; b[rookTo] = 0;
    gid[rookFrom] = gid[rookTo]; gid[rookTo] = 0;
    gh[rookFrom] = 0;
  } else {
    b[m.from] = u.piece; gh[m.from] = u.mvGh; gid[m.from] = u.mvGid;
    b[m.to] = (u.capSq === m.to) ? u.cap : 0;
    gh[m.to] = (u.capSq === m.to) ? u.capGh : 0;
    gid[m.to] = (u.capSq === m.to) ? u.capGid : 0;
    if (m.flag === F_EP) {
      b[u.capSq] = u.cap; gh[u.capSq] = u.capGh; gid[u.capSq] = u.capGid;
      b[m.to] = 0; gh[m.to] = 0; gid[m.to] = 0;
    }
  }
  if (Math.abs(u.piece) === KING) st.k[s] = m.from;
  st.castling = u.cast;
  st.ep = u.ep; st.half = u.half;
  st.turn = -st.turn;
  st.ply--;
}

// ---------------- Avaluació ----------------
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
function insufficientMaterial(st) {
  let count = 0, loneType = 0;
  for (let i = 0; i < 256; i++) {
    const type = Math.abs(st.b[i]);
    if (!type || type === KING) continue;
    if (type !== BISHOP && type !== KNIGHT) return false;
    count++;
    loneType = type;
  }
  return count === 0 || (count === 1 && (loneType === BISHOP || loneType === KNIGHT));
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
  if (m.flag === F_IL) {
    return 'O-O' + (lvlOf(m.to) === 1 ? '\u2191' : '\u2193');
  }
  if (m.flag === F_VERT) {
    let txt = letter + squareName(m.from) + (lvlOf(m.to) === 1 ? '\u2191' : '\u2193') + squareName(m.to);
    if (m.promo) txt += '=' + PIECE_LETTER[m.promo];
    return txt;
  }
  const isEp = m.flag === F_EP;
  const cap = isEp || st.b[m.to] !== 0;
  let txt = letter + squareName(m.from) + (cap ? '\u00d7' : '\u2192') + squareName(m.to);
  if (m.promo) txt += '=' + PIECE_LETTER[m.promo];
  if (isEp) txt += ' ep';
  return txt;
}

// ---------------- Cerca (negamax + alfa-beta + quiescència) ----------------
// Ordre de les jugades: PV > captures (MVV-LVA) > promocions > «assassins»
// (jugades tranquil·les que han tallat a aquesta fondària) > historial.
// L'ordre només afecta la velocitat: el valor d'alfa-beta no en depèn.
const MAX_PLY = 64;
const HIST_MAX = 6000;
let _killers = [];                         // per ply: [clau1, clau2]
const _history = new Int32Array(256 * 256); // [from*256+to] -> afecte (<= HIST_MAX)

function moveKey(m) { return m.from | (m.to << 8) | (m.flag << 16) | (m.promo << 20); }
// jugada tranquil·la = ni captura (ni captura al pas) ni promoció
function isQuiet(st, m) {
  return m.flag !== F_EP && !m.promo && (m.flag === F_IL || st.b[m.to] === 0);
}
function resetSearchTables() {
  _history.fill(0);
  _killers = [];
  for (let i = 0; i < MAX_PLY + 2; i++) _killers.push([-1, -1]);
}
function rewardQuiet(st, m, depth, ply) {
  const kk = _killers[ply];
  if (kk) {
    const key = moveKey(m);
    if (kk[0] !== key) { kk[1] = kk[0]; kk[0] = key; }
  }
  const idx = (m.from << 8) | m.to, bonus = depth * depth;
  _history[idx] += bonus - ((_history[idx] * bonus / HIST_MAX) | 0);
}

function orderMoves(st, moves, pv, ply) {
  const b = st.b;
  const kk = ply !== undefined && ply < MAX_PLY ? _killers[ply] : null;
  for (const m of moves) {
    let sc = 0;
    const victim = m.flag === F_EP ? PAWN
      : (m.flag === F_IL ? 0 : Math.abs(b[m.to]));
    if (victim !== 0) sc = 10000 + PIECE_VALUE[victim] * 10 - Math.abs(b[m.from]);
    if (m.promo === QUEEN) sc += 9000;
    else if (m.promo) sc += PIECE_VALUE[m.promo];
    if (m.flag === F_VERT) sc += 20;
    if (m.flag === F_IL) sc += 15;
    if (ply !== undefined && victim === 0 && !m.promo) {
      const key = moveKey(m);
      if (kk && key === kk[0]) sc += 8000;
      else if (kk && key === kk[1]) sc += 7000;
      sc += _history[(m.from << 8) | m.to];
    }
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
  const caps = genPseudo(st, true);
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
  orderMoves(st, moves, null, ply);
  const mover = st.turn;
  let legal = 0;
  for (const m of moves) {
    make(st, m);
    if (inCheck(st, mover)) { unmake(st); continue; }
    legal++;
    // PVS: la 1a jugada (la millor segons l'ordre) amb finestra completa; les
    // altres amb finestra nul·la i només es tornen a cercar si "superen" alfa
    let sc;
    if (legal === 1) {
      sc = -negamax(st, depth - 1, -beta, -alpha, ply + 1);
    } else {
      sc = -negamax(st, depth - 1, -alpha - 1, -alpha, ply + 1);
      if (sc > alpha && sc < beta) sc = -negamax(st, depth - 1, -beta, -alpha, ply + 1);
    }
    unmake(st);
    if (sc >= beta) {
      if (isQuiet(st, m)) rewardQuiet(st, m, depth, ply);
      return beta;
    }
    if (sc > alpha) alpha = sc;
  }
  if (legal === 0) {
    return inCheck(st, mover) ? -(MATE - ply) : 0;
  }
  return alpha;
}

function search(state, opts) {
  opts = opts || {};
  const st = cloneState(state);
  const timeMs = opts.timeMs || 1000;
  const maxDepth = opts.maxDepth || 4;
  const t0 = Date.now();
  _deadline = t0 + timeMs;
  _nodes = 0;
  resetSearchTables();

  const rootMoves = genMoves(st, true);
  const info = { move: null, score: 0, depth: 0, nodes: 0, timeMs: 0, random: false };
  if (rootMoves.length === 0) return info;

  if (opts.blunder && Math.random() < opts.blunder) {
    info.move = rootMoves[(Math.random() * rootMoves.length) | 0];
    info.random = true;
    info.timeMs = Date.now() - t0;
    return info;
  }

  // varietat d'obertura: barreja l'ordre arrel (no afecta la correcció de
  // alfa-beta: les puntuacions exactes no depenen de l'ordre) i després tria
  // a l'atzar entre les jugades que queden dins del marge
  const variety = opts.variety && st.ply < 24 ? opts.variety : 0;
  if (variety) {
    for (let i = rootMoves.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = rootMoves[i]; rootMoves[i] = rootMoves[j]; rootMoves[j] = t;
    }
  }

  let bestMove = null, bestScore = 0, doneDepth = 0;
  let exacts = []; // [m, sc] amb puntuació exacta a l'última profunditat feta
  for (let depth = 1; depth <= maxDepth; depth++) {
    orderMoves(st, rootMoves, bestMove, 0);
    let alpha = -Infinity, beta = Infinity;
    let iterBest = null, iterScore = -Infinity;
    const iterExacts = [];
    try {
      for (const m of rootMoves) {
        make(st, m);
        const sc = -negamax(st, depth - 1, -beta, -alpha, 1);
        unmake(st);
        if (sc > iterScore) { iterScore = sc; iterBest = m; }
        if (sc > alpha) { alpha = sc; iterExacts.push({ m, sc }); }
      }
    } catch (e) {
      if (e === TIMEOUT) break;
      throw e;
    }
    bestMove = iterBest; bestScore = iterScore; doneDepth = depth;
    exacts = iterExacts;
    if (bestScore > MATE - 1000) break;
    if (Date.now() - t0 > timeMs * 0.45) break;
  }
  if (variety && exacts.length > 1 && Math.abs(bestScore) < MATE - 1000) {
    const cands = exacts.filter(e => e.sc >= bestScore - variety);
    if (cands.length > 1) {
      bestMove = cands[(Math.random() * cands.length) | 0].m;
      info.random = true;
    }
  }
  info.move = bestMove || rootMoves[0];
  info.score = bestScore;
  info.depth = doneDepth;
  info.nodes = _nodes;
  info.timeMs = Date.now() - t0;
  return info;
}

// ---------------- Perft ----------------
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

// ---------------- Comptes auxiliars ----------------
function pieceCounts(st) {
  let earth = 0, heaven = 0, ghosts = 0, heavenW = 0, heavenB = 0;
  for (let i = 0; i < 256; i++) {
    const p = st.b[i];
    if (p === 0) continue;
    if ((i >> 7) === 0) { earth++; continue; }
    heaven++;
    if (st.gh[i]) ghosts++;
    if (p > 0) heavenW++; else heavenB++;
  }
  return { earth, heaven, ghosts, heavenW, heavenB };
}

// ---------------- Entrenador: ajudes ----------------
// nom explícit per al text del coach: terra-e4 / cel-e4
function sqToStr(sq) {
  return (lvlOf(sq) === 1 ? 'cel-' : 'terra-') + FILE_CHARS[colOf(sq)] + (8 - rowOf(sq));
}
// Peces de `by` que controlen la casella des de l'altre nivell.
function verticalAttackers(st, sq, by) {
  const out = [];
  if (!CFG.celestial) return out;
  const o = otherLevel(sq);
  const p = st.b[o];
  if (p !== 0 && (p > 0 ? 1 : -1) === by) {
    if (!(lvlOf(sq) === 0 && st.gh[o])) {
      const t = p > 0 ? p : -p;
      if (t === ROOK || t === QUEEN || t === KING) out.push(o);
    }
  }
  return out;
}
// si es fa ara la captura m (a la Terra): casella del Cel on pujarà el fantasma, o -1 si no hi ha lloc
function convertsTo(st, m) {
  if (!CFG.conversion) return -1;
  const isEarthCap = m.flag === F_EP || (st.b[m.to] !== 0 && (m.to >> 7) === 0);
  if (!isEarthCap) return -1;
  const sky = otherLevel(m.to);
  return st.b[sky] === 0 ? sky : -1;
}

function legalMoves(state) { return genMoves(state, true); }
function applyMove(state, move) {
  const legal = legalMoves(state).find(candidate =>
    candidate.from === move.from && candidate.to === move.to &&
    candidate.flag === move.flag && candidate.promo === (move.promo || 0));
  if (!legal) throw new Error('illegal move');
  make(state, legal);
  return state;
}
function isCheck(state, side) { return inCheck(state, side); }

const ZOBRIST_MASK = 0xffffffffffffffffn;
let zobristSeed = 0x9e3779b97f4a7c15n;
function nextZobrist() {
  let value = zobristSeed;
  value ^= value >> 12n;
  value ^= (value << 25n) & ZOBRIST_MASK;
  value ^= value >> 27n;
  zobristSeed = value;
  return (value * 0x2545f4914f6cdd1dn) & ZOBRIST_MASK;
}
function zobristTable(rows, columns = 1) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: columns }, nextZobrist));
}
const Z_PIECE = zobristTable(256, 13);
const Z_GHOST = zobristTable(256, 2);
const Z_GID = zobristTable(256, 5);
const Z_CASTLING = zobristTable(8);
const Z_EP = zobristTable(256);
const Z_TURN = nextZobrist();
function hashRuleConfig() {
  let hash = 0xcbf29ce484222325n;
  const text = Object.keys(CFG).sort().map(key => `${key}=${CFG[key]}`).join(';');
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & ZOBRIST_MASK;
  }
  return hash;
}
function zobrist(state) {
  let hash = state.turn === BLACK ? Z_TURN : 0n;
  for (let sq = 0; sq < 256; sq++) {
    const piece = state.b[sq];
    if (piece) hash ^= Z_PIECE[sq][piece + 6];
    if (state.gh[sq]) hash ^= Z_GHOST[sq][1];
    if (state.gid[sq]) hash ^= Z_GID[sq][state.gid[sq]];
  }
  const rights = ['wk', 'wq', 'bk', 'bq', 'ilw_h', 'ilw_q', 'ilb_h', 'ilb_q'];
  rights.forEach((right, index) => {
    if (state.castling[right]) hash ^= Z_CASTLING[index][0];
  });
  if (state.ep >= 0) hash ^= Z_EP[state.ep][0];
  return hash ^ hashRuleConfig();
}

const Engine2 = {
  WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
  F_NORM, F_DBL, F_EP, F_CK, F_CQ, F_VERT, F_IL, F_VCAP,
  GID_WQ, GID_WK, GID_BQ, GID_BK,
  PIECE_LETTER, PIECE_VALUE,
  idxOf, rowOf, colOf, lvlOf, otherLevel, squareName,
  CFG, CLASSICAL_MODE, setConfig, variantConfig,
  initialState, cloneState, stateEqual,
  attacked, inCheck,
  genPseudo, genMoves,
  legalMoves, applyMove, isCheck, zobrist,
  make, unmake,
  evalState, gameStatus, insufficientMaterial,
  moveText, search, perft, pieceCounts,
  freeCelSq, sqToStr, verticalAttackers, convertsTo
};

if (typeof module !== 'undefined' && module.exports) module.exports = Engine2;

export { Engine2 as Engine, CLASSICAL_MODE, legalMoves, applyMove, isCheck, gameStatus, zobrist };
