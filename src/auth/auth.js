'use strict';
import { Clerk } from '@clerk/clerk-js';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

let clerk = null;
let clerkLoaded = false;

const state = {
  status: 'boot',
  mode: null,
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

export async function init() {
  if (!publishableKey || !publishableKey.startsWith('pk_')) {
    state.status = 'ready';
    state.error = 'Clerk no configurat (manca VITE_CLERK_PUBLISHABLE_KEY).';
    emit();
    return;
  }

  try {
    clerk = new Clerk(publishableKey);
    await clerk.load({ ui: true });
    clerkLoaded = true;

    clerk.addListener(({ user }) => {
      if (user) {
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
      state.status = 'ready';
    }
  } catch (e) {
    console.error('[auth] Clerk load error:', e);
    state.error = 'Error de connexió amb el servei d\'autenticació.';
    state.status = 'ready';
  } finally {
    emit();
  }
}

export function mountSignIn() {
  if (!clerkLoaded) return;
  const container = document.getElementById('clerk-container');
  if (!container) return;
  container.innerHTML = '';
  clerk.mountSignIn(container, {
    appearance: { variables: { colorPrimary: '#4fc3f7' } }
  });
}

export function mountSignUp() {
  if (!clerkLoaded) return;
  const container = document.getElementById('clerk-container');
  if (!container) return;
  container.innerHTML = '';
  clerk.mountSignUp(container, {
    appearance: { variables: { colorPrimary: '#4fc3f7' } }
  });
}

export async function signOut() {
  state.status = 'busy'; emit();
  try {
    if (clerkLoaded) await clerk.signOut();
  } catch (e) { console.warn('[auth] signOut error', e); }
  finally {
    state.mode = null; state.user = null;
    state.error = null; state.notice = 'Sessió tancada.';
    state.status = 'ready';
    emit();
  }
}

export function clearMessages() { state.error = null; state.notice = null; emit(); }
