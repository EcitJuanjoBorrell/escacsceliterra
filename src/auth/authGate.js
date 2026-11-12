'use strict';
import * as Auth from './auth.js';

const $ = id => document.getElementById(id);
let booted = false;
let lastFocus = null;

function appEl() { return $('app'); }

function setInert(on) {
  const a = appEl();
  if (!a) return;
  if (on) { a.setAttribute('inert', ''); a.setAttribute('aria-hidden', 'true'); }
  else { a.removeAttribute('inert'); a.removeAttribute('aria-hidden'); }
}

function statusBox(s) {
  const el = $('auth-status');
  if (!el) return;
  let kind = '', text = '';
  if (s.status === 'boot') { kind = 'is-busy'; text = 'Comprovant la sessió…'; }
  else if (s.status === 'busy') { kind = 'is-busy'; text = 'Connectant…'; }
  else if (s.error) { kind = 'is-error'; text = s.error; }
  else if (s.notice) { kind = 'is-notice'; text = s.notice; }
  el.className = 'auth-status' + (kind ? ' ' + kind : '');
  el.textContent = text;
  el.hidden = !text;
}

function render(s) {
  const gate = $('auth-gate'), chip = $('user-chip');
  if (!gate) return;
  const inside = s.status === 'signed-in';

  if (inside) {
    if (!gate.hidden) lastFocus = document.activeElement;
    gate.hidden = true;
    setInert(false);
    const app = appEl();
    if (app) app.style.display = '';
    if (chip) {
      chip.hidden = false;
      $('user-chip-mail').textContent = s.user?.email || '';
      const dot = $('user-chip-dot');
      dot.dataset.mode = s.mode || 'local';
      dot.title = s.mode === 'cloud' ? 'Sessió en línia (qualsevol navegador)' : 'Sessió local (només aquest navegador)';
      $('user-chip-mode').textContent = s.mode === 'cloud' ? 'en línia' : 'local';
    }
    return;
  }

  if (chip) chip.hidden = true;
  const wasHidden = gate.hidden;
  gate.hidden = false;
  setInert(true);
  const app = appEl();
  if (app) app.style.display = 'none';
  statusBox(s);

  const busy = s.status === 'busy' || s.status === 'boot';
  gate.querySelectorAll('input, button').forEach(el => {
    if (el.id === 'auth-local') el.disabled = busy;
    else el.disabled = busy;
  });
  gate.classList.toggle('is-busy', busy);

  const note = $('auth-mode-note');
  if (note) {
    note.textContent = s.configured
      ? 'El compte en línia et deixa entrar des de qualsevol navegador.'
      : 'Registre en línia no disponible en aquest desplegament.';
  }
  const localBtn = $('auth-local');
  if (localBtn) localBtn.hidden = false;

  if (wasHidden || !gate.contains(document.activeElement)) {
    const first = gate.querySelector('.auth-form:not([hidden]) input');
    if (first) setTimeout(() => first.focus(), 30);
  }
}

function switchTab(which) {
  Auth.clearMessages();
  ['in', 'up'].forEach(k => {
    const tab = $('tab-' + k), panel = $('panel-' + k);
    const on = k === which;
    tab.classList.toggle('is-active', on);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    panel.hidden = !on;
  });
  const first = $('panel-' + which).querySelector('input');
  if (first) first.focus();
}

function wireStrength() {
  const pw = $('up-password'), bar = $('up-strength'), lbl = $('up-strength-label');
  if (!pw || !bar) return;
  const LABELS = ['—', 'feble', 'acceptable', 'bona', 'forta'];
  pw.addEventListener('input', () => {
    const n = Auth.passwordScore(pw.value);
    bar.dataset.score = String(n);
    lbl.textContent = pw.value ? LABELS[n] : '—';
  });
}

function wireReveal() {
  document.querySelectorAll('[data-reveal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = $(btn.dataset.reveal);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(show));
      btn.textContent = show ? '🙈' : '👁';
      input.focus();
    });
  });
}

function trapFocus(e) {
  const gate = $('auth-gate');
  if (!gate || gate.hidden || e.key !== 'Tab') return;
  const f = [...gate.querySelectorAll('a[href],button:not([disabled]),input:not([disabled])')]
    .filter(el => el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export function initAuthGate() {
  if (booted) return;
  booted = true;

  const gate = $('auth-gate');
  if (!gate) { console.warn('[auth] #auth-gate no existeix: auth no s'inicialitza.'); return; }

  $('tab-in').addEventListener('click', () => switchTab('in'));
  $('tab-up').addEventListener('click', () => switchTab('up'));

  $('panel-in').addEventListener('submit', async e => {
    e.preventDefault();
    await Auth.signIn($('in-email').value, $('in-password').value);
  });

  $('panel-up').addEventListener('submit', async e => {
    e.preventDefault();
    const r = await Auth.signUp($('up-email').value, $('up-password').value, $('up-confirm').value);
    if (r.ok && !r.confirmed) { $('in-email').value = $('up-email').value; switchTab('in'); }
  });

  $('auth-local').addEventListener('click', () => {
    const mail = $('panel-up').hidden ? $('in-email').value : $('up-email').value;
    Auth.continueLocal(mail);
  });

  $('user-chip-out')?.addEventListener('click', () => Auth.signOut());

  wireReveal();
  wireStrength();
  document.addEventListener('keydown', trapFocus);

  Auth.subscribe(render);
  Auth.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuthGate, { once: true });
} else {
  initAuthGate();
}
