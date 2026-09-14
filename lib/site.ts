// Where this deployment lives, and how to safely follow a `next` parameter.

import { headers } from "next/headers"

/** The origin this request arrived on — used to build links we put in emails. */
export async function siteOrigin() {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

/** Only follow same-site paths after signing in, never another origin. */
export function safePath(value: unknown, fallback: string) {
  const next = typeof value === "string" ? value : ""
  return next.startsWith("/") && !next.startsWith("//") ? next : fallback
}

/**
 * Same as safePath, but also accepts an absolute URL on this origin and reduces
 * it to a path. Supabase email templates hand back `{{ .RedirectTo }}` in full,
 * so the confirm route has to cope with both shapes.
 */
export function safeNextUrl(value: string | null | undefined, origin: string, fallback: string) {
  if (!value) return fallback
  if (value.startsWith("/") && !value.startsWith("//")) return value
  try {
    const url = new URL(value)
    if (url.origin === origin) return `${url.pathname}${url.search}`
  } catch {
    // Not a URL at all — fall through.
  }
  return fallback
}

/** The link that an invitation email points at. */
export function inviteUrl(origin: string, token: string) {
  return `${origin}/invite/${token}`
}
