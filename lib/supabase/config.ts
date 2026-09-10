export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""

/** False until .env.local has the Supabase URL and key — the app runs on demo data until then. */
export const isSupabaseConfigured = supabaseUrl !== "" && supabaseKey !== ""
