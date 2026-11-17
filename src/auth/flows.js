'use strict';

import { ensureProfile } from './profile.js';
import { canSendOtp, otpError, setResendDeadline } from './authBoot.js';
import { log as logSignUp, settle, reason as signUpReason, snapshot, isConsumed, needsProtect, emailVerified } from "./signupRequirements.js";

let injected = null;

export function setClerkInstance(c) {
  injected = c || null;
}

export function getClerk() {
  return injected || (typeof window !== 'undefined' ? window.Clerk : null) || null;
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const unavailable = () => ({
  ok: false,
  code: 'clerk_unavailable',
  field: null,
  message: 'El sistema de comptes encara no està llest. Espera un moment i torna-ho a provar.'
});

export async function clearSession() {
  const clerk = getClerk();
  if (!clerk) return;
  try { await clerk.setActive({ session: null }); } catch { /* No hi havia cap sessió activa. */ }
  try { await clerk.reload?.(); } catch { /* La recàrrega és opcional. */ }
}

export async function activateSession(sessionId) {
  const clerk = getClerk();
  if (!clerk || !sessionId) return false;
  try {
    await clerk.setActive({ session: sessionId });
    await wait(500);
    await clerk.reload?.();
    if (clerk.user) void ensureProfile(clerk.user);
    return true;
  } catch (error) {
    console.error('[auth] No s’ha pogut activar la sessió:', error);
    return false;
  }
}

const ERRORS = {
  form_identifier_not_found: { field: 'email', message: 'No hi ha cap compte amb aquest correu.' },
  form_identifier_invalid: { field: 'email', message: 'Clerk no accepta aquest correu com a identificador. Escriu-lo sencer, sense espais.' },
  form_param_format_invalid: { field: 'email', message: 'El format del correu no és vàlid.' },
  form_password_incorrect: { field: 'password', message: 'La contrasenya no és correcta.' },
  form_identifier_exists: { field: 'email', message: 'Aquest correu ja té un compte. Prova d’entrar-hi.' },
  form_password_length_too_short: { field: 'password', message: 'La contrasenya és massa curta.' },
  form_password_pwned: { field: 'password', message: 'Aquesta contrasenya apareix en filtracions públiques. Tria’n una altra.' },
  form_password_no_lowercase: { field: 'password', message: 'La contrasenya ha de contenir alguna lletra minúscula.' },
  form_password_no_uppercase: { field: 'password', message: 'La contrasenya ha de contenir alguna lletra majúscula.' },
  form_password_no_number: { field: 'password', message: 'La contrasenya ha de contenir algun número.' },
  form_code_incorrect: { field: 'code', message: 'El codi no és correcte. Revisa’l o demana’n un de nou.' },
  verification_expired: { field: 'code', message: 'El codi ha caducat. Demana’n un de nou.' },
  too_many_requests: { field: null, message: 'Massa intents seguits. Espera uns segons i torna-ho a provar.' },
  session_exists: { field: null, message: 'Ja estàs identificat.' }
};

export function mapError(error) {
  const first = error?.errors?.[0];
  const code = first?.code || '';
  const known = ERRORS[code];
  return {
    code,
    field: known?.field || null,
    message: known?.message || first?.longMessage || first?.message ||
      error?.message || 'No s’ha pogut completar l’operació. Torna-ho a provar.'
  };
}

export function passwordMin() {
  const length = getClerk()?.environment?.userSettings?.passwordSettings?.min_length;
  return Number.isInteger(length) && length > 0 ? length : 8;
}

export function googleAvailable() {
  const factors = getClerk()?.client?.signIn?.supportedFirstFactors;
  return !Array.isArray(factors) || factors.length === 0 ||
    factors.some(factor => factor?.strategy === 'oauth_google');
}

function failure(error) {
  return { ok: false, ...mapError(error) };
}

async function finishSignIn(signIn) {
  if (signIn?.status !== 'complete' || !signIn.createdSessionId) {
    return {
      ok: false,
      code: 'additional_verification_required',
      field: null,
      message: 'Aquest compte necessita una verificació addicional. Prova el flux estàndard de Clerk.'
    };
  }
  if (!await activateSession(signIn.createdSessionId)) {
    return {
      ok: false,
      code: 'session_activation_failed',
      field: null,
      message: 'No s’ha pogut activar la sessió. Torna-ho a provar.'
    };
  }
  return { ok: true };
}

export async function loginWithPassword({ identifier, password }) {
  const clerk = getClerk();
  if (!clerk) return unavailable();
  const id = String(identifier || '').trim();
  if (!id) {
    return { ok: false, field: 'email', message: 'Escriu el correu o el nom d’usuari.' };
  }

  try {
    await clearSession();
    const signIn = getClerk()?.client?.signIn;
    if (!signIn) return unavailable();

    const attempt = await signIn.create({
      identifier: id,
      password,
      strategy: 'password'
    });
    console.info('[auth] signIn status', attempt.status);
    return await finishSignIn(attempt);
  } catch (error) {
    const first = error?.errors?.[0] || null;
    console.error('[auth] Error d’inici de sessió:', first?.code || error);

    if (first?.code === 'form_param_format_invalid' && first?.meta?.paramName === 'identifier') {
      return {
        ok: false,
        field: 'email',
        message: 'Aquest identificador no és acceptat. Prova amb el nom d’usuari, o activa el correu com a identificador d’entrada al panell de Clerk.'
      };
    }
    if (first?.code === 'form_identifier_not_found') {
      return { ok: false, field: 'email', message: 'No hi ha cap compte amb aquest identificador.' };
    }
    if (first?.code === 'form_password_incorrect') {
      return { ok: false, field: 'password', message: 'La contrasenya no és correcta.' };
    }
    return failure(error);
  }
}

export async function startSignup({ email, password, displayName = '' }) {
  const clerk = getClerk();
  if (!clerk) return unavailable();
  const getSignUp = () => getClerk()?.client?.signUp;
  const ctx = { email: email.trim(), displayName };

  if (!canSendOtp(ctx.email, 30000)) {
    return { ok: false, message: "Ja s'ha enviat un codi fa poc. Espera uns segons." };
  }

  try {
    await clearSession();
    const signUp = getSignUp();
    if (!signUp) return unavailable();

    const params = {
      emailAddress: ctx.email,
      password,
      ...(displayName.trim() ? { unsafeMetadata: { display_name: displayName.trim() } } : {})
    };

    const created = await signUp.create(params);
    logSignUp("després de create", created);

    // Omple camps obligatoris derivables ABANS de demanar el codi.
    const pre = await settle(getSignUp, ctx);
    if (pre.done) {
      const s = pre.snapshot || snapshot(getSignUp());
      if (s?.sessionId) await activateSession(s.sessionId);
      return { ok: true, step: 'done', userId: s?.userId };
    }

    try {
      await getSignUp().prepareEmailAddressVerification({ strategy: 'email_code' });
    } catch (error) {
      console.error('[auth] Error preparant verificació:', error);
      const info = otpError(error);
      if (info.cooldown) setResendDeadline(Date.now() + info.cooldown);
      return { ok: false, message: info.message };
    }
    logSignUp("codi enviat", getSignUp());
    setResendDeadline(Date.now() + 30000);
    return { ok: true, step: 'verify', email: ctx.email };

  } catch (error) {
    console.error('[auth] Error en crear el compte:', error);
    return failure(error);
  }
}

export async function verifySignupCode(code) {
  const clerk = getClerk();
  if (!clerk) return unavailable();
  const getSignUp = () => getClerk()?.client?.signUp;
  const su = getSignUp();
  if (!su) return unavailable();
  const ctx = { email: su.emailAddress || '', displayName: su.unsafeMetadata?.display_name || '' };

  // Si el correu JA està verificat, no tornis a enviar el codi: Clerk el té
  // consumit i respondria "Incorrect code", que és un missatge fals.
  if (!emailVerified(su)) {
    try {
      const returned = await su.attemptEmailAddressVerification({ code });
      logSignUp("attempt retorn", returned);
      if (returned?.status === 'complete') {
        if (returned.createdSessionId) await activateSession(returned.createdSessionId);
        return { ok: true, userId: returned.createdUserId };
      }
    } catch (error) {
      const first = error?.errors?.[0] || null;
      console.error('[auth] Error en verificar el correu:', first?.code || error);
      if (!/already_verified|already been verified/i.test(first?.code + ' ' + (first?.longMessage || ''))) {
        const info = otpError(error);
        if (info.cooldown) setResendDeadline(Date.now() + info.cooldown);
        return { ok: false, message: info.message };
      }
    }
  } else {
    console.info('[auth] correu ja verificat, no es reenvia el codi');
  }

  logSignUp("client.signUp després", getSignUp());

  const c = getClerk();
  if (c?.session?.id && c?.user) return { ok: true, userId: c.user.id };

  if (isConsumed(getSignUp())) {
    try { await c?.reload?.(); } catch (e) { /* opcional */ }
    const c2 = getClerk();
    if (c2?.session?.id && c2?.user) return { ok: true, userId: c2.user.id };
  }

  const after = await settle(getSignUp, ctx);
  if (after.done) {
    const t = after.snapshot || snapshot(getSignUp());
    if (t?.sessionId) await activateSession(t.sessionId);
    return { ok: true, userId: t?.userId };
  }
  if (after.consumed) {
    const c3 = getClerk();
    if (c3?.session?.id && c3?.user) return { ok: true, userId: c3.user.id };
  }
  if (after.protect || needsProtect(getSignUp())) {
    return { ok: false, code: 'protect_check', message: after.reason || signUpReason(getSignUp()) };
  }
  return { ok: false, message: after.reason || signUpReason(getSignUp()) };
}

export async function resendSignupCode(email) {
  const clerk = getClerk();
  if (!clerk) return unavailable();
  const getSignUp = () => getClerk()?.client?.signUp;
  const su = getSignUp();
  if (!su) return unavailable();
  const ctx = { email: (email || su.emailAddress || '').trim(), displayName: su.unsafeMetadata?.display_name || '' };

  const s = logSignUp("abans de reenviar", su);

  // Si l'email JA està verificat, reenviar és un error de Clerk: tanca requisits.
  if (s?.emailStatus === 'verified') {
    const r = await settle(getSignUp, ctx);
    if (r.done) {
      const t = r.snapshot || snapshot(getSignUp());
      if (t?.sessionId) await activateSession(t.sessionId);
      return { ok: true, step: 'done', userId: t?.userId };
    }
    return { ok: false, message: r.reason || signUpReason(getSignUp()) };
  }

  if (!canSendOtp(ctx.email, 30000)) {
    return { ok: false, message: "Ja s'ha enviat un codi fa poc. Espera uns segons." };
  }

  try {
    await su.prepareEmailAddressVerification({ strategy: 'email_code' });
    setResendDeadline(Date.now() + 30000);
    return { ok: true };
  } catch (error) {
    console.error('[auth] Error en reenviar el codi:', error);
    const info = otpError(error);
    if (info.cooldown) setResendDeadline(Date.now() + info.cooldown);
    return { ok: false, message: info.message };
  }
}

export async function startGoogle(mode) {
  const clerk = getClerk();
  const client = clerk?.client;
  if (!client) return unavailable();
  try {
    const flow = mode === 'signup' ? client.signUp : client.signIn;
    if (!flow?.authenticateWithRedirect) return unavailable();
    const url = window.location.href;
    await flow.authenticateWithRedirect({
      strategy: 'oauth_google',
      redirectUrl: url,
      redirectUrlComplete: url
    });
    return { ok: true };
  } catch (error) {
    console.error('[auth] Error en iniciar sessió amb Google:', error);
    return failure(error);
  }
}

export async function startPasswordReset(email) {
  const signIn = getClerk()?.client?.signIn;
  if (!signIn) return unavailable();
  try {
    await clearSession();
    if (!canSendOtp(email, 30000)) {
      return { ok: false, message: "Ja s'ha enviat un codi fa poc. Espera uns segons." };
    }
    await signIn.create({ identifier: email.trim() });
    await signIn.prepareFirstFactor({ strategy: 'reset_password_email_code' });
    setResendDeadline(Date.now() + 30000);
    return { ok: true };
  } catch (error) {
    console.error('[auth] Error en iniciar la recuperació de contrasenya:', error);
    return failure(error);
  }
}

export async function completePasswordReset({ code, password }) {
  const signIn = getClerk()?.client?.signIn;
  if (!signIn) return unavailable();
  try {
    const result = await signIn.attemptFirstFactor({
      strategy: 'reset_password_email_code',
      code
    });
    if (result?.status !== 'needs_new_password') {
      return failure({ errors: [{ code: 'form_code_incorrect' }] });
    }
    const completed = await signIn.resetPassword({ password });
    return await finishSignIn(completed);
  } catch (error) {
    console.error('[auth] Error en canviar la contrasenya:', error);
    return failure(error);
  }
}
