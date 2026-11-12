'use strict';
import { createClient } from '@supabase/supabase-js';

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY;

let client = null;
let tried = false;

export function isConfigured() {
  return typeof URL_ === 'string' && /^https?:\/\//.test(URL_) &&
         typeof KEY_ === 'string' && KEY_.length > 20;
}

export function getClient() {
  if (tried) return client;
  tried = true;
  if (!isConfigured()) {
    console.warn('[auth] Supabase no configurat: mode local disponible.');
    return null;
  }
  try {
    client = createClient(URL_, KEY_, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'ecit.auth'
      }
    });
  } catch (e) {
    console.error('[auth] createClient ha fallat:', e);
    client = null;
  }
  return client;
}
