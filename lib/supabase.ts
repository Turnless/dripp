import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-only client -- uses the service role key, which bypasses RLS. The
 * browser never talks to Supabase directly (every table has RLS on with no
 * policies); it goes through the API routes. `server-only` makes the build
 * fail if a client component ever imports this file.
 */
export function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );
}
