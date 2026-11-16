// src/auth/authBoot.js
'use strict';
/* ============================================================
   Arrencada d'auth sense parpelleig ni flashing.
   Tres responsabilitats, totes idempotents i sense dependre de
   la implementació interna d'authPanel.js:

   1. Porta d'estat a <html data-auth-state>: el joc no es pinta
      fins que la sessió està resoltes (adéu als 300 ms del modal).
   2. Comptador de reenviament que NOMÉS muta text/disabled.
      Mai crida render(), mai afegeix listeners, mai duplica timers.
   3. Guàrdia d'enviament d'OTP + focus estable entre re-renderitzats.
   ============================================================ */

const HTML = document.documentElement;
const SEL_RESEND = '[data-act="resend"],[data-resend]';
const SEL_PANEL = '#auth-panel-mounted,#auth-panel';

/* ---------- 1. Porta d'estat ---------- */
let authState = HTML.dataset.authState || 'pending';
export function setAuthState(next) {
  if (authState === next) return;
  authState = next;
  HTML.dataset.authState = next;
}
export function getAuthState() { return authState; }

/* ---------- 2. Comptador de reenviament ---------- */
let tickHandle = null;
let deadline = 0;
let lastText = null;
let lastDisabled = null;

function resendNode() {
  const panel = document.querySelector(SEL_PANEL);
  return panel ? panel.querySelector(SEL_RESEND) : null;
}

function tick() {
  const node = resendNode();
  if (!node) return;                       // el pas actual no té reenviament
  const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const text = left > 0 ? `Reenviar el codi (${left}s)` : 'Reenviar el codi';
  const disabled = left > 0;
  // Escriure NOMÉS si el valor canvia: evita reflow i percepció de parpelleig.
  if (text !== lastText) { node.textContent = text; lastText = text; }
  if (disabled !== lastDisabled) { node.disabled = disabled; lastDisabled = disabled; }
  if (left === 0) stopResendTicker();       // un sol tick final, no un bucle viu
}

export function setResendDeadline(ts) {
  deadline = Number(ts) || 0;
  lastText = null; lastDisabled = null;     // força la primera escriptura
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = null;
  tick();
  if (deadline > Date.now()) tickHandle = setInterval(tick, 1000);
}
export function stopResendTicker() {
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
}
export function resendRemaining() {
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

/* ---------- 3a. Guàrdia d'enviament d'OTP ---------- */
const sentAt = new Map();
/** true només si NO s'ha enviat un codi per a aquesta clau dins la cooldown. */
export function canSendOtp(key, cooldownMs = 30000) {
  const k = String(key || 'default').toLowerCase();
  const now = Date.now();
  if (now - (sentAt.get(k) || 0) < cooldownMs) return false;
  sentAt.set(k, now);
  return true;
}
export function forgetOtp(key) { sentAt.delete(String(key || 'default').toLowerCase()); }

/** Tradueix els errors d'OTP de Clerk, inclòs el límit de peticions. */
export function otpError(err) {
  const e = (err && err.errors && err.errors[0]) || {};
  const code = String(e.code || '');
  if (err && err.status === 429 || /too_many|rate_limit|resend_limit|captcha/i.test(code)) {
    return {
      message: 'Has demanat massa codis seguits. Espera un minut i torna-ho a provar.',
      cooldown: 60000
    };
  }
  if (/form_code_incorrect|incorrect_code/i.test(code)) {
    return { message: 'El codi no és correcte. Revisa el correu i torna-ho a escriure.', cooldown: 0 };
  }
  if (/expired/i.test(code)) {
    return { message: 'El codi ha caducat. Demana\'n un de nou.', cooldown: 0 };
  }
  return { message: e.longMessage || e.message || 'No s\'ha pogut verificar el codi.', cooldown: 0 };
}

/* ---------- 3b. Focus estable entre re-renderitzats ---------- */
let focusMemo = null;
function inputKey(el) {
  return el.id ? '#' + el.id
    : el.name ? `[name="${el.name}"]`
    : el.dataset.otpIndex != null ? `[data-otp-index="${el.dataset.otpIndex}"]`
    : null;
}
document.addEventListener('focusin', ev => {
  const el = ev.target;
  if (!el || !el.closest || !el.closest(SEL_PANEL)) { focusMemo = null; return; }
  if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') { focusMemo = null; return; }
  const key = inputKey(el);
  if (!key) { focusMemo = null; return; }
  let a = null, b = null;
  try { a = el.selectionStart; b = el.selectionEnd; } catch (_) { /* type=email */ }
  focusMemo = { key, a, b };
}, true);

let restoreQueued = false;
function restoreFocus() {
  if (!focusMemo || restoreQueued) return;
  const panel = document.querySelector(SEL_PANEL);
  if (!panel) return;
  const active = document.activeElement;
  if (active && active !== document.body && panel.contains(active)) return;
  restoreQueued = true;
  requestAnimationFrame(() => {
    restoreQueued = false;
    const p = document.querySelector(SEL_PANEL);
    if (!p || !focusMemo) return;
    const el = p.querySelector(focusMemo.key);
    if (!el || el.disabled) return;
    el.focus({ preventScroll: true });
    if (focusMemo.a != null) {
      try { el.setSelectionRange(focusMemo.a, focusMemo.b); } catch (_) { /* noop */ }
    }
  });
}

/* ---------- Vincle amb Clerk i el gate ---------- */
let bound = false;
let observer = null;
let failsafe = null;

function readUser(c) {
  try { return c && c.user ? c.user : null; } catch (_) { return null; }
}

export function bindClerk(clerk) {
  if (bound || !clerk) return;
  bound = true;
  if (failsafe) { clearTimeout(failsafe); failsafe = null; }
  setAuthState(readUser(clerk) ? 'in' : 'out');
  try {
    clerk.addListener(payload => {
      const user = payload && 'user' in payload ? payload.user : readUser(clerk);
      setAuthState(user ? 'in' : 'out');
      if (!user) { stopResendTicker(); focusMemo = null; }
    });
  } catch (_) { /* SDK sense addListener: el gate observer cobreix */ }
}

/** Reinicia el panell en tancar sessió: sense timers ni focus residuals. */
export function resetAuthBoot() {
  stopResendTicker();
  deadline = 0; lastText = null; lastDisabled = null;
  focusMemo = null;
  sentAt.clear();
}

export function initAuthBoot() {
  if (!HTML.dataset.authState) HTML.dataset.authState = 'pending';

  // Senyal secundari robust: si el gate s'amaga, la sessió és dins.
  const gate = document.getElementById('auth-gate');
  if (gate && !observer) {
    observer = new MutationObserver(() => {
      const hidden = gate.classList.contains('hidden') || gate.hasAttribute('hidden');
      if (hidden) setAuthState('in');
      restoreFocus();
    });
    observer.observe(gate, { attributes: true, attributeFilter: ['class', 'hidden'] });
  }

  // Si Clerk substitueix el DOM del panell, recuperem el focus i el comptador.
  const panel = document.querySelector(SEL_PANEL);
  if (panel && !panel.dataset.bootObserved) {
    panel.dataset.bootObserved = '1';
    new MutationObserver(() => {
      restoreFocus();
      if (deadline > Date.now()) { lastText = null; lastDisabled = null; tick(); }
    }).observe(panel, { childList: true, subtree: true });
  }

  if (window.clerk) bindClerk(window.clerk);

  // Mai deixar l'app oculta per sempre: si Clerk no resol, mostrem el login.
  if (!failsafe) {
    failsafe = setTimeout(() => {
      failsafe = null;
      if (authState === 'pending') setAuthState('out');
    }, 6000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuthBoot, { once: true });
} else {
  initAuthBoot();
}