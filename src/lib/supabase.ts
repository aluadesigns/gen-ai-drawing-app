import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const DRAWINGS_BUCKET = "drawings";

// Lazy singleton: avoid throwing at module import (which would crash Next.js
// build-time page-data collection in environments where the env vars aren't
// set yet). Routes call getSupabase() at request time; missing creds surface
// as a normalized 502 per the error-handling pattern.
let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase env vars missing: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }
  // persistSession: false — server-only client, never reads/writes auth tokens.
  cached = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return cached;
}
