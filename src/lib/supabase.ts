import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "Supabase env vars missing: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
}

export const DRAWINGS_BUCKET = "drawings";

// persistSession: false — this is a server-only client; it must never try to read or write auth tokens.
export const supabase: SupabaseClient = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});
