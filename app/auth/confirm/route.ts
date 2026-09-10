import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

import { createClient } from "@/lib/supabase/server"

/** Where the email confirmation link lands: turn the link into a session, then continue. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const requested = searchParams.get("next") ?? "/onboarding"
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/onboarding"
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null

  const supabase = await createClient()
  let failed = true
  if (code) {
    failed = !!(await supabase.auth.exchangeCodeForSession(code)).error
  } else if (tokenHash && type) {
    failed = !!(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error
  }

  if (failed) {
    const login = new URL("/login", origin)
    login.searchParams.set("error", "That link has expired or was already used. Sign in, or sign up again for a new link.")
    return NextResponse.redirect(login)
  }
  return NextResponse.redirect(new URL(next, origin))
}
