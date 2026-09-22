import { createClient } from "@supabase/supabase-js";

/**
 * Browser-safe client -- uses the public anon key. Row Level Security (RLS)
 * policies in Supabase are what actually protect data when this client is used;
 * this scaffold does not include RLS policies yet, add them before going live.
 */
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

/**
 * Server-only client -- uses the service role key, which bypasses RLS.
 * Never import this file from a client component.
 */
export function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );
}
