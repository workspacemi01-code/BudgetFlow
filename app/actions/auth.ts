"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { ORG_COOKIE } from "@/lib/session"
import { safePath, siteOrigin } from "@/lib/site"
import { canSendEmail, createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { FormState } from "@/lib/types"

/** The /auth/confirm link an email should come back to, keeping the caller's destination. */
async function confirmUrl(next: string) {
  return `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(next)}`
}

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    if (error.code === "email_not_confirmed") {
      // An account from before confirmation was dropped, whose owner never
      // clicked the link. Confirmation is no longer asked of anyone signing up,
      // so continuing to lock these out would punish them for the old rule —
      // and the password they just typed is the same proof of ownership every
      // other sign-in relies on. Confirm and let them in.
      const confirmed = await confirmExistingUser(email.trim().toLowerCase())
      if (confirmed) {
        const retry = await supabase.auth.signInWithPassword({ email, password })
        if (!retry.error) redirect(safePath(formData.get("next"), "/dashboard"))
      }
      return { error: "Confirm your email first — open the link we sent to your inbox.", unconfirmedEmail: email }
    }
    return { error: "That email and password don't match an account." }
  }
  redirect(safePath(formData.get("next"), "/dashboard"))
}

/**
 * Mark a pre-existing account's address as confirmed.
 *
 * Only ever called after Supabase itself has said the password was right but
 * the address was unconfirmed, so it cannot be used to confirm an address the
 * caller can't already sign in to. Returns false when there is no service role
 * key, or the account can't be found.
 */
async function confirmExistingUser(email: string): Promise<boolean> {
  if (!canSendEmail) return false
  try {
    const admin = createAdminClient()
    // listUsers has no email filter, so page through until the address turns up.
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (error || !data?.users?.length) return false
      const found = data.users.find((u) => u.email?.toLowerCase() === email)
      if (found) {
        const { error: updateError } = await admin.auth.admin.updateUserById(found.id, { email_confirm: true })
        return !updateError
      }
      if (data.users.length < 200) return false
    }
    return false
  } catch {
    return false
  }
}

/** Sends a fresh confirmation link to an account that hasn't confirmed its email. */
export async function resendConfirmation(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." }
  const supabase = await createClient()
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: await confirmUrl(safePath(formData.get("next"), "/onboarding")) },
  })
  if (error) {
    return { error: error.status === 429 ? "Please wait a minute before asking for another email." : error.message }
  }
  return { message: `We sent a new link to ${email}. It can take a minute — check spam too.` }
}

/**
 * Create an account and sign straight in. No confirmation email.
 *
 * Signing up used to mean: fill the form, go to your inbox, find the mail,
 * click a link, come back. Four steps and a different app, before you have seen
 * anything the product does — and every one of them a place to give up. It also
 * made the thing impossible to demonstrate, since a new account could not be
 * used at the moment it was made.
 *
 * Proving you own the address is worth doing when somebody is being given
 * access to *someone else's* company data. That is the invitation flow, and it
 * still proves it: the token is emailed to the address that was invited, and
 * accepting requires being signed in as that address. Nothing here weakens
 * that. Proving it just to let a person budget their own rent buys nothing.
 *
 * How, without a project-wide setting: the account is created through the admin
 * API with the address already marked confirmed, then signed in with the
 * password that was just set. The service role key never leaves the server.
 *
 * If that key is missing the old path still runs, so a deployment without it
 * degrades to "check your email" rather than to a broken signup.
 */
export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  // Which tab they signed up under. Recorded on the user as well as in the
  // redirect, so the answer survives however they arrive back.
  const individual = formData.get("accountType") === "individual"
  const next = safePath(formData.get("next"), individual ? "/onboarding?type=individual" : "/onboarding")

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." }
  if (password.length < 8) return { error: "Use at least 8 characters for your password." }

  const metadata = { full_name: name, account_type: individual ? "individual" : "business" }
  const supabase = await createClient()

  if (canSendEmail) {
    const admin = createAdminClient()
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    })

    if (error) {
      // Supabase reports an existing address here rather than at sign-in, and
      // "already registered" is a dead end unless it says what to do about it.
      const taken = error.status === 422 || /already|exists|registered/i.test(error.message)
      return {
        error: taken
          ? "That email already has an account. Sign in instead, or use a different address."
          : error.message,
      }
    }

    // Created, so these are known-good credentials; a failure now is the
    // session, not the account, and saying "signed up — please sign in" is
    // truthful where repeating the form would not be.
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) return { error: "Your account is ready — please sign in." }
    redirect(next)
  }

  // No service role key: fall back to Supabase's own signup, which may email.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata, emailRedirectTo: await confirmUrl(next) },
  })
  if (error) return { error: error.message }
  if (data.session) redirect(next)
  return { message: email }
}

export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." }
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await confirmUrl("/reset-password"),
  })
  // Same answer whether or not the account exists, so the form can't be used to probe emails.
  if (error && error.status === 429) return { error: "Too many requests — wait a minute and try again." }
  return { message: email }
}

/** Sets a new password for the user signed in through a reset or invitation link. */
export async function updatePassword(_: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "")
  const confirm = String(formData.get("confirm") ?? "")
  const next = safePath(formData.get("next"), "/dashboard")
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
  redirect(next)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  ;(await cookies()).delete(ORG_COOKIE)
  redirect("/login")
}
