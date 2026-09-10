import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/config"

/** Supabase client for Server Components, Server Actions and Route Handlers. */
export async function createClient() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
        "(.env.local locally, or Vercel → Settings → Environment Variables, then redeploy)."
    )
  }
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session instead.
        }
      },
    },
  })
}
