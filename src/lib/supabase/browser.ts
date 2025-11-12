'use client';

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase browser env vars. Check NEXT_PUBLIC_SUPABASE_* in .env.");
}

export const createBrowserClient = () =>
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      detectSessionInUrl: true,
    },
  });
