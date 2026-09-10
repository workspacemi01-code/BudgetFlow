"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { ORG_COOKIE } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import type { FormState } from "@/lib/types"

/** Only follow same-site paths after sign-in, never another origin. */
function safeNext(value: FormDataEntryValue | null, fallback: string) {
  const next = typeof value === "string" ? value : ""
  return next.startsWith("/") && !next.startsWith("//") ? next : fallback
}

async function siteOrigin() {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Confirm your email first — open the link we sent to your inbox." }
    }
    return { error: "That email and password don't match an account." }
  }
  redirect(safeNext(formData.get("next"), "/dashboard"))
}

export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  if (password.length < 8) return { error: "Use at least 8 characters for your password." }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/onboarding`,
    },
  })
  if (error) return { error: error.message }
  // Email confirmation off → already signed in.
  if (data.session) redirect("/onboarding")
  return { message: email }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  ;(await cookies()).delete(ORG_COOKIE)
  redirect("/login")
}
