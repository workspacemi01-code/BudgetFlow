import { createBrowserClient } from "@supabase/ssr"

import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/config"

/** Supabase client for Client Components. */
export function createClient() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.")
  }
  return createBrowserClient(supabaseUrl, supabaseKey)
}
