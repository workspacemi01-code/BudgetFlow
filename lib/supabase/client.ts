import { createBrowserClient } from "@supabase/ssr"

import { supabaseKey, supabaseUrl } from "@/lib/supabase/config"

/** Supabase client for Client Components. */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseKey)
}
