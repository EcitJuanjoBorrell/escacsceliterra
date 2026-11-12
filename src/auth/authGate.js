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
    if (app) app.style.display = ''; // MOSTRA EL JOC
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
  if (app) app.style.display = 'none'; // AMAGA EL JOC
  statusBox(s);

  const busy = s.status === 'busy' || s.status === 'boot';
  gate.querySelectorAll('button').forEach(el => { el.disabled = busy; });
  gate.classList.toggle('is-busy', busy);

  if (wasHidden || !gate.contains(document.activeElement)) {
    const first = gate.querySelector('button:not([disabled])');
    if (first) setTimeout(() => first.focus(), 30);
  }
}

export function initAuthGate() {
  if (booted) return;
  booted = true;

  const gate = $('auth-gate');
  if (!gate) { console.warn('[auth] #auth-gate no existeix.'); return; }

  // Botons amb els IDs CORRECTES de l'HTML
  const btnLogin = $('tab-in');
  const btnSignup = $('tab-up');
  const btnLogout = $('user-chip-out');

  // Afegir listeners només si els elements existeixen (seguretat anti-crash)
  if (btnLogin) btnLogin.addEventListener('click', () => Auth.goToSignIn());
  if (btnSignup) btnSignup.addEventListener('click', () => Auth.goToSignUp());

  if (btnLogout) btnLogout.addEventListener('click', () => Auth.signOut());

  // Trap focus per accessibilitat
  document.addEventListener('keydown', (e) => {
    if (!gate || gate.hidden || e.key !== 'Tab') return;
    const f = [...gate.querySelectorAll('button:not([disabled])')].filter(el => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  Auth.subscribe(render);
  Auth.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuthGate, { once: true });
} else {
  initAuthGate();
}
