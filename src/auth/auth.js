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
  console.log('[auth] init() start');

  if (!publishableKey || !publishableKey.startsWith('pk_')) {
    console.error('[auth] Missing publishable key');
    state.status = 'ready';
    state.error = 'Clerk no configurat (manca VITE_CLERK_PUBLISHABLE_KEY).';
    emit();
    return;
  }

  try {
    clerk = new Clerk(publishableKey);
    console.log('[auth] Clerk instance created, loading...');
    await clerk.load();
    clerkLoaded = true;
    console.log('[auth] Clerk loaded. User:', clerk.user ? clerk.user.id : 'null');

    // Escoltar canvis d'estat
    clerk.addListener(({ user }) => {
      console.log('[auth] Clerk listener fired. User:', user ? user.id : 'null');
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

    // Estat inicial
    if (clerk.user) {
      console.log('[auth] Initial user detected:', clerk.user.id);
      state.mode = 'cloud';
      state.user = { id: clerk.user.id, email: clerk.user.primaryEmailAddress?.emailAddress || 'sense correu' };
      state.status = 'signed-in';
    } else {
      console.log('[auth] No initial user, showing gate');
      state.status = 'ready';
    }
  } catch (e) {
    console.error('[auth] Clerk load error:', e);
    state.error = 'Error de connexió amb el servei d\'autenticació.';
    state.status = 'ready';
  } finally {
    console.log('[auth] init() complete. Final status:', state.status);
    emit();
  }
}

export function goToSignIn() {
  if (!clerkLoaded) return;
  clerk.redirectToSignIn({ returnBackUrl: window.location.href });
}

export function goToSignUp() {
  if (!clerkLoaded) return;
  clerk.redirectToSignUp({ returnBackUrl: window.location.href });
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
