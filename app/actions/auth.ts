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
      return { error: "Confirm your email first — open the link we sent to your inbox.", unconfirmedEmail: email }
    }
    return { error: "That email and password don't match an account." }
  }
  redirect(safeNext(formData.get("next"), "/dashboard"))
}

/** Sends a fresh confirmation link to an account that hasn't confirmed its email. */
export async function resendConfirmation(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." }
  const supabase = await createClient()
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/onboarding` },
  })
  if (error) {
    return { error: error.status === 429 ? "Please wait a minute before asking for another email." : error.message }
  }
  return { message: `We sent a new link to ${email}. It can take a minute — check spam too.` }
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

export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." }
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=/reset-password`,
  })
  // Same answer whether or not the account exists, so the form can't be used to probe emails.
  if (error && error.status === 429) return { error: "Too many requests — wait a minute and try again." }
  return { message: email }
}

/** Sets a new password for the user signed in through a reset link. */
export async function updatePassword(_: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "")
  const confirm = String(formData.get("confirm") ?? "")
  if (password.length < 8) return { error: "Use at least 8 characters for your password." }
  if (password !== confirm) return { error: "The two passwords don't match." }

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { error: "Your reset link has expired. Request a new one." }
  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return {
      error: error.code === "same_password" ? "Choose a password you haven't used before." : error.message,
    }
  }
  redirect("/dashboard")
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  ;(await cookies()).delete(ORG_COOKIE)
  redirect("/login")
}
