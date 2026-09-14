// Server-only Supabase clients that are not tied to the caller's session.
//
// `createAdminClient` uses the service role key and bypasses row-level
// security — it exists so the server can ask Supabase Auth to *send* an email.
// Never import this from a Client Component.

import { createClient as createSupabaseClient } from "@supabase/supabase-js"

import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/config"

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""

/** False until SUPABASE_SERVICE_ROLE_KEY is set — invitations then can't be emailed. */
export const canSendEmail = isSupabaseConfigured && serviceRoleKey !== ""

const noStorage = { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }

export function createAdminClient() {
  return createSupabaseClient(supabaseUrl, serviceRoleKey, { auth: noStorage })
}

/**
 * An anonymous client with no cookie storage. Used to ask for a magic link on
 * someone else's behalf without touching the current request's session.
 */
export function createAnonClient() {
  return createSupabaseClient(supabaseUrl, supabaseKey, { auth: noStorage })
}
