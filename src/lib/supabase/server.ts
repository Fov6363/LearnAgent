import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";

let adminClient: SupabaseClient | null = null;

/**
 * Returns a cached Supabase client that uses the service role key.
 * Only use this on the server for trusted operations.
 */
export const getSupabaseAdmin = (): SupabaseClient => {
  if (!adminClient) {
    adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return adminClient;
};

/**
 * Creates a Supabase client scoped to server-side requests that
 * only require the public anon key (e.g., SSR loaders).
 */
export const createServerClient = (): SupabaseClient =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
