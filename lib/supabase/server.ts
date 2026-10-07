import "server-only";
import { cookies } from "next/headers";
import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

/**
 * Legacy anon server client kept for backward compatibility until remaining pages are migrated.
 */
export const supabaseServer = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Creates a server-side Supabase client carrying the logged-in user's session cookies.
 * Enforces Row Level Security (RLS) under the authenticated session.
 * Configured with cache: "no-store" to guarantee fresh database reads.
 */
export function createServerClient() {
  const cookieStore = cookies();

  return createSupabaseServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Cookies are read-only in Next.js Server Components.
        }
      },
    },
    global: {
      fetch: (url, options = {}) =>
        fetch(url, {
          ...options,
          cache: "no-store",
        }),
    },
  });
}
