import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase/config"

const PUBLIC_PREFIXES = ["/login", "/signup", "/forgot-password", "/auth", "/invite"]
const SIGNED_OUT_ONLY = ["/", "/login", "/signup"]

function isPublic(path: string) {
  return path === "/" || PUBLIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/** Seconds of life left below which we stop trusting the cookie and go and refresh. */
const REFRESH_WINDOW = 120

/**
 * The signed-in user according to the session cookie alone, or null when the
 * cookie is missing, unreadable, or close enough to expiry that it needs a real
 * refresh.
 *
 * Null means "ask Supabase properly", never "signed out" — the caller makes the
 * network call in that case, so a bad cookie costs correctness nothing.
 */
function userFromCookie(request: NextRequest): { id: string } | null {
  // @supabase/ssr splits a long cookie into .0, .1 … which have to be rejoined.
  const parts = request.cookies
    .getAll()
    .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))
  if (parts.length === 0) return null

  try {
    let raw = parts.map((c) => c.value).join("")
    if (raw.startsWith("base64-")) raw = atob(raw.slice("base64-".length))
    const token = (JSON.parse(raw) as { access_token?: string }).access_token
    if (!token) return null

    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
    if (!payload?.sub || typeof payload.exp !== "number") return null
    if (payload.exp - Date.now() / 1000 < REFRESH_WINDOW) return null
    return { id: String(payload.sub) }
  } catch {
    return null
  }
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

  // getUser() asks Supabase Auth over the network to verify the token — a round
  // trip on *every* request, measured at 200-500ms, paid before a single line of
  // the page runs and again on each tab you touch.
  //
  // It buys two things: refreshing a token that is about to expire, and being
  // certain the token is genuine. The second is not this middleware's job — as
  // the comment above says, this is the optimistic redirect, and every page
  // re-checks the user against the database where RLS decides what they see.
  //
  // So read the expiry out of the cookie instead. Comfortably valid, which is
  // almost always, and the network call is skipped entirely. Near expiry or
  // unreadable, and the real call runs so the refresh still happens.
  let user: { id: string } | null = userFromCookie(request)
  if (!user) {
    const { data } = await supabase.auth.getUser()
    user = data.user ? { id: data.user.id } : null
  }

  const redirectTo = (pathname: string, params: Record<string, string> = {}) => {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    url.search = new URLSearchParams(params).toString()
    const redirect = NextResponse.redirect(url)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  if (!user && !isPublic(path)) return redirectTo("/login", { next: path })
  // Already signed in and back on a signed-out-only page: honour where they were
  // headed, so an invitation link isn't dropped on the way through.
  if (user && SIGNED_OUT_ONLY.includes(path)) {
    const next = request.nextUrl.searchParams.get("next") ?? ""
    if (next.startsWith("/") && !next.startsWith("//")) {
      const url = request.nextUrl.clone()
      const [pathname, search = ""] = next.split("?")
      url.pathname = pathname
      url.search = search
      const redirect = NextResponse.redirect(url)
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
      return redirect
    }
    return redirectTo("/dashboard")
  }
  return response
}

export const config = {
  // Skip static files and the generated icon / manifest routes (they must load when signed out).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
