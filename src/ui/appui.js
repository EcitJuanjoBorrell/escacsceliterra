'use strict';
import { Engine } from '../engine/engine.js';
import { Theme, shortcutBlocked } from '../ui/theme.js';
import { adur, animLock, animateCapture, animatePieceMove, animateSwap, buildProtos, cam, checkMarker, clearAllOverlays, clearMarkers, init3D, replacePiece, setCameraPreset, setCheckSq, setLastMove3D, showSelection3D, spawnGhost, syncAllPieces } from '../render/app3d.js';
import engineRaw from '../core/rules.js?raw';
/* ============================================================
   FLUX DE PARTIDA I UI: modes, IA asíncrona (web worker),
   desfés, historial, vista 2D, so, modals
   ============================================================ */

// `Engine` (àlies d'Engine2) ja està declarat dins del tag del motor.

const DIFFS = {
  1: { timeMs: 220,  maxDepth: 1, blunder: 0.75, label: 'Novell' },
  2: { timeMs: 350,  maxDepth: 2, blunder: 0.35, label: 'Fàcil' },
  3: { timeMs: 800,  maxDepth: 4, blunder: 0.08, label: 'Mitjà' },
  4: { timeMs: 1800, maxDepth: 6, blunder: 0, variety: 12, label: 'Difícil' },
  5: { timeMs: 3200, maxDepth: 8, blunder: 0, variety: 12, label: 'Expert' }
};
const DIFF_DESC = {
  1: 'Gairebé sempre mou a l\u2019atzar entre les jugades legals: perfecte per descobrir el tauler doble.',
  2: 'Juga ràpid i comet errors evidents: ideal per aprendre el tauler doble.',
  3: 'Calcula 3-4 jugades endavant; castiga els errors greus.',
  4: 'Profunditat alta: controla el nivell superior i prepara atacs en columna.',
  5: 'Màxim càlcul i sacrificis posicionals: amaga el rei entre els dos nivells o perdràs.'
};
const GLYPH_W = ['\u2659', '\u2658', '\u2657', '\u2656', '\u2655', '\u2654'];
const GLYPH_B = ['\u265F', '\u265E', '\u265D', '\u265C', '\u265B', '\u265A'];
const INIT_COUNTS = { 1: 8, 2: 2, 3: 2, 4: 2, 5: 1, 6: 1 };

const settings = { mode: 'ai', playerColor: Engine.WHITE, difficulty: 2, promo: Engine.QUEEN };

let game = Engine.initialState();
let curStatus = Engine.gameStatus(game);
let selected = -1, selectedMoves = [];
let gameOver = false, thinking = false, started = false;
let snapshots = [], historyPairs = [];
let lastMove = null;
let aiTimer = null, gameToken = 0;
const cellEls = new Array(256).fill(null);

// Reproductor i Màquina vs. Màquina
let moveLog = [];        // [{m, notation, mover}] de TOTA la partida
let replayMoves = null;  // jugades carregades d'un fitxer (mode reproductor)
let analysis = null;     // anàlisi de fi de partida: { snaps, final, idx } (només lectura)
let endInfo = null;      // com ha acabat: { title, text, result, winner }
let replayIdx = 0;       // jugades del fitxer ja aplicades
let playerAuto = false;  // ⏯ avanç automàtic
let autoTimer = null;

function playerActive() { return settings.mode === 'mm' || settings.mode === 'replay'; }

function aiColor() { return -settings.playerColor; }

/* ---------- Web worker per a la IA ---------- */
let worker = null, workerReady = false, callSeq = 0;
const pendingCalls = new Map();
function initWorker() {
  const src = engineRaw.replace(/export \{[^}]*\};\s*$/, '') + '\nconst Engine = Engine2;\n';
  const glue = '\nself.onmessage = function (e) { var d = e.data; try { if (d.cfg) Engine.setConfig(d.cfg); var r = Engine.search(d.state, d.opts); self.postMessage({ id: d.id, ok: true, res: r }); } catch (err) { self.postMessage({ id: d.id, ok: false, err: String(err) }); } };';
  try {
    const blob = new Blob([src + glue], { type: 'text/javascript' });
    worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = e => {
      const c = pendingCalls.get(e.data.id);
      if (!c) return;
      pendingCalls.delete(e.data.id);
      if (e.data.ok) c.res(e.data.res); else c.rej(new Error(e.data.err));
    };
    worker.onerror = () => {
      workerReady = false; worker = null;
      for (const c of pendingCalls.values()) c.rej(new Error('worker error'));
      pendingCalls.clear();
    };
    workerReady = true;
  } catch (e) { worker = null; workerReady = false; }
}
function engineSearch(state, opts) {
  const payload = {
    b: state.b, gh: state.gh, gid: state.gid, turn: state.turn,
    castling: {
      wk: state.castling.wk, wq: state.castling.wq, bk: state.castling.bk, bq: state.castling.bq,
      ilw_h: state.castling.ilw_h, ilw_q: state.castling.ilw_q,
      ilb_h: state.castling.ilb_h, ilb_q: state.castling.ilb_q
    },
    ep: state.ep, half: state.half, ply: state.ply,
    k: { 1: state.k[1], '-1': state.k[-1] }
  };
  if (worker && workerReady) {
    return new Promise((res, rej) => {
      const id = ++callSeq;
      pendingCalls.set(id, { res, rej });
      // la configuració de regles viatja amb cada cerca: el worker té la seva pròpia còpia d'Engine.CFG
      worker.postMessage({ id, state: payload, opts, cfg: Engine.CFG });
      setTimeout(() => {
        if (pendingCalls.has(id)) { pendingCalls.delete(id); rej(new Error('worker timeout')); }
      }, (opts.timeMs || 1000) + 8000);
    }).catch(() => Engine.search(state, opts));
  }
  return new Promise(r => setTimeout(() => r(Engine.search(state, opts)), 40));
}

/* ---------- So ---------- */
let audioCtx = null, soundOn = true;
function sfx(kind) {
  if (!soundOn) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (/** @type {any} */ (window)).webkitAudioContext)();
    const t = audioCtx.currentTime;
    const tone = (f0, f1, dur, type, gain, t0) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t + t0);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + t0 + dur);
      g.gain.setValueAtTime(gain, t + t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t + t0 + dur);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t + t0); o.stop(t + t0 + dur + 0.02);
    };
    if (kind === 'move') tone(340, 210, 0.09, 'triangle', 0.12, 0);
    else if (kind === 'capture') { tone(200, 90, 0.14, 'square', 0.1, 0); tone(420, 180, 0.1, 'triangle', 0.08, 0.02); }
    else if (kind === 'vertical') tone(300, 560, 0.2, 'sine', 0.12, 0);
    else if (kind === 'check') { tone(760, 760, 0.09, 'square', 0.07, 0); tone(760, 760, 0.09, 'square', 0.07, 0.14); }
    else if (kind === 'end') { tone(392, 392, 0.14, 'triangle', 0.1, 0); tone(523, 523, 0.14, 'triangle', 0.1, 0.15); tone(659, 659, 0.22, 'triangle', 0.1, 0.3); }
  } catch (e) { /* sense so */ }
}

/* ---------- Interacció amb el taulell ---------- */
function busy() { return gameOver || thinking || animLock > 0; }
function canControlSq(sq) {
  if (busy() || playerActive()) return false;
  if (settings.mode === 'ai' && game.turn !== settings.playerColor) return false;
  const p = game.b[sq];
  return p !== 0 && (p > 0 ? 1 : -1) === game.turn;
}
function onTileClick(sq) {
  if (busy() || playerActive()) return;
  if (settings.mode === 'ai' && game.turn !== settings.playerColor) return;
  if (selected >= 0) {
    const mvs = selectedMoves.filter(m => m.to === sq);
    if (mvs.length) {
      const m = mvs.find(x => x.promo === settings.promo) || mvs[0];
      doMove(m);
      return;
    }
  }
  const p = game.b[sq];
  if (p !== 0 && (p > 0 ? 1 : -1) === game.turn) {
    if (selected === sq) { clearSelection(); return; }
    selectSq(sq);
    return;
  }
  clearSelection();
}
function selectSq(sq) {
  selected = sq;
  selectedMoves = curStatus.moves.filter(m => m.from === sq);
  showSelection3D(sq, selectedMoves);
  refresh2D();
  refreshCoach();
}
function clearSelection() {
  selected = -1; selectedMoves = [];
  clearMarkers();
  if (checkMarker && curStatus && curStatus.check) setCheckSq(game.k[game.turn]);
  else setCheckSq(-1);
  refresh2D();
  refreshCoach();
}

/* ---------- Fer jugada ---------- */
function pushSnapshot() {
  snapshots.push({
    state: Engine.cloneState(game),
    history: JSON.parse(JSON.stringify(historyPairs)),
    moveLog: JSON.parse(JSON.stringify(moveLog)),
    lastMove: lastMove ? { from: lastMove.from, to: lastMove.to } : null
  });
  if (snapshots.length > 900) snapshots.shift();
}
function addHistory(notation, mover) {
  if (mover === Engine.WHITE) historyPairs.push({ w: notation, b: '' });
  else if (historyPairs.length && !historyPairs[historyPairs.length - 1].b) historyPairs[historyPairs.length - 1].b = notation;
  else historyPairs.push({ w: '\u2026', b: notation });
}
function doMove(m, opts) {
  opts = opts || {};
  clearSelection();
  const mover = game.turn;
  const notation0 = Engine.moveText(game, m);
  let capSq = -1;
  if (m.flag === Engine.F_VCAP) capSq = m.to;
  else if (m.flag === Engine.F_EP) capSq = m.to + (mover === Engine.WHITE ? 16 : -16);
  else if (game.b[m.to] !== 0) capSq = m.to;
  const victimT = capSq >= 0 ? Math.abs(game.b[capSq]) : 0;
  const moverT = Math.abs(game.b[m.from]);
  pushSnapshot();
  Engine.make(game, m);
  curStatus = Engine.gameStatus(game);
  // anotacions del reglament v1.0
  const u = game.hist[game.hist.length - 1];
  let ann = '';
  if (u.cap !== 0) {
    const earthCap = m.flag === Engine.F_EP || (m.to >> 7) === 0;
    ann = earthCap ? ' (conv)' : ' (2a mort)';
  }
  const notation = notation0 + ann + (curStatus.over && curStatus.result === 'mate' ? '#' : (curStatus.check ? '+' : ''));
  addHistory(notation, mover);
  moveLog.push({ m: { from: m.from, to: m.to, promo: m.promo || 0, flag: m.flag }, notation, mover });
  if (coachOn && !opts.fast && $('coach-last')) {
    $('coach-last').innerHTML = coachMoveHtml(m, mover, u, victimT, moverT, capSq, curStatus);
  }
  lastMove = { from: m.from, to: m.to };

  if (opts.fast) {
    // camí ràpid del reproductor (⏭): sense animacions ni so
    setLastMove3D(m.from, m.to);
    setCheckSq(curStatus.check ? game.k[game.turn] : -1);
    refreshPanels(curStatus);
    if (curStatus.over) endGame(curStatus);
    return;
  }

  if (m.flag === Engine.F_VCAP) sfx('capture');
  else if (curStatus.over) sfx('end');
  else if (curStatus.check) sfx('check');
  else if (capSq >= 0) sfx('capture');
  else if (m.flag === Engine.F_VERT) sfx('vertical');
  else sfx('move');

  setLastMove3D(m.from, m.to);
  const crossLevel = (m.from >> 7) !== (m.to >> 7);
  const dur = crossLevel ? adur(430) : adur(300);
  const castle = m.flag === Engine.F_CK || m.flag === Engine.F_CQ;
  const ilCastle = m.flag === Engine.F_IL;
  if (capSq >= 0) animateCapture(capSq, Math.round(dur * 0.4));
  if (u.conv !== null && u.conv >= 0 && m.flag !== Engine.F_VCAP) {
    // la víctima ascendeix com a fantasma del bàndol qui captura
    spawnGhost(u.conv, Math.abs(u.cap), mover, Math.round(dur * 0.6));
  }
  if (ilCastle) {
    animateSwap(m.from, m.to, dur, null);
  } else {
    animatePieceMove(m.from, m.to, crossLevel, dur, () => {
      if (m.promo) replacePiece(m.to, m.promo);
      if (castle) {
        const home = mover === Engine.WHITE ? 112 : 0;
        const rf = m.flag === Engine.F_CK ? home + 7 : home;
        const rt = m.flag === Engine.F_CK ? home + 5 : home + 3;
        animatePieceMove(rf, rt, false, adur(300), null);
      }
    });
    if (m.flag === Engine.F_VCAP && u.conv !== null && u.conv >= 0) {
      // L'origen celeste queda lliure després de començar el moviment del captor.
      spawnGhost(u.conv, Math.abs(u.cap), mover, Math.round(dur * 0.6));
    }
  }
  setCheckSq(curStatus.check ? game.k[game.turn] : -1);
  refreshPanels(curStatus);
  // quan l'animació acaba (animLock torna a 0), restaura l'estat dels botons
  setTimeout(() => { if (!gameOver && !thinking) refreshPanels(); }, dur + 80);

  if (curStatus.over) setTimeout(() => endGame(curStatus), 700);
  else if (settings.mode === 'ai' && game.turn === aiColor()) {
    aiTimer = setTimeout(aiTurn, 350);
  } else if (settings.mode === 'mm' && playerAuto && !opts.noAuto) {
    autoTimer = setTimeout(mmStep, 1100);
  }
  updatePlayerBar();
}

/* ---------- IA ---------- */
async function aiTurn() {
  aiTimer = null;
  if (gameOver || settings.mode !== 'ai' || game.turn !== aiColor()) return;
  const token = ++gameToken;
  thinking = true;
  refreshPanels(curStatus);
  const opts = DIFFS[settings.difficulty];
  let res = null;
  try { res = await engineSearch(game, opts); } catch (e) { res = null; }
  if (token !== gameToken || gameOver) { thinking = false; refreshPanels(curStatus); return; }
  thinking = false;
  if (!res || !res.move) { refreshPanels(curStatus); return; }
  updateAiCard(res);
  doMove(res.move);
}
function updateAiCard(res, mover) {
  const el = document.getElementById('ai-info');
  if (!res) { el.textContent = 'Encara no ha jugat.'; return; }
  const mv = (mover === undefined || mover === null) ? aiColor() : mover;
  const white = mv === Engine.WHITE ? res.score : -res.score;
  let evalStr;
  if (res.score > 99000) evalStr = 'mat a la vista';
  else if (res.score < -99000) evalStr = 'mat en contra';
  else evalStr = (white >= 0 ? '+' : '') + (white / 100).toFixed(2);
  const nodes = String(res.nodes).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const side = settings.mode === 'mm' ? ' · ' + (mv === Engine.WHITE ? 'blanques' : 'negres') : '';
  el.innerHTML = '<b>' + DIFFS[settings.difficulty].label + '</b>' + side + ' · profunditat ' + res.depth +
    (res.random ? ' · jugada variada' : '') + '<br>' + nodes + ' nodes · ' +
    (res.timeMs / 1000).toFixed(1) + ' s · avantatge ' + evalStr;
}

/* ---------- Màquina vs. Màquina (pas a pas) ---------- */
async function mmStep() {
  if (settings.mode !== 'mm' || gameOver || thinking) return;
  const token = ++gameToken;
  thinking = true;
  refreshPanels(curStatus);
  const mover = game.turn;
  let res = null;
  try { res = await engineSearch(game, DIFFS[settings.difficulty]); } catch (e) { res = null; }
  if (token !== gameToken || settings.mode !== 'mm' || gameOver) {
    thinking = false; refreshPanels(curStatus); return;
  }
  thinking = false;
  if (!res || !res.move) { refreshPanels(curStatus); return; }
  updateAiCard(res, mover);
  doMove(res.move);
}

/* ---------- Reproductor: guardar / carregar / navegar ---------- */
// jugades a desar: durant l'anàlisi, sempre la partida sencera (no la posició que es mira)
function savedMoves() { return analysis ? analysis.final.moveLog : moveLog; }
function buildSaveData() {
  return {
    app: 'escac-cel-i-terra',
    versio: 1,
    desat: new Date().toISOString(),
    mode: settings.mode,
    dificultat: settings.difficulty,
    promo: settings.promo,
    jugades: savedMoves().map(e => ({ m: e.m, not: e.notation })),
    resultat: gameOver && endInfo ? endInfo.result : null
  };
}
function saveGameFile() {
  if (!savedMoves().length) { alert('Encara no hi ha cap jugada per desar.'); return; }
  const blob = new Blob([JSON.stringify(buildSaveData(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  a.href = URL.createObjectURL(blob);
  a.download = 'partida_cel-i-terra_' + stamp + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function loadGameData(txt) {
  let d;
  try { d = JSON.parse(txt); } catch (e) { alert('El fitxer no és un JSON vàlid.'); return; }
  if (!d || d.app !== 'escac-cel-i-terra' || !Array.isArray(d.jugades)) {
    alert('Aquest fitxer no és una partida de l\u2019Escacs Cel i Terra.'); return;
  }
  const moves = d.jugades
    .map(j => j && j.m ? j.m : j)
    .filter(m => m && Number.isInteger(m.from) && Number.isInteger(m.to) &&
      m.from >= 0 && m.from < 256 && m.to >= 0 && m.to < 256 &&
      typeof m.flag === 'number');
  if (!moves.length) { alert('La partida no conté cap jugada vàlida.'); return; }
  // cada jugada s'ha de poder jugar de debò: un fitxer retocat o corrupte
  // deixaria el motor amb un estat impossible
  const checked = validateReplay(moves);
  if (checked.error !== undefined) {
    alert('La jugada ' + (checked.error + 1) + ' del fitxer no és legal: no es pot reproduir aquesta partida.');
    return;
  }
  if (DIFFS[d.dificultat]) settings.difficulty = d.dificultat;
  settings.mode = 'replay';
  startReplay(checked.moves);
}
// Juga les jugades del fitxer sobre una còpia i les normalitza amb les legals del motor
function validateReplay(moves) {
  if (moves.length > 5000) return { error: 5000 };
  const st = Engine.initialState();
  const out = [];
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const legal = Engine.genMoves(st, true).find(x =>
      x.from === m.from && x.to === m.to && x.flag === m.flag && x.promo === (m.promo || 0));
    if (!legal) return { error: i };
    out.push({ from: legal.from, to: legal.to, promo: legal.promo, flag: legal.flag });
    Engine.make(st, legal);
  }
  return { moves: out };
}
function stopAuto() {
  playerAuto = false;
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
}
function startReplay(moves) {
  gameToken++;
  if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
  stopAuto();
  game = Engine.initialState();
  snapshots = []; historyPairs = []; moveLog = [];
  lastMove = null; gameOver = false; thinking = false; started = true;
  selected = -1; selectedMoves = [];
  curStatus = Engine.gameStatus(game);
  clearAllOverlays(); setLastMove3D(-1, -1); setCheckSq(-1);
  syncAllPieces();
  if ($('coach-last')) $('coach-last').textContent = '—';
  replayMoves = moves; replayIdx = 0;
  leaveAnalysis();
  cam.goal.theta = 0; cam.theta = 0;
  updateAiCard(null);
  refreshPanels(curStatus);
  hideModal('modal-start'); hideModal('modal-over'); hideModal('view2d');
  updatePlayerBar();
}
function replayFwd() {
  if (!replayMoves || replayIdx >= replayMoves.length || gameOver) return;
  doMove(replayMoves[replayIdx]);
  replayIdx++;
  updatePlayerBar();
}
function replayEnd() {
  if (!replayMoves) return;
  let guard = 2000;
  while (replayMoves && replayIdx < replayMoves.length && !gameOver && guard-- > 0) {
    doMove(replayMoves[replayIdx], { fast: true });
    replayIdx++;
  }
  syncAllPieces();
  updatePlayerBar();
}
function replayAutoStep() {
  if (!playerAuto || settings.mode !== 'replay') { playerAuto = false; return; }
  if (replayIdx >= replayMoves.length || gameOver || curStatus.over) {
    stopAuto(); updatePlayerBar(); return;
  }
  doMove(replayMoves[replayIdx]);
  replayIdx++;
  updatePlayerBar();
  if (playerAuto) autoTimer = setTimeout(replayAutoStep, 900);
}
function toggleAuto() {
  if (!playerActive()) return;
  if (playerAuto) { stopAuto(); }
  else {
    playerAuto = true;
    if (settings.mode === 'mm') { if (!thinking && !gameOver) autoTimer = setTimeout(mmStep, 150); }
    else { autoTimer = setTimeout(replayAutoStep, 150); }
  }
  updatePlayerBar();
}
function playerToStart() {
  let guard = 1000;
  while (snapshots.length && guard-- > 0) undo(true);
  updatePlayerBar();
}
function showPlayerBar() {
  const bar = document.getElementById('player-bar');
  if (!bar) return;
  bar.classList.toggle('hidden', !playerActive() || !!analysis);
  const fwd = $('pb-fwd');
  fwd.textContent = settings.mode === 'mm' ? 'Següent moviment ▶' : '▶ Següent';
  const play = $('pb-play');
  play.textContent = playerAuto ? '⏸' : '⏯';
  $('pb-end').classList.toggle('hidden', settings.mode !== 'replay');
  $('pb-close').classList.toggle('hidden', settings.mode === 'mm');
  const label = $('pb-label');
  if (settings.mode === 'replay' && replayMoves) {
    label.textContent = 'jugada ' + replayIdx + ' / ' + replayMoves.length;
  } else if (settings.mode === 'mm') {
    label.textContent = 'moviment ' + game.ply;
  } else {
    label.textContent = '—';
  }
  $('pb-start').disabled = snapshots.length === 0;
  $('pb-back').disabled = snapshots.length === 0 || thinking;
  $('pb-fwd').disabled = thinking ||
    (settings.mode === 'replay' && (!replayMoves || replayIdx >= replayMoves.length));
  $('pb-play').disabled = thinking ||
    (settings.mode === 'replay' && (!replayMoves || replayIdx >= replayMoves.length)) ||
    (settings.mode === 'mm' && gameOver);
}
function updatePlayerBar() { if (playerActive()) showPlayerBar(); }
function closePlayer() {
  stopAuto();
  hideModal('modal-over');
  $('btn-continue').classList.add('hidden');
  showModal('modal-start');
}

/* ---------- Desfés / partida nova ---------- */
function undo(fast) {
  if (analysis || thinking || animLock > 0 || snapshots.length === 0) return;
  gameToken++;
  if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
  stopAuto();
  let n = settings.mode === 'ai' && snapshots.length >= 2 ? 2 : 1;
  let snap = null;
  while (n-- > 0 && snapshots.length) snap = snapshots.pop();
  if (!snap) return;
  game = Engine.cloneState(snap.state);
  historyPairs = snap.history;
  moveLog = snap.moveLog || [];
  lastMove = snap.lastMove;
  if (replayMoves) replayIdx = Math.max(0, replayIdx - 1);
  gameOver = false;
  selected = -1; selectedMoves = [];
  curStatus = Engine.gameStatus(game);
  hideModal('modal-over');
  clearAllOverlays();
  setLastMove3D(lastMove ? lastMove.from : -1, lastMove ? lastMove.to : -1);
  setCheckSq(curStatus.check ? game.k[game.turn] : -1);
  syncAllPieces();
  if ($('coach-last')) $('coach-last').textContent = '—';
  refreshPanels(curStatus);
  updatePlayerBar();
}
function newGame() {
  gameToken++;
  if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
  stopAuto();
  game = Engine.initialState();
  snapshots = []; historyPairs = []; moveLog = [];
  replayMoves = null; replayIdx = 0;
  leaveAnalysis();
  lastMove = null; gameOver = false; thinking = false; started = true;
  selected = -1; selectedMoves = [];
  curStatus = Engine.gameStatus(game);
  clearAllOverlays(); setLastMove3D(-1, -1); setCheckSq(-1);
  syncAllPieces();
  if ($('coach-last')) $('coach-last').textContent = '—';
  cam.goal.theta = (settings.mode === 'ai' && settings.playerColor === Engine.BLACK) ? Math.PI : 0;
  cam.theta = cam.goal.theta;
  updateAiCard(null);
  refreshPanels(curStatus);
  hideModal('modal-start'); hideModal('modal-over'); hideModal('view2d');
  updatePlayerBar();
  if (settings.mode === 'ai' && settings.playerColor === Engine.BLACK) aiTimer = setTimeout(aiTurn, 600);
}
function resign() {
  if (gameOver || thinking || animLock > 0 || playerActive()) return;
  askConfirm('Rendir-se', 'Segur que vols rendir-te? La partida es donarà per perduda.', 'Rendir-se', () => {
    const loser = settings.mode === 'ai' ? settings.playerColor : game.turn;
    endGame({ over: true, result: 'rendicio', winner: -loser, check: false });
  });
}
function endGame(st) {
  gameOver = true;
  gameToken++;
  if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
  let title = 'Fi de la partida', text = '';
  const wName = st.winner === Engine.WHITE ? 'les blanques' : 'les negres';
  switch (st.result) {
    case 'mate':
      if (settings.mode === 'ai') {
        if (st.winner === settings.playerColor) { title = 'Guanyes! \u2655'; text = 'Has fet escac i mat cobrint els dos nivells. Excel·lent!'; }
        else { title = 'Escac i mat'; text = 'La màquina guanya: el teu rei no tenia escapatòria a cap nivell.'; }
      } else { title = 'Escac i mat!'; text = 'Guanyen ' + wName + '.'; }
      break;
    case 'ofegat': title = 'Ofegat'; text = 'El rei no té moviments legals però no està en escac: taules.'; break;
    case '50mov': title = 'Taules'; text = '50 moviments sense captures ni moviments de peó.'; break;
    case 'material': title = 'Taules'; text = 'Material insuficient: amb poques peces el rei sempre fuig cap a l\u2019altre nivell.'; break;
    case 'rendicio': title = 'Rendició'; text = 'Guanyen ' + wName + '.'; break;
  }
  document.getElementById('over-title').textContent = title;
  document.getElementById('over-text').textContent = text;
  endInfo = { title, text, result: st.result, winner: st.winner };
  refreshPanels(curStatus);
  const tok = gameToken;
  // deixa veure l'última jugada (animació i rei en escac) abans de tapar el taulell;
  // si mentrestant s'ha començat una altra partida, el quadre ja no s'ha de mostrar
  setTimeout(() => { if (tok === gameToken && gameOver && !analysis) showModal('modal-over'); }, 1300);
}

/* ---------- Anàlisi de fi de partida (només lectura) ---------- */
// «Analitzar» tanca el quadre de final i deixa el taulell lliure: es pot orbitar
// la càmera i recórrer la partida amb la barra de final (⏮ ◀ ▶ ⏭ o les fletxes).
// Les posicions surten dels snapshots que ja es guarden per al «Desfés», sense
// tocar-los: la partida segueix acabada i no es pot jugar ni desfer.
function startAnalysis() {
  if (!gameOver || analysis) { hideModal('modal-over'); return; }
  analysis = {
    snaps: snapshots.slice(),
    final: { state: Engine.cloneState(game), history: historyPairs, moveLog, lastMove, status: curStatus },
    idx: snapshots.length
  };
  stopAuto();
  hideModal('modal-over');
  $('player-bar').classList.add('hidden');
  $('eb-title').textContent = endInfo ? endInfo.title : 'Fi de la partida';
  $('end-bar').classList.remove('hidden');
  updateEndBar();
  refreshPanels(curStatus);
}
function analysisGoto(i) {
  if (!analysis) return;
  const n = analysis.snaps.length;
  i = Math.max(0, Math.min(n, i));
  const src = i === n ? analysis.final : analysis.snaps[i];
  analysis.idx = i;
  game = Engine.cloneState(src.state);
  historyPairs = src.history;
  moveLog = src.moveLog || [];
  lastMove = src.lastMove;
  selected = -1; selectedMoves = [];
  curStatus = Engine.gameStatus(game);
  clearAllOverlays();
  setLastMove3D(lastMove ? lastMove.from : -1, lastMove ? lastMove.to : -1);
  setCheckSq(curStatus.check ? game.k[game.turn] : -1);
  syncAllPieces();
  refreshPanels(curStatus);
  updateEndBar();
}
function updateEndBar() {
  if (!analysis) return;
  const n = analysis.snaps.length, i = analysis.idx;
  $('eb-label').textContent = 'jugada ' + i + ' / ' + n;
  $('eb-start').disabled = $('eb-back').disabled = i === 0;
  $('eb-fwd').disabled = $('eb-end').disabled = i === n;
}
function leaveAnalysis() {
  analysis = null; endInfo = null;
  const bar = document.getElementById('end-bar');
  if (bar) bar.classList.add('hidden');
}

/* ---------- Entrenador estratègic (fase A: avisos en viu, fase B: explicació) ---------- */
// localStorage pot llençar excepció (finestra privada, iframe amb sandbox, dades
// bloquejades): sense aquest tractament l'error de càrrega aturava tota l'app.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sense emmagatzematge */ } }
};
let coachOn = store.get('eci-coach') !== '0';
const PIECE_NAMES = ['', 'peó', 'cavall', 'alfil', 'torre', 'dama', 'rei'];
const PIECE_ART = ['', 'el peó', 'el cavall', 'l\u2019alfil', 'la torre', 'la dama', 'el rei'];
const NOM_COSTAT = { 1: 'les blanques', '-1': 'les negres' };

function actorLabel(mover) {
  if (settings.mode === 'mm' || settings.mode === 'replay') {
    return mover === Engine.WHITE ? 'Les blanques' : 'Les negres';
  }
  return mover === settings.playerColor ? 'Jugues' : 'La màquina';
}

// B: explicació amable de la jugada acabada de fer (cridar després de make, amb u de l'historial)
function coachMoveHtml(m, mover, u, victimT, moverT, capSq, status) {
  const side = NOM_COSTAT[mover];
  const toSky = (m.to >> 7) === 1;
  let txt;
  if (m.flag === Engine.F_IL) {
    txt = 'enroc internivell: rei i torre intercanvien els nivells.';
  } else if (m.flag === Engine.F_VCAP) {
    const lloc = Engine.sqToStr(capSq);
    if ((capSq >> 7) === 1) {
      txt = 'menja ' + PIECE_ART[victimT] + ' a ' + lloc + ': segona mort.';
    } else {
      txt = 'menja ' + PIECE_ART[victimT] + ' amb foc vertical: la víctima puja com a fantasma de ' +
        side + ' a ' + Engine.sqToStr(u.conv) + '.';
    }
  } else if (m.flag === Engine.F_VERT) {
    txt = PIECE_ART[moverT] + (toSky ? ' puja al Cel a ' : ' baixa a la Terra a ') +
      Engine.sqToStr(m.to) + '.';
  } else if (m.flag === Engine.F_CK || m.flag === Engine.F_CQ) {
    txt = 'enroc ' + (m.flag === Engine.F_CK ? 'curt' : 'llarg') + '.';
  } else if (victimT) {
    const lloc = Engine.sqToStr(capSq >= 0 ? capSq : m.to);
    const convOk = u.conv !== null && u.conv >= 0;
    if (toSky) {
      txt = 'menja ' + PIECE_ART[victimT] + ' a ' + lloc + ': segona mort — surt del joc per sempre.';
    } else if (m.flag === Engine.F_EP) {
      txt = 'captura al pas el peó a ' + lloc + (convOk
        ? ' i pujarà com a fantasma de ' + side + ' a ' + Engine.sqToStr(u.conv) + '.' : '.');
    } else {
      txt = 'menja ' + PIECE_ART[victimT] + ' a ' + lloc + (convOk
        ? ': la víctima puja com a fantasma de ' + side + ' a ' + Engine.sqToStr(u.conv) + '.'
        : ': la víctima es perd definitivament (el cel estava tapat).');
    }
  } else {
    txt = 'mou ' + PIECE_ART[moverT] + ' a ' + Engine.sqToStr(m.to) + '.';
  }
  if (m.promo && m.flag !== Engine.F_VERT) txt += ' Promoció de descens: corona ' + PIECE_NAMES[m.promo] + '.';
  if (status.over && status.result === 'mate') txt += ' Escac i mat!';
  else if (status.check) txt += ' Escac!';
  return '<b>' + actorLabel(mover) + ':</b> ' + txt;
}

// A: avisos en viu per al bàndol que mou + conseqüències de la peça seleccionada
function refreshCoach() {
  const card = $('coach-card');
  if (!card) return;
  $('coach-on').checked = coachOn;
  card.classList.toggle('coach-off', !coachOn);
  const hints = $('coach-hints');
  hints.innerHTML = '';
  if (!coachOn || gameOver) return;
  let side = game.turn;
  if (settings.mode === 'ai' && game.turn !== settings.playerColor) side = 0;
  const items = [];
  if (side === 0) {
    items.push(['⏳', 'La màquina està pensant…', 'ok']);
  } else {
    // avís prioritari: el rei del bàndol que té el torn està en escac
    if (curStatus.check) {
      items.push(['⚠', 'El teu rei està en escac: aquesta jugada ha de treure\u2019l del perill.', 'warn']);
    }
    // oportunitat: enroc internivell apilat
    if (curStatus.moves.some(mv => mv.flag === Engine.F_IL)) {
      items.push(['💡', 'Rei i torre apilats: tens l\u2019enroc internivell disponible.', 'info']);
    }
    // perill: foc vertical sobre peces pròpies (l\u2019escac del rei ja s\u2019ha avisat amunt i aquí)
    let fires = 0;
    for (let sq = 0; sq < 256 && fires < 2; sq++) {
      const p = game.b[sq];
      if (p === 0 || (p > 0 ? 1 : -1) !== side || Math.abs(p) === Engine.KING) continue;
      const at = Engine.verticalAttackers(game, sq, -side);
      if (at.length) {
        items.push(['\u26a0\ufe0f', 'Compte: ' + PIECE_ART[Math.abs(p)] + ' a ' + Engine.sqToStr(sq) +
          ' està sota foc vertical de ' + PIECE_ART[Math.abs(game.b[at[0]])] +
          ' a ' + Engine.sqToStr(at[0]) + '.', 'warn']);
        fires++;
      }
    }
    // conseqüències de les captures de la peça seleccionada
    if (selected >= 0 && selectedMoves.length) {
      let sel = 0;
      for (const mv of selectedMoves) {
        if (sel >= 3) break;
        const conv = Engine.convertsTo(game, mv);
        if (conv >= 0) {
          items.push(['♟', 'Capturant a ' + Engine.sqToStr(mv.to) + ', la víctima pujarà com a fantasma de ' +
            NOM_COSTAT[game.turn] + ' a ' + Engine.sqToStr(conv) + '.', 'info']);
          sel++;
        } else if (mv.flag !== Engine.F_EP && game.b[mv.to] !== 0 && (mv.to >> 7) === 0) {
          items.push(['🚫', 'Capturant a ' + Engine.sqToStr(mv.to) +
            ', la víctima es perd definitivament: el cel està tapat.', 'info']);
          sel++;
        }
        if (game.b[mv.to] !== 0 && (mv.to >> 7) === 1) {
          const def = Engine.verticalAttackers(game, mv.to, -side);
          if (def.length) {
            items.push(['\u26a0\ufe0f', 'Compte: ' + PIECE_ART[Math.abs(game.b[mv.to])] + ' a ' +
              Engine.sqToStr(mv.to) + ' està defensada per foc vertical de ' +
              PIECE_ART[Math.abs(game.b[def[0]])] + ' a ' + Engine.sqToStr(def[0]) + '.', 'warn']);
            sel++;
          }
        }
      }
    }
  }
  if (!items.length) items.push(['✓', 'Cap avís: posició tranquil·la.', 'ok']);
  for (const it of items.slice(0, 6)) {
    const li = document.createElement('li');
    li.className = 'coach-' + it[2];
    li.innerHTML = '<span class="coach-ic">' + it[0] + '</span>' + it[1];
    hints.appendChild(li);
  }
}

/* ---------- Refresc de panels ---------- */
/** @type {(id: string) => any} */
const $ = id => document.getElementById(id);
function refreshPanels(status) {
  curStatus = status || Engine.gameStatus(game);
  const side = game.turn === Engine.WHITE ? 'Blanques' : 'Negres';
  let who = '';
  if (settings.mode === 'ai') who = game.turn === settings.playerColor ? ' (tu)' : ' (m\u00e0quina)';
  let chipText = gameOver ? 'Fi de la partida' : 'Torn: ' + side + who;
  const chip = $('status-chip');
  chip.textContent = chipText;
  chip.classList.toggle('check', !gameOver && curStatus.check);
  $('turn-text').textContent = gameOver ? '—' : side + who;
  $('check-warning').classList.toggle('hidden', gameOver || !curStatus.check);
  $('ai-card').classList.toggle('hidden', settings.mode !== 'ai' && settings.mode !== 'mm');
  const pc = Engine.pieceCounts(game);
  $('heaven-info').textContent = pc.heaven + ' ' + (pc.heaven === 1 ? 'peça' : 'peces') +
    ' · ' + pc.ghosts + ' ' + (pc.ghosts === 1 ? 'fantasma' : 'fantasmes') +
    ' · B' + pc.heavenW + '/N' + pc.heavenB;
  refreshCaptured();
  refreshHistory();
  refresh2D();
  refreshCoach();
  $('btn-undo').disabled = thinking || animLock > 0 || snapshots.length === 0 ||
    gameOver || (settings.mode === 'ai' && game.turn !== settings.playerColor);
  $('btn-resign').disabled = playerActive();
  $('btn-save-game').disabled = savedMoves().length === 0;
  $('thinking').classList.toggle('hidden', !thinking);
  updatePlayerBar();
}
function refreshCaptured() {
  const cnt = { 1: {}, '-1': {} };
  for (const c of [1, -1]) for (const t of [1, 2, 3, 4, 5, 6]) cnt[c][t] = 0;
  for (let sq = 0; sq < 256; sq++) {
    const p = game.b[sq];
    if (p) cnt[p > 0 ? 1 : -1][Math.abs(p)]++;
  }
  const render = (color, elId) => {
    let s = '';
    for (const t of [5, 4, 3, 2, 1]) {
      const missing = Math.max(0, INIT_COUNTS[t] - cnt[color][t]);
      s += (color === 1 ? GLYPH_W : GLYPH_B)[t - 1].repeat(missing);
    }
    $(elId).textContent = s;
  };
  render(1, 'captured-w');
  render(-1, 'captured-b');
}
function refreshHistory() {
  const ol = $('history-list');
  ol.innerHTML = '';
  historyPairs.forEach((pair, i) => {
    const li = document.createElement('li');
    li.innerHTML = '<span class="mvnum">' + (i + 1) + '.</span><span class="mvw">' + pair.w +
      '</span><span class="mvb">' + pair.b + '</span>';
    ol.appendChild(li);
  });
  ol.scrollTop = ol.scrollHeight;
}

/* ---------- Vista 2D ---------- */
function build2D() {
  for (const [gid, lvl] of /** @type {[string, number][]} */ ([['grid2d-n1', 1], ['grid2d-n0', 0]])) {
    const g = $(gid);
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const sq = lvl * 128 + row * 16 + col;
        const d = document.createElement('div');
        d.className = 'sq ' + ((row + col) % 2 === 0 ? 'light' : 'dark');
        d.addEventListener('click', () => onTileClick(sq));
        g.appendChild(d);
        cellEls[sq] = d;
      }
    }
  }
}
function refresh2D() {
  const moveMap = new Map();
  const epVictims = new Set();
  for (const m of selectedMoves) {
    if (m.flag === Engine.F_EP) {
      const moverSign = game.b[m.from] > 0 ? 1 : -1;
      epVictims.add(m.to + (moverSign === 1 ? 16 : -16));
    }
    if (!moveMap.has(m.to)) {
      moveMap.set(m.to, m.flag === Engine.F_VCAP ? 'cap' :
        m.flag === Engine.F_VERT ? 'vert' :
        (game.b[m.to] !== 0 || m.flag === Engine.F_EP) ? 'cap' : 'move');
    }
  }
  const chkSq = (!gameOver && curStatus && curStatus.check) ? game.k[game.turn] : -1;
  for (let sq = 0; sq < 256; sq++) {
    const el = cellEls[sq];
    if (!el) continue;
    const row = (sq >> 4) & 7, col = sq & 15;
    const p = game.b[sq];
    let cls = 'sq ' + ((row + col) % 2 === 0 ? 'light' : 'dark');
    if (p > 0) cls += ' wp'; else if (p < 0) cls += ' bp';
    if (game.gh[sq] === 1) cls += ' gh';
    if (Engine.lvlOf(sq) === 1) cls += ' sky';
    if (selected === sq) cls += ' sel';
    const mm = moveMap.get(sq);
    if (mm) cls += ' ' + mm;
    if (epVictims.has(sq)) cls += ' epv';
    if (lastMove && (sq === lastMove.from || sq === lastMove.to)) cls += ' lastmv';
    if (sq === chkSq) cls += ' chk';
    el.className = cls;
    el.textContent = p ? (p > 0 ? GLYPH_W : GLYPH_B)[Math.abs(p) - 1] : '';
  }
}

/* ---------- Modals i menú ---------- */
function showModal(id) {
  $(id).classList.remove('hidden');
  // el 2D no conviure amb modals de pantalla completa: si n'obrim un, tanquem el 2D
  if (id !== 'view2d') hideModal('view2d');
}
function hideModal(id) { $(id).classList.add('hidden'); }
function toggleModal(id) { $(id).classList.toggle('hidden'); }
let confirmCb = null;
function askConfirm(title, text, okLabel, cb) {
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  $('btn-confirm-ok').textContent = okLabel;
  confirmCb = cb;
  showModal('modal-confirm');
}
function dismissConfirm() { hideModal('modal-confirm'); confirmCb = null; }
function wireSeg(id, cb) {
  const el = $(id);
  el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    el.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    if (cb) cb(b.dataset.v);
  }));
}
function segValue(id) { return (/** @type {HTMLElement} */ (document.querySelector('#' + id + ' button.active'))).dataset.v; }

function wireUI() {
  wireSeg('seg-mode', v => {
    const ai = v === 'ai';
    const mm = v === 'mm';
    $('group-color').classList.toggle('hidden', !ai);
    $('group-diff').classList.toggle('hidden', !(ai || mm));
  });
  wireSeg('seg-color', null);
  wireSeg('seg-diff', v => { $('diff-desc').textContent = DIFF_DESC[v]; });
  wireSeg('seg-promo', null);
  $('diff-desc').textContent = DIFF_DESC[2];

  const startFromMenu = () => {
    settings.mode = segValue('seg-mode');
    const c = segValue('seg-color');
    settings.playerColor = c === 'b' ? Engine.BLACK : c === 'w' ? Engine.WHITE : (Math.random() < 0.5 ? Engine.WHITE : Engine.BLACK);
    settings.difficulty = parseInt(segValue('seg-diff'), 10);
    settings.promo = parseInt(segValue('seg-promo'), 10);
    newGame();
  };
  $('btn-start').addEventListener('click', () => {
    if (started && !gameOver && moveLog.length > 0) {
      askConfirm('Descartar la partida?', 'Hi ha una partida en curs: si en comences una de nova es perdrà. «Continua» torna a la partida actual.', 'Nova partida', startFromMenu);
    } else startFromMenu();
  });
  $('btn-continue').addEventListener('click', () => hideModal('modal-start'));
  $('btn-menu').addEventListener('click', () => {
    $('btn-continue').classList.toggle('hidden', !started || (gameOver && !analysis));
    showModal('modal-start');
  });
  $('btn-menu-rules').addEventListener('click', () => showModal('modal-rules'));
  $('btn-rules').addEventListener('click', () => showModal('modal-rules'));
  $('btn-close-rules').addEventListener('click', () => hideModal('modal-rules'));
  $('btn-undo').addEventListener('click', undo);
  $('btn-view2d').addEventListener('click', () => toggleModal('view2d'));
  $('btn-close2d').addEventListener('click', () => hideModal('view2d'));
  $('view2d').addEventListener('click', e => { if (e.target === $('view2d')) hideModal('view2d'); });
  $('btn-sound').addEventListener('click', () => {
    soundOn = !soundOn;
    $('btn-sound').textContent = soundOn ? '\u{1F50A}' : '\u{1F507}';
  });
  $('coach-on').addEventListener('change', e => {
    coachOn = e.target.checked;
    store.set('eci-coach', coachOn ? '1' : '0');
    refreshPanels(curStatus);
  });
  $('btn-resign').addEventListener('click', resign);
  $('btn-rematch').addEventListener('click', () => newGame());
  $('btn-confirm-ok').addEventListener('click', () => { const cb = confirmCb; dismissConfirm(); if (cb) cb(); });
  $('btn-confirm-cancel').addEventListener('click', dismissConfirm);
  $('btn-over-menu').addEventListener('click', () => {
    hideModal('modal-over');
    $('btn-continue').classList.add('hidden');
    showModal('modal-start');
  });
  // desar / carregar partides i reproductor
  $('btn-save-game').addEventListener('click', saveGameFile);
  $('btn-load-game').addEventListener('click', () => $('game-file').click());
  $('game-file').addEventListener('change', e => {
    const tgt = /** @type {HTMLInputElement} */ (e.target);
    const f = tgt.files && tgt.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => loadGameData(/** @type {string} */ (r.result));
    r.readAsText(f);
    tgt.value = '';
  });
  $('pb-start').addEventListener('click', playerToStart);
  $('pb-back').addEventListener('click', undo);
  $('pb-play').addEventListener('click', toggleAuto);
  $('pb-fwd').addEventListener('click', () => {
    if (settings.mode === 'mm') mmStep(); else replayFwd();
  });
  $('pb-end').addEventListener('click', replayEnd);
  $('pb-close').addEventListener('click', closePlayer);
  // final de partida: analitzar / desar, i barra d'anàlisi
  $('btn-over-analyze').addEventListener('click', startAnalysis);
  $('btn-over-save').addEventListener('click', saveGameFile);
  $('eb-start').addEventListener('click', () => analysisGoto(0));
  $('eb-back').addEventListener('click', () => analysis && analysisGoto(analysis.idx - 1));
  $('eb-fwd').addEventListener('click', () => analysis && analysisGoto(analysis.idx + 1));
  $('eb-end').addEventListener('click', () => analysis && analysisGoto(analysis.snaps.length));
  $('eb-save').addEventListener('click', saveGameFile);
  $('eb-new').addEventListener('click', () => newGame());
  $('eb-menu').addEventListener('click', () => {
    $('btn-continue').classList.remove('hidden'); // «Continua» torna a l'anàlisi
    showModal('modal-start');
  });

  document.addEventListener('keydown', e => {
    if (shortcutBlocked(e)) return;
    // reproductor (només quan cap modal el tapa)
    const anyModal = !$('modal-start').classList.contains('hidden') ||
      !$('modal-over').classList.contains('hidden') ||
      !$('view2d').classList.contains('hidden');
    if (analysis && !anyModal) {
      if (e.key === 'ArrowRight') { e.preventDefault(); analysisGoto(analysis.idx + 1); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); analysisGoto(analysis.idx - 1); return; }
      if (e.key === 'Home') { e.preventDefault(); analysisGoto(0); return; }
      if (e.key === 'End') { e.preventDefault(); analysisGoto(analysis.snaps.length); return; }
    }
    if (playerActive() && !anyModal && !analysis) {
      if (e.key === 'ArrowRight') { e.preventDefault(); if (settings.mode === 'mm') mmStep(); else replayFwd(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); undo(); return; }
      if (e.key === ' ') { e.preventDefault(); toggleAuto(); return; }
      if (e.key === 'Home') { e.preventDefault(); playerToStart(); return; }
      if (e.key === 'End') { e.preventDefault(); if (settings.mode === 'replay') replayEnd(); return; }
    }
    if (e.key === '1') setCameraPreset(1);
    else if (e.key === '2') setCameraPreset(2);
    else if (e.key === '3') setCameraPreset(3);
    else if (e.key === 'Escape') {
      if (!$('modal-confirm').classList.contains('hidden')) dismissConfirm();
      else if (!$('theme-drawer').classList.contains('hidden')) {
        $('theme-drawer').classList.add('hidden');
        $('btn-theme').classList.remove('active');
      }
      else if (!$('modal-rules').classList.contains('hidden')) hideModal('modal-rules');
      else if (!$('view2d').classList.contains('hidden')) hideModal('view2d');
      else if (!$('modal-start').classList.contains('hidden') && started) hideModal('modal-start');
      else if (!$('modal-over').classList.contains('hidden')) startAnalysis();
      else clearSelection();
    } else if (e.key === 'v' || e.key === 'V') {
      $('view2d').classList.toggle('hidden');
    }
  });
}

/* ---------- Arrencada ---------- */
document.addEventListener('DOMContentLoaded', () => {
  buildProtos();
  init3D();
  build2D();
  initWorker();
  wireUI();
  Theme.init();
  syncAllPieces();
  refreshPanels(curStatus);
  updateAiCard(null);
});

export { canControlSq, curStatus, game, gameOver, lastMove, onTileClick, selected, selectedMoves };
