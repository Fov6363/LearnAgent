import { z } from "zod";

/**
 * Parse and validate environment variables once at startup.
 * Keep this file server-only; do not import it in client components
 * because it exposes service credentials.
 */
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  FLOWLEARN_DEFAULT_MODEL: z.string().default("gpt-4o-mini"),
  FLOWLEARN_FALLBACK_MODEL: z.string().default("claude-3-5-sonnet"),
});

const parsed = envSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  FLOWLEARN_DEFAULT_MODEL: process.env.FLOWLEARN_DEFAULT_MODEL,
  FLOWLEARN_FALLBACK_MODEL: process.env.FLOWLEARN_FALLBACK_MODEL,
});

if (!parsed.success) {
  console.error("Invalid environment variables", parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed");
}

export const env = parsed.data;
export type Env = typeof env;
