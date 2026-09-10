import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/config"

const PUBLIC_PREFIXES = ["/login", "/signup", "/forgot-password", "/auth"]
const SIGNED_OUT_ONLY = ["/", "/login", "/signup"]

function isPublic(path: string) {
  return path === "/" || PUBLIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/**
 * Refreshes the Supabase session cookie on every request and keeps signed-out
 * visitors on public pages. Pages still check the user themselves — this is
 * only the fast, optimistic redirect.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname

  // An email link whose redirect address isn't allow-listed in Supabase lands on
  // the Site URL instead (…/?code=…). Finish signing in rather than dropping it.
  if (path === "/" && (request.nextUrl.searchParams.has("code") || request.nextUrl.searchParams.has("token_hash"))) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/confirm"
    if (!url.searchParams.has("next")) url.searchParams.set("next", "/onboarding")
    return NextResponse.redirect(url)
  }

  if (!isSupabaseConfigured) return NextResponse.next({ request })

  let response = NextResponse.next({ request })
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const redirectTo = (pathname: string, params: Record<string, string> = {}) => {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    url.search = new URLSearchParams(params).toString()
    const redirect = NextResponse.redirect(url)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  if (!user && !isPublic(path)) return redirectTo("/login", { next: path })
  if (user && SIGNED_OUT_ONLY.includes(path)) return redirectTo("/dashboard")
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}
