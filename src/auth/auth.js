'use strict';
import { Clerk } from '@clerk/clerk-js';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const LOCAL_KEY = 'ecit.localUser';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

let clerk = null;
let clerkLoaded = false;

const state = {
  status: 'boot', // boot, ready, signed-in
  mode: null,     // 'cloud' | 'local'
  user: null,
  error: null,
  notice: null
};

const subs = new Set();
function emit() {
  const snap = { ...state };
  subs.forEach(fn => { try { fn(snap); } catch (e) { console.error('[auth] subscriber', e); } });
}
export function getState() { return { ...state }; }
export function subscribe(fn) { subs.add(fn); fn(getState()); return () => subs.delete(fn); }

function sGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function sSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }
function sDel(k) { try { localStorage.removeItem(k); } catch { /* sense storage */ } }

// Inicialització
export async function init() {
  if (!publishableKey || !publishableKey.startsWith('pk_')) {
    state.status = 'ready';
    state.notice = 'Clerk no configurat (manca VITE_CLERK_PUBLISHABLE_KEY). Mode local disponible.';
    restoreLocal();
    emit();
    return;
  }

  try {
    clerk = new Clerk(publishableKey);
    await clerk.load();
    clerkLoaded = true;

    // Escoltar canvis d'estat de Clerk (login/logout en altre pestanya)
    clerk.addListener(({ user }) => {
      if (user) {
        sDel(LOCAL_KEY);
        state.mode = 'cloud';
        state.user = { id: user.id, email: user.primaryEmailAddress?.emailAddress || 'sense correu' };
        state.status = 'signed-in';
      } else {
        state.mode = null;
        state.user = null;
        state.status = 'ready';
      }
      emit();
    });

    if (clerk.user) {
      state.mode = 'cloud';
      state.user = { id: clerk.user.id, email: clerk.user.primaryEmailAddress?.emailAddress || 'sense correu' };
      state.status = 'signed-in';
    } else {
      restoreLocal();
    }
  } catch (e) {
    console.error('[auth] Clerk load error:', e);
    state.error = 'Error de connexió amb el servei d\'autenticació.';
    state.status = 'ready';
    restoreLocal();
  } finally {
    emit();
  }
}

function restoreLocal() {
  const raw = sGet(LOCAL_KEY);
  if (!raw) return;
  try {
    const u = JSON.parse(raw);
    if (u?.email) {
      state.mode = 'local';
      state.user = { id: 'local:' + u.email, email: u.email };
      state.status = 'signed-in';
    }
  } catch { sDel(LOCAL_KEY); }
}

// Accions
export function openSignIn() {
  if (!clerkLoaded) return;
  clerk.openSignIn({
    appearance: { variables: { colorPrimary: '#4fc3f7' } }
  });
}

export function openSignUp() {
  if (!clerkLoaded) return;
  clerk.openSignUp({
    appearance: { variables: { colorPrimary: '#4fc3f7' } }
  });
}

export async function signOut() {
  state.status = 'busy'; emit();
  try {
    if (clerkLoaded) await clerk.signOut();
  } catch (e) { console.warn('[auth] signOut error', e); }
  finally {
    sDel(LOCAL_KEY);
    state.mode = null; state.user = null;
    state.error = null; state.notice = 'Sessió tancada.';
    state.status = 'ready';
    emit();
  }
}

export function continueLocal(email) {
  const mail = (email || '').trim();
  if (!EMAIL_RE.test(mail)) { state.error = 'Introdueix un correu vàlid per identificar-te.'; emit(); return false; }
  if (!sSet(LOCAL_KEY, JSON.stringify({ email: mail, at: Date.now() }))) {
    state.error = 'El navegador bloqueja l\'emmagatzematge local.';
    emit(); return false;
  }
  state.mode = 'local';
  state.user = { id: 'local:' + mail, email: mail };
  state.error = null;
  state.notice = 'Sessió local: només val en aquest navegador.';
  state.status = 'signed-in';
  emit();
  return true;
}

export function clearMessages() { state.error = null; state.notice = null; emit(); }
