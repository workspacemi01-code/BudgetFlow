import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

import { createClient } from "@/lib/supabase/server"

/**
 * Where every email link lands. Two link styles are supported:
 *  - ?token_hash=…&type=… (the branded templates in supabase/templates) — works on any device
 *  - ?code=… (Supabase's default links) — only works in the browser that asked for the email
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const requested = searchParams.get("next") ?? "/onboarding"
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/onboarding"
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null

  const supabase = await createClient()
  let failed = true
  if (tokenHash && type) {
    failed = !!(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error
  } else if (code) {
    failed = !!(await supabase.auth.exchangeCodeForSession(code)).error
  }

  if (failed) {
    const login = new URL("/login", origin)
    login.searchParams.set("error", type === "recovery" ? "reset_expired" : "link_expired")
    return NextResponse.redirect(login)
  }

  const destination = new URL(next, origin)
  // A confirmed sign-up gets a welcome note on the next screen.
  if (type !== "recovery" && next.startsWith("/onboarding")) destination.searchParams.set("notice", "confirmed")
  return NextResponse.redirect(destination)
}
