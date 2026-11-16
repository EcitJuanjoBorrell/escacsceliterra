'use strict';
import "./authPanel.css";
import * as F from "./flows.js";
import { ensureProfile, loadProfile, profileSyncEnabled } from "./profile.js";

const SVG = {
  g: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v9.1h12.5c-.3 2.1-1.6 5.2-4.6 7.3l7.6 5.9c4.5-4.2 6.6-10.3 6.6-18.2z"/><path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3.1-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.4-8.3 2.4-6.4 0-11.7-3.7-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.7"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M3 3l18 18M10.6 6.1A9.9 9.9 0 0 1 12 5.5c6.2 0 10 6.5 10 6.5a18 18 0 0 1-2.9 3.7M6.4 8.3A17.6 17.6 0 0 0 2 12s3.8 6.5 10 6.5c1.3 0 2.5-.2 3.6-.6"/></svg>',
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.2 5.2L20 6.5"/></svg>'
};

const COPY = {
  login:  { t: "Entrar al joc", s: "El teu compte, sense finestres emergents." },
  signup: { t: "Crear un compte", s: "Un correu i una contrasenya. Res més." },
  verify: { t: "Confirma el correu", s: "T'hem enviat un codi de 6 dígits a" },
  forgot: { t: "Recuperar la contrasenya", s: "T'enviarem un codi per correu per triar-ne una de nova." },
  reset:  { t: "Nova contrasenya", s: "Escriu el codi que has rebut i la contrasenya nova." },
  done:   { t: "Tot a punt", s: "Ja pots jugar." }
};

const S = {
  step: "login", email: "", password: "", name: "", code: ["", "", "", "", "", ""],
  busy: false, error: "", field: null, notice: "", showPw: false,
  resendAt: 0, target: ""
};
let root = null, body = null, timer = null;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
const codeStr = () => S.code.join("");

function strength(pw) {
  if (!pw) return 0;
  let n = 0;
  if (pw.length >= F.passwordMin()) n++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n++;
  if (/\d/.test(pw)) n++;
  if (/[^\w\s]/.test(pw) || pw.length >= 14) n++;
  return Math.min(n, 4);
}
const STRENGTH_TXT = ["", "Fluixa", "Acceptable", "Bona", "Excel·lent"];

function setStep(step, opts = {}) {
  S.step = step;
  S.error = ""; S.field = null;
  S.notice = opts.notice || "";
  S.code = ["", "", "", "", "", ""];
  if (opts.target !== undefined) S.target = opts.target;
  if (step === "verify" || step === "reset") S.resendAt = Date.now() + 30000;
  render();
  const first = body.querySelector("input:not([type=hidden]), button.eap-google");
  if (first) setTimeout(() => first.focus(), 60);
}

function banner() {
  if (S.error) return `<div class="eap-banner" data-kind="error" role="alert"><span aria-hidden="true">!</span><span>${esc(S.error)}</span></div>`;
  if (S.notice) return `<div class="eap-banner" data-kind="notice" role="status"><span aria-hidden="true">i</span><span>${esc(S.notice)}</span></div>`;
  return `<div class="eap-banner" hidden></div>`;
}

function field(id, label, type, value, ph, auto, hint) {
  const bad = S.field === id ? 1 : 0;
  const isPw = type === "password";
  const realType = isPw && S.showPw ? "text" : type;
  return `<label class="eap-field" for="eap-${id}">
    <span class="eap-label">${esc(label)}${hint ? `<span class="eap-hint">${esc(hint)}</span>` : ""}</span>
    <span class="eap-input-wrap">
      <input id="eap-${id}" class="eap-input" data-f="${id}" type="${realType}" value="${esc(value)}"
        placeholder="${esc(ph)}" autocomplete="${auto}" ${type === "email" ? "inputmode=\"email\"" : ""}
        ${bad ? 'data-invalid="1" aria-invalid="true"' : ""} ${S.busy ? "disabled" : ""}>
      ${isPw ? `<button type="button" class="eap-eye" data-eye="1" aria-label="${S.showPw ? "Amaga" : "Mostra"} la contrasenya">${S.showPw ? SVG.eyeOff : SVG.eye}</button>` : ""}
    </span>
    <span class="eap-fielderr">${bad ? esc(S.error) : ""}</span>
  </label>`;
}

function otpBlock() {
  const bad = S.field === "code" ? 1 : 0;
  return `<div class="eap-field">
    <span class="eap-label">Codi de 6 dígits</span>
    <div class="eap-otp" data-otp="1">
      ${S.code.map((d, i) => `<input class="eap-digit" data-d="${i}" type="text" inputmode="numeric"
        maxlength="1" value="${esc(d)}" aria-label="Dígit ${i + 1}"
        ${d ? 'data-filled="1"' : ""} ${bad ? 'data-invalid="1"' : ""} ${S.busy ? "disabled" : ""}>`).join("")}
    </div>
    <span class="eap-fielderr">${bad ? esc(S.error) : ""}</span>
  </div>`;
}

function cta(label) {
  return `<button type="submit" class="eap-cta" ${S.busy ? "disabled" : ""}>
    ${S.busy ? '<span class="eap-spin" aria-hidden="true"></span>' : ""}<span>${esc(label)}</span></button>`;
}

function googleBtn(mode) {
  if (!F.googleAvailable()) return "";
  return `<button type="button" class="eap-google" data-google="${mode}" ${S.busy ? "disabled" : ""}>
    ${SVG.g}<span>${mode === "signup" ? "Registrar-me amb Google" : "Continuar amb Google"}</span></button>
    <div class="eap-or">o amb correu</div>`;
}

function resendLink() {
  const left = Math.max(0, Math.ceil((S.resendAt - Date.now()) / 1000));
  return left > 0
    ? `<button type="button" class="eap-link" disabled>Reenviar el codi (${left}s)</button>`
    : `<button type="button" class="eap-link" data-act="resend">Reenviar el codi</button>`;
}

function render() {
  if (!body) return;
  const c = COPY[S.step];
  const min = F.passwordMin();
  let inner = "";

  if (S.step === "login") {
    inner = googleBtn("login")
      + field("email", "Correu electrònic", "email", S.email, "nom@correu.com", "username")
      + field("password", "Contrasenya", "password", S.password, "La teva contrasenya", "current-password")
      + banner() + cta("Entrar")
      + `<div class="eap-links">
           <button type="button" class="eap-link" data-go="forgot">He oblidat la contrasenya</button>
           <button type="button" class="eap-link" data-go="signup">Crear un compte</button>
         </div>`;
  } else if (S.step === "signup") {
    const st = strength(S.password);
    inner = googleBtn("signup")
      + field("name", "Nom (opcional)", "text", S.name, "Com vols que et diguem", "nickname")
      + field("email", "Correu electrònic", "email", S.email, "nom@correu.com", "username")
      + field("password", "Contrasenya", "password", S.password, "Mínim " + min + " caràcters", "new-password", min + "+ caràcters")
      + `<div class="eap-meter" aria-hidden="true">${[1, 2, 3, 4].map(i => `<span class="eap-seg" ${st >= i ? `data-on="${st}"` : ""}></span>`).join("")}</div>
         <div class="eap-metertxt">${st ? "Seguretat: " + STRENGTH_TXT[st] : "Combina lletres, números i símbols."}</div>`
      + banner() + cta("Crear el compte")
      + `<div class="eap-foot">Ja tens compte? <button type="button" class="eap-link" data-go="login">Entrar</button></div>`;
  } else if (S.step === "verify") {
    inner = otpBlock() + banner() + cta("Confirmar i entrar")
      + `<div class="eap-links">${resendLink()}
           <button type="button" class="eap-link" data-go="signup">Canviar el correu</button></div>`;
  } else if (S.step === "forgot") {
    inner = field("email", "Correu electrònic", "email", S.email, "nom@correu.com", "username")
      + banner() + cta("Enviar el codi")
      + `<div class="eap-foot"><button type="button" class="eap-link" data-go="login">Tornar a entrar</button></div>`;
  } else if (S.step === "reset") {
    const st = strength(S.password);
    inner = otpBlock()
      + field("password", "Contrasenya nova", "password", S.password, "Mínim " + min + " caràcters", "new-password", min + "+ caràcters")
      + `<div class="eap-meter" aria-hidden="true">${[1, 2, 3, 4].map(i => `<span class="eap-seg" ${st >= i ? `data-on="${st}"` : ""}></span>`).join("")}</div>
         <div class="eap-metertxt">${st ? "Seguretat: " + STRENGTH_TXT[st] : ""}</div>`
      + banner() + cta("Guardar i entrar")
      + `<div class="eap-links">${resendLink()}
           <button type="button" class="eap-link" data-go="login">Cancel·lar</button></div>`;
  } else {
    inner = `<div class="eap-done"><div class="eap-tick">${SVG.tick}</div>
      <div><strong>${esc(c.t)}</strong><div class="eap-sub">${esc(c.s)}</div></div></div>`;
  }

  const head = S.step === "done" ? "" :
    `<h2 class="eap-title">${esc(c.t)}</h2>
     <p class="eap-sub">${esc(c.s)}${S.step === "verify" || S.step === "reset" ? ` <b>${esc(S.target || S.email)}</b>` : ""}</p>`;

  body.innerHTML = `<form class="eap-step" data-form="1" novalidate>${head}${inner}</form>`;
  wire();
}

let wired = false;

function wire() {
  if (!body || wired) return;
  wired = true;

  body.addEventListener("input", event => {
    const target = event.target;
    if (target.matches("[data-f]")) {
      S[target.dataset.f === "name" ? "name" : target.dataset.f] = target.value;
      if (target.dataset.f === "password" && S.step === "signup") updateStrength();
      return;
    }
    if (target.matches("[data-d]")) {
      const index = Number(target.dataset.d);
      S.code[index] = target.value.replace(/\D/g, "").slice(-1);
      target.value = S.code[index];
      target.toggleAttribute("data-filled", Boolean(target.value));
      if (target.value && index < 5) body.querySelector(`[data-d="${index + 1}"]`)?.focus();
    }
  });

  body.addEventListener("paste", event => {
    const target = event.target;
    if (!target.matches("[data-d]")) return;
    const digits = event.clipboardData?.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    event.preventDefault();
    const start = Number(target.dataset.d);
    [...digits].forEach((digit, offset) => {
      if (start + offset < 6) S.code[start + offset] = digit;
    });
    render();
    body.querySelector(`[data-d="${Math.min(start + digits.length, 5)}"]`)?.focus();
  });

  body.addEventListener("keydown", event => {
    const target = event.target;
    if (!target.matches("[data-d]")) return;
    const index = Number(target.dataset.d);
    if (event.key === "Backspace" && !target.value && index > 0) {
      body.querySelector(`[data-d="${index - 1}"]`)?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      body.querySelector(`[data-d="${index - 1}"]`)?.focus();
    } else if (event.key === "ArrowRight" && index < 5) {
      event.preventDefault();
      body.querySelector(`[data-d="${index + 1}"]`)?.focus();
    }
  });

  body.addEventListener("click", async event => {
    const button = event.target.closest?.("button");
    if (!button || S.busy) return;

    if (button.dataset.go) {
      if (button.dataset.go === "login") setStep("login");
      else if (button.dataset.go === "signup") setStep("signup");
      else if (button.dataset.go === "forgot") setStep("forgot");
      return;
    }
    if (button.dataset.eye) {
      S.showPw = !S.showPw;
      render();
      body.querySelector('[data-f="password"]')?.focus();
      return;
    }
    if (button.dataset.google) {
      const result = await run(() => F.startGoogle(button.dataset.google));
      if (!result?.ok) showFailure(result);
      return;
    }
    if (button.dataset.act === "resend") {
      const result = await run(() => S.step === "verify"
        ? F.resendSignupCode()
        : F.startPasswordReset(S.email));
      if (result?.ok) {
        S.resendAt = Date.now() + 30000;
        S.notice = "T’hem enviat un codi nou.";
        render();
        startCountdown();
      } else showFailure(result);
    }
  });

  body.addEventListener("submit", async event => {
    event.preventDefault();
    if (S.busy) return;
    const result = await submitCurrentStep();
    if (!result?.ok) {
      showFailure(result);
      return;
    }
    S.error = "";
    S.field = null;
    if (S.step === "login") setStep("done");
    else if (S.step === "signup") {
      S.target = S.email;
      setStep("verify", { notice: "T’hem enviat un codi de verificació." });
      startCountdown();
    } else if (S.step === "verify") setStep("done");
    else if (S.step === "forgot") {
      S.target = S.email;
      setStep("reset", { notice: "T’hem enviat un codi per canviar la contrasenya." });
      startCountdown();
    } else if (S.step === "reset") setStep("done");
  });
}

async function submitCurrentStep() {
  if (S.step === "login") {
    if (!emailOk(S.email)) return localFailure("Escriu un correu electrònic vàlid.", "email");
    if (!S.password) return localFailure("Escriu la contrasenya.", "password");
    return run(() => F.loginWithPassword({ identifier: S.email, password: S.password }));
  }
  if (S.step === "signup") {
    if (!emailOk(S.email)) return localFailure("Escriu un correu electrònic vàlid.", "email");
    if (S.password.length < F.passwordMin()) {
      return localFailure(`La contrasenya ha de tenir com a mínim ${F.passwordMin()} caràcters.`, "password");
    }
    return run(() => F.startSignup({ email: S.email, password: S.password, displayName: S.name }));
  }
  if (S.step === "verify") {
    if (codeStr().length !== 6) return localFailure("Escriu el codi de 6 dígits.", "code");
    return run(() => F.verifySignupCode(codeStr()));
  }
  if (S.step === "forgot") {
    if (!emailOk(S.email)) return localFailure("Escriu un correu electrònic vàlid.", "email");
    return run(() => F.startPasswordReset(S.email));
  }
  if (S.step === "reset") {
    if (codeStr().length !== 6) return localFailure("Escriu el codi de 6 dígits.", "code");
    if (S.password.length < F.passwordMin()) {
      return localFailure(`La contrasenya ha de tenir com a mínim ${F.passwordMin()} caràcters.`, "password");
    }
    return run(() => F.completePasswordReset({ code: codeStr(), password: S.password }));
  }
  return { ok: false, message: "Aquest pas no és vàlid." };
}

function localFailure(message, fieldName) {
  return { ok: false, message, field: fieldName };
}

async function run(action) {
  S.busy = true;
  S.error = "";
  S.field = null;
  render();
  try {
    return await action();
  } catch (error) {
    console.error("[auth-panel] Error inesperat:", error);
    return { ok: false, message: "No s’ha pogut completar l’operació. Torna-ho a provar." };
  } finally {
    S.busy = false;
    render();
  }
}

function showFailure(result) {
  S.error = result?.message || "No s’ha pogut completar l’operació. Torna-ho a provar.";
  S.field = result?.field || null;
  render();
}

function updateStrength() {
  const score = strength(S.password);
  const segments = body.querySelectorAll(".eap-seg");
  segments.forEach((segment, index) => {
    if (score >= index + 1) segment.dataset.on = String(score);
    else delete segment.dataset.on;
  });
  const label = body.querySelector(".eap-metertxt");
  if (label) label.textContent = score ? "Seguretat: " + STRENGTH_TXT[score] : "Combina lletres, números i símbols.";
}

function startCountdown() {
  clearInterval(timer);
  timer = setInterval(() => {
    if (!root?.isConnected || S.resendAt <= Date.now()) {
      clearInterval(timer);
      timer = null;
    }
    const active = body?.contains(document.activeElement) ? document.activeElement : null;
    const focus = active?.dataset?.f ? `[data-f="${active.dataset.f}"]` :
      active?.dataset?.d !== undefined ? `[data-d="${active.dataset.d}"]` : null;
    render();
    if (focus) body.querySelector(focus)?.focus();
  }, 1000);
}

export function initAuthPanel() {
  const mount = document.getElementById("auth-panel");
  if (!mount) return false;
  if (!root) {
    root = mount;
    root.classList.add("eap-root");
    root.innerHTML = '<div class="eap-card"><div class="eap-body"></div></div>';
    body = root.querySelector(".eap-body");
    wired = false;
  }
  render();
  return true;
}

export function resetAuthPanel() {
  clearInterval(timer);
  timer = null;
  Object.assign(S, {
    step: "login", email: "", password: "", name: "",
    code: ["", "", "", "", "", ""], busy: false,
    error: "", field: null, notice: "", showPw: false,
    resendAt: 0, target: ""
  });
  if (root?.isConnected) render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAuthPanel, { once: true });
} else {
  initAuthPanel();
}