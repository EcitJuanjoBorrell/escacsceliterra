'use strict';
import { getClient, isConfigured } from './supabaseClient.js';

const LOCAL_KEY = 'ecit.localUser';
const TIMEOUT_MS = 12000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const state = {
  status: 'boot',
  mode: null,
  user: null,
  error: null,
  notice: null,
  configured: false
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

function withTimeout(p, ms = TIMEOUT_MS) {
  let t;
  return Promise.race([
    Promise.resolve(p).finally(() => clearTimeout(t)),
    new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'timeout' })), ms); })
  ]);
}

export function validate(email, password, confirm) {
  if (!EMAIL_RE.test(email)) return 'Introdueix un correu vàlid.';
  if (password.length < 8) return 'La contrasenya ha de tenir 8 caràcters com a mínim.';
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) return 'La contrasenya ha de combinar lletres i números.';
  if (confirm !== undefined && password !== confirm) return 'Les contrasenyes no coincideixen.';
  return null;
}

export function passwordScore(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Za-zÀ-ÿ]/.test(pw) && /\d/.test(pw)) s++;
  if (/[^A-Za-z0-9À-ÿ]/.test(pw)) s++;
  return Math.min(4, s);
}

function mapError(err) {
  const raw = String(err?.message || err || '').toLowerCase();
  const code = String(err?.code || '').toLowerCase();
  if (code === 'timeout' || raw.includes('timeout'))
    return 'El servidor no respon. Comprova la connexió o continua sense compte.';
  if (code === 'invalid_credentials' || raw.includes('invalid login'))
    return 'Correu o contrasenya incorrectes.';
  if (code === 'user_already_exists' || code === 'email_exists' || raw.includes('already registered'))
    return "Aquest correu ja té un compte. Prova d'entrar-hi.";
  if (code === 'weak_password' || raw.includes('weak password'))
    return 'Contrasenya massa feble: combina lletres i números, mínim 8 caràcters.';
  if (code === 'email_not_confirmed' || raw.includes('email not confirmed'))
    return "Cal confirmar el correu abans d'entrar. Revisa la safata d'entrada.";
  if (code === 'over_email_send_rate_limit' || raw.includes('rate limit'))
    return 'Massa intents seguits. Espera uns minuts i torna-ho a provar.';
  if (raw.includes('failed to fetch') || raw.includes('networkerror') || raw.includes('load failed'))
    return 'La xarxa o un bloquejador ha impedit la connexió. Pots continuar sense compte.';
  return "No s'ha pogut completar l'operació. Torna-ho a provar.";
}

function adopt(session) {
  if (session?.user) {
    sDel(LOCAL_KEY);
    state.mode = 'cloud';
    state.user = { id: session.user.id, email: session.user.email || '' };
    state.status = 'signed-in';
  } else if (state.mode !== 'local') {
    state.mode = null;
    state.user = null;
    state.status = 'ready';
  }
  emit();
}

async function handleUrl(sb) {
  let url;
  try { url = new URL(window.location.href); } catch { return; }
  const code = url.searchParams.get('code');
  const desc = url.searchParams.get('error_description');
  if (desc) state.notice = desc.replace(/\+/g, ' ');
  if (code) {
    try {
      await withTimeout(sb.auth.exchangeCodeForSession(code));
      state.notice = 'Correu confirmat. Ja pots jugar.';
    } catch (e) { state.error = mapError(e); }
  }
  if (code || desc) {
    ['code', 'error', 'error_code', 'error_description'].forEach(k => url.searchParams.delete(k));
    const q = url.searchParams.toString();
    window.history.replaceState({}, '', url.pathname + (q ? '?' + q : ''));
  }
}

export async function init() {
  const sb = getClient();
  state.configured = !!sb && isConfigured();

  if (!sb) {
    state.status = 'ready';
    state.notice = 'El registre en línia no està configurat en aquest desplegament.';
    restoreLocal();
    emit();
    return;
  }

  try {
    await handleUrl(sb);
    const { data } = await withTimeout(sb.auth.getSession(), 8000);
    if (data?.session) adopt(data.session);
    else restoreLocal();

    sb.auth.onAuthStateChange((_event, session) => { adopt(session); });
  } catch (e) {
    state.error = mapError(e);
    restoreLocal();
  } finally {
    state.status = state.user ? 'signed-in' : 'ready';
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

export async function signIn(email, password) {
  const v = validate(email, password);
  if (v) { state.error = v; emit(); return { ok: false }; }
  const sb = getClient();
  if (!sb) { state.error = 'El registre en línia no està disponible. Continua sense compte.'; emit(); return { ok: false }; }

  state.status = 'busy'; state.error = null; state.notice = null; emit();
  try {
    const { data, error } = await withTimeout(sb.auth.signInWithPassword({ email: email.trim(), password }));
    if (error) throw error;
    adopt(data.session);
    return { ok: true };
  } catch (e) {
    state.error = mapError(e); state.status = 'ready'; emit();
    return { ok: false };
  }
}

export async function signUp(email, password, confirm) {
  const v = validate(email, password, confirm);
  if (v) { state.error = v; emit(); return { ok: false }; }
  const sb = getClient();
  if (!sb) { state.error = 'El registre en línia no està disponible. Continua sense compte.'; emit(); return { ok: false }; }

  state.status = 'busy'; state.error = null; state.notice = null; emit();
  try {
    const { data, error } = await withTimeout(sb.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin + '/' }
    }));
    if (error) throw error;
    if (data.session) { adopt(data.session); return { ok: true, confirmed: true }; }
    state.status = 'ready';
    state.notice = 'Compte creat. Revisa el correu per confirmar-lo i després entra.';
    emit();
    return { ok: true, confirmed: false };
  } catch (e) {
    state.error = mapError(e); state.status = 'ready'; emit();
    return { ok: false };
  }
}

export async function signOut() {
  const sb = getClient();
  state.status = 'busy'; emit();
  try { if (sb) await withTimeout(sb.auth.signOut(), 8000); }
  catch (e) { console.warn('[auth] signOut', e); }
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
    state.error = "El navegador bloqueja l'emmagatzematge local. Activa'l o configura Supabase.";
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
