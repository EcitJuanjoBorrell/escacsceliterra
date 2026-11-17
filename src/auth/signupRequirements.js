'use strict';
/* Convergeix un SignUp de Clerk cap a "complete".
   protect_check NO és un camp que es pugui omplir per codi: és la comprovació
   anti-bot de Clerk. Es satisfà amb el widget que Clerk injecta a
   #clerk-captcha. Si el widget no existeix o la xarxa bloqueja
   client.protect.clerk.com, el SignUp es queda aquí per sempre. */

const NAME_KEYS = ["first_name", "firstName", "last_name", "lastName"];
const PROTECT = "protect_check";
const EMAIL_KEYS = ["email_address", "emailAddress"];

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

export function isConsumed(su) {
  const s = snapshot(su);
  if (!s) return true;
  return s.status === null && !s.missing.length && !s.unverified.length && !s.required.length;
}

export function needsProtect(su) {
  const s = snapshot(su);
  return Boolean(s && s.missing.includes(PROTECT));
}

export function emailVerified(su) {
  return snapshot(su)?.emailStatus === "verified";
}

export function log(tag, su) {
  const s = snapshot(su);
  console.info("[auth] " + tag, s);
  if (s && s.missing.includes(PROTECT)) {
    const node = document.getElementById("clerk-captcha");
    console.warn("[auth] protect_check pendent", {
      widgetExisteix: Boolean(node),
      widgetAmbContingut: Boolean(node && node.childElementCount),
      captchaPublicKey: (window.Clerk || window.clerk)?.environment?.displayConfig?.captchaPublicKey ?? null
    });
  }
  return s;
}

function stem(email) {
  const base = String(email || "").split("@")[0].toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return (base || "jugador").slice(0, 20);
}

function splitName(displayName, email) {
  const raw = String(displayName || "").trim();
  if (raw) {
    const parts = raw.split(/\s+/);
    return { first: parts[0], last: parts.slice(1).join(" ") || parts[0] };
  }
  const parts = String(email || "").split("@")[0].replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
  return { first: parts[0] || "Jugador", last: parts.slice(1).join(" ") || "ECIT" };
}

export async function autofill(getSignUp, ctx) {
  const su = getSignUp();
  const s = snapshot(su);
  if (!s || isConsumed(su)) return { changed: false, blocked: [] };

  const missing = new Set(s.missing);
  const blocked = [];
  const name = splitName(ctx.displayName, ctx.email);
  const patch = {};

  if (missing.has("first_name") || missing.has("firstName")) patch.firstName = name.first;
  if (missing.has("last_name") || missing.has("lastName")) patch.lastName = name.last;

  for (const f of missing) {
    if (f === PROTECT) continue;
    if (f === "phone_number" || f === "phoneNumber") blocked.push("telèfon");
    else if (f === "password") blocked.push("contrasenya");
    else if (f !== "username" && !NAME_KEYS.includes(f) && !EMAIL_KEYS.includes(f)) blocked.push(f);
  }

  if (missing.has("username")) {
    const base = stem(ctx.email);
    for (let i = 0; i < 4; i++) {
      const candidate = i === 0
        ? (base.length >= 4 ? base : base + "_ecit")
        : (base.slice(0, 20) + "_" + Math.random().toString(36).slice(2, 7));
      try {
        await su.update({ ...patch, username: candidate });
        console.info("[auth] autofill aplicat", { ...patch, username: candidate });
        return { changed: true, blocked };
      } catch (e) {
        const code = e?.errors?.[0]?.code || "";
        if (!/identifier_exist|already|taken|invalid/i.test(code)) {
          console.warn("[auth] autofill rebutjat", code || e);
          break;
        }
      }
    }
  }

  if (Object.keys(patch).length) {
    try {
      await su.update(patch);
      console.info("[auth] autofill aplicat", patch);
      return { changed: true, blocked };
    } catch (e) {
      console.warn("[auth] autofill rebutjat", e?.errors?.[0]?.code || e);
    }
  }
  return { changed: false, blocked };
}

export async function settle(getSignUp, ctx, maxPasses = 3) {
  for (let i = 0; i < maxPasses; i++) {
    const su = getSignUp();
    const s = log("settle pass " + i, su);
    if (!s) return { done: false, reason: "No hi ha cap registre en curs." };
    if (isConsumed(su)) return { done: false, consumed: true, snapshot: s };
    if (s.status === "complete") return { done: true, snapshot: s };

    if (s.missing.includes(PROTECT)) {
      return { done: false, protect: true, snapshot: s, reason: reason(su) };
    }

    const r = await autofill(getSignUp, ctx);
    if (!r.changed) {
      const t = snapshot(getSignUp());
      const onlyEmail = t && !t.missing.length && t.unverified.some(f => EMAIL_KEYS.includes(f));
      return {
        done: false,
        needsEmail: Boolean(onlyEmail),
        protect: Boolean(t && t.missing.includes(PROTECT)),
        snapshot: t,
        blocked: r.blocked,
        reason: reason(getSignUp())
      };
    }
  }
  const t = log("settle esgotat", getSignUp());
  if (t?.status === "complete") return { done: true, snapshot: t };
  return { done: false, protect: Boolean(t && t.missing.includes(PROTECT)), snapshot: t, reason: reason(getSignUp()) };
}

export function reason(su) {
  const s = snapshot(su);
  if (!s) return "No hi ha cap registre en curs. Torna a començar.";
  if (isConsumed(su)) return "El registre s'ha tancat. Comprovant la sessió…";

  if (s.missing.includes(PROTECT)) {
    return "El correu i el codi són correctes. Clerk demana una comprovació anti-bot (protect_check) abans de crear el compte. Completa la verificació del formulari; si no apareix, cal desactivar «Bot sign-up protection» al panell de Clerk o permetre client.protect.clerk.com a la xarxa.";
  }

  if (s.emailStatus === "verified") {
    const extra = s.missing.filter(f => !EMAIL_KEYS.includes(f));
    if (extra.length) {
      return "El codi és correcte i el correu està verificat. Clerk encara demana: " + extra.join(", ") + ".";
    }
    return "El correu està verificat però Clerk no ha tancat el registre (estat: " + s.status + ").";
  }
  if (s.emailError === "form_code_incorrect") return "El codi no coincideix. Escriu els 6 dígits de l'últim correu rebut.";
  if (s.emailError === "verification_expired" || s.emailStatus === "expired") return "El codi ha caducat. Demana'n un de nou.";
  if (!s.missing.length && s.unverified.some(f => EMAIL_KEYS.includes(f))) {
    return "Falta confirmar el correu. Escriu el codi de 6 dígits.";
  }
  return "No s'ha pogut completar el registre (estat: " + s.status + ").";
}