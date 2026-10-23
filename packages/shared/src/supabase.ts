import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Browser client using the public anon key only. Every request carries an
 * x-request-id that the database records in the audit trail.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see .env.example).');
  }
  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set('x-request-id', crypto.randomUUID());
        return fetch(input, { ...init, headers });
      },
    },
  });
  return client;
}

/** Normalises an Indian mobile number (or any +E.164) for Supabase phone auth. */
export function toE164(raw: string, defaultCountry = '+91'): string | null {
  const digits = raw.replace(/[^\d+]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  const local = digits.replace(/^0+/, '');
  if (defaultCountry === '+91' && /^[6-9]\d{9}$/.test(local)) return `+91${local}`;
  return null;
}
