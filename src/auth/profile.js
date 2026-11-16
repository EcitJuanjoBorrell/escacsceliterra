'use strict';
import { getClerk } from './flows.js';

/* Perfil a Supabase (patró Moowenk). Clerk és l'únic gestor de sessió:
   Supabase es crea amb persistSession:false i el token de Clerk s'injecta
   per petició. TOT és opcional: sense env vars, cada funció és un no-op.
   Cap funció d'aquest fitxer pot bloquejar ni fer fallar el login. */

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const profileSyncEnabled = Boolean(SB_URL && SB_KEY);

let lib = null, anon = null;

async function loadLib() {
  if (!profileSyncEnabled) return null;
  try {
    if (!lib) lib = await import("@supabase/supabase-js");
    return lib;
  } catch { return null; }
}

async function anonClient() {
  const m = await loadLib();
  if (!m) return null;
  try {
    if (!anon) anon = m.createClient(SB_URL, SB_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    return anon;
  } catch { return null; }
}

async function authClient() {
  const m = await loadLib();
  const base = await anonClient();
  if (!m || !base) return null;
  try {
    const clerk = getClerk();
    const token = await clerk?.session?.getToken();
    if (!token) return base;
    return m.createClient(SB_URL, SB_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      accessToken: async () => (await getClerk()?.session?.getToken()) || null
    });
  } catch { return base; }
}

export function defaultProfile(user) {
  const email = user?.primaryEmailAddress?.emailAddress || "";
  return {
    id: user?.id || "",
    clerk_id: user?.id || "",
    email,
    display_name: user?.unsafeMetadata?.display_name ||
      user?.fullName || email.split("@")[0] || "Jugador",
    role: "user",
    created_at: new Date().toISOString()
  };
}

/* Upsert idempotent. Es crida després d'activar la sessió, sense await
   al camí crític. onConflict: clerk_id. */
export async function ensureProfile(user) {
  if (!profileSyncEnabled || !user?.id) return null;
  try {
    const sb = await authClient();
    if (!sb) return null;
    const row = defaultProfile(user);
    const { error } = await sb.from("profiles").upsert(row, { onConflict: "clerk_id" });
    if (error) { console.warn("[profile] upsert:", error.message); return null; }
    return row;
  } catch (e) { console.warn("[profile] ensure:", e); return null; }
}

export async function loadProfile(user) {
  if (!profileSyncEnabled || !user?.id) return defaultProfile(user);
  try {
    const sb = await authClient();
    if (!sb) return defaultProfile(user);
    const { data, error } = await sb.from("profiles")
      .select("clerk_id,email,display_name,role,created_at")
      .eq("clerk_id", user.id).maybeSingle();
    if (error) { console.warn("[profile] load:", error.message); return defaultProfile(user); }
    return data ? { ...defaultProfile(user), ...data, id: user.id } : defaultProfile(user);
  } catch { return defaultProfile(user); }
}

/* Neteja de residus de Supabase Auth (Moowenk §9). No toca dades del joc. */
export function purgeAuthResidue() {
  const hit = k => /supabase|sb_|gotrue|supabase\.auth/i.test(k);
  for (const name of ['localStorage', 'sessionStorage']) {
    try {
      const store = globalThis[name];
      if (!store) continue;
      Object.keys(store).filter(hit).forEach(k => store.removeItem(k));
    } catch { /* storage bloquejat */ }
  }
}