// src/auth/signupRequirements.js
'use strict';
/* Convergeix un SignUp de Clerk cap a "complete".
   No importa res de flows.js (sense cicles). Només inspecciona i actualitza
   el recurs SignUp. L'activació de sessió la fa flows.js.

   Motiu d'existir: un codi d'email CORRECTE pot deixar el SignUp en
   "missing_requirements" si la instància de Clerk exigeix camps extra
   (username, first_name, last_name...). En aquest cas el codi NO és dolent
   i dir-li a l'usuari "codi no vàlid" és fals. */

const FILLABLE = ["username", "first_name", "last_name", "firstName", "lastName"];

export function snapshot(su) {
  if (!su) return null;
  const email = su.verifications?.emailAddress || null;
  return {
    status: su.status ?? null,
    missing: Array.isArray(su.missingFields) ? [...su.missingFields] : [],
    unverified: Array.isArray(su.unverifiedFields) ? [...su.unverifiedFields] : [],
    required: Array.isArray(su.requiredFields) ? [...su.requiredFields] : [],
    emailStatus: email?.status ?? null,
    emailStrategy: email?.strategy ?? null,
    emailError: email?.error?.code ?? null,
    sessionId: su.createdSessionId ?? null,
    userId: su.createdUserId ?? null
  };
}

export function log(tag, su) {
  const s = snapshot(su);
  console.info("[auth] " + tag, s);
  return s;
}

function handleFrom(email) {
  const base = String(email || "").split("@")[0].toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const stem = (base || "jugador").slice(0, 18);
  const salt = Math.random().toString(36).slice(2, 7);
  return (stem + "_" + salt).slice(0, 32);
}

function splitName(displayName, email) {
  const raw = String(displayName || "").trim();
  if (raw) {
    const parts = raw.split(/\s+/);
    return { first: parts[0], last: parts.slice(1).join(" ") || parts[0] };
  }
  const stem = String(email || "").split("@")[0].replace(/[._-]+/g, " ").trim();
  const parts = stem.split(/\s+/).filter(Boolean);
  return { first: parts[0] || "Jugador", last: parts.slice(1).join(" ") || "ECIT" };
}

/** Omple els camps requerits que es poden derivar de les dades que ja tenim. */
export async function autofill(getSignUp, ctx) {
  const su = getSignUp();
  const s = snapshot(su);
  if (!s) return { changed: false, filled: [], blocked: [] };

  const wants = new Set([...s.missing, ...s.required]);
  const patch = {};
  const filled = [];
  const blocked = [];

  if (wants.has("username")) {
    patch.username = handleFrom(ctx.email);
    filled.push("username");
  }
  const name = splitName(ctx.displayName, ctx.email);
  if (wants.has("first_name") || wants.has("firstName")) {
    patch.firstName = name.first;
    filled.push("first_name");
  }
  if (wants.has("last_name") || wants.has("lastName")) {
    patch.lastName = name.last;
    filled.push("last_name");
  }
  for (const f of wants) {
    if (f === "phone_number" || f === "phoneNumber") blocked.push("telèfon");
    else if (f === "password") blocked.push("contrasenya");
    else if (!FILLABLE.includes(f) && f !== "email_address" && f !== "emailAddress") blocked.push(f);
  }

  if (!Object.keys(patch).length) return { changed: false, filled: [], blocked };

  try {
    await su.update(patch);
    console.info("[auth] autofill aplicat", patch);
    return { changed: true, filled, blocked };
  } catch (e) {
    console.warn("[auth] autofill rebutjat", e?.errors?.[0]?.code || e);
    return { changed: false, filled: [], blocked: [...blocked, ...filled] };
  }
}

/** Mira d'arribar a "complete" sense tornar a demanar cap codi. */
export async function settle(getSignUp, ctx, maxPasses = 3) {
  for (let i = 0; i < maxPasses; i++) {
    const s = log("settle pass " + i, getSignUp());
    if (!s) return { done: false, reason: "No hi ha cap registre en curs." };
    if (s.status === "complete") return { done: true, snapshot: s };
    const r = await autofill(getSignUp, ctx);
    if (!r.changed) {
      return { done: false, reason: reason(getSignUp()), snapshot: snapshot(getSignUp()), blocked: r.blocked };
    }
  }
  const s = log("settle esgotat", getSignUp());
  if (s?.status === "complete") return { done: true, snapshot: s };
  return { done: false, reason: reason(getSignUp()), snapshot: s };
}

/** Missatge honest: mai acusa el codi si l'email ja està verificat. */
export function reason(su) {
  const s = snapshot(su);
  if (!s) return "No hi ha cap registre en curs. Torna a començar.";

  if (s.emailStatus === "verified") {
    const extra = s.missing.filter(f => f !== "email_address" && f !== "emailAddress");
    if (extra.length) {
      return "El codi és correcte i el correu ja està verificat. Clerk demana camps addicionals abans de crear el compte: "
        + extra.join(", ") + ". Cal completar-los o desactivar-los com a obligatoris al panell de Clerk.";
    }
    return "El correu està verificat però Clerk no ha tancat el registre (estat: " + s.status + ").";
  }

  if (s.emailError === "form_code_incorrect") return "El codi no coincideix. Escriu els 6 dígits de l'últim correu rebut.";
  if (s.emailError === "verification_expired") return "El codi ha caducat. Demana'n un de nou.";
  if (s.emailStatus === "expired") return "El codi ha caducat. Demana'n un de nou.";
  if (s.unverified.includes("email_address") || s.unverified.includes("emailAddress")) {
    return "El correu encara no consta com a verificat. Assegura't d'usar el codi del correu més recent.";
  }
  return "No s'ha pogut completar el registre (estat: " + s.status + ").";
}