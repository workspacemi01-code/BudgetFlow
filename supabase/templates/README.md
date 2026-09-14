# Email templates

Branded emails for Supabase Auth. Supabase doesn't read these files — paste them into the dashboard.

| Dashboard template (Authentication → Emails → Templates) | Subject | Body |
|---|---|---|
| Confirm signup | `Confirm your BudgetFlow account` | [confirm-signup.html](confirm-signup.html) |
| Reset Password | `Reset your BudgetFlow password` | [reset-password.html](reset-password.html) |
| Invite user | `You've been invited to BudgetFlow` | [invite-user.html](invite-user.html) |
| Magic Link | `Your BudgetFlow sign-in link` | [magic-link.html](magic-link.html) |

All four link to `{{ .SiteURL }}/auth/confirm?token_hash=…`, which [app/auth/confirm/route.ts](../../app/auth/confirm/route.ts)
verifies. Unlike Supabase's default `?code=` links, token-hash links work on any device or browser.

## Invitations

Inviting someone in Settings writes a pending membership with a secret token and emails them a link to
`/invite/<token>`. Which of the two invitation templates goes out depends on the address:

- **No BudgetFlow account yet** → *Invite user*. Supabase creates the account with no password; after they
  join, the app sends them to `/reset-password?setup=1` to choose one.
- **Already has an account** → *Magic Link*. `admin.inviteUserByEmail` can't be used on an existing address,
  so the app asks for a sign-in link instead. Their password is untouched.

Both templates pass `next={{ .RedirectTo }}` so the link lands on the invitation's confirm page. `.RedirectTo`
is an absolute URL; the confirm route accepts that as long as the origin matches, and falls back to
`/onboarding` (which lists pending invitations) if it is ever empty.

**Both templates must be pasted in.** Supabase's stock *Invite user* template uses `{{ .ConfirmationURL }}`,
which produces a `?code=` link — that only works in the browser that started the flow, so it fails for an
emailed invitation.

## Required settings

- **Authentication → URL Configuration → Site URL** must be the live app address
  (e.g. `https://budget-flow-two-sigma.vercel.app`) — the links are built from it.
- **Redirect URLs**: add `https://<live address>/**` and `http://localhost:3000/**`. Invitations pass
  `/invite/<token>` as the redirect, so a missing wildcard silently drops people on the Site URL.
- **`SUPABASE_SERVICE_ROLE_KEY`** must be set wherever the app runs (Vercel → Settings → Environment
  Variables, and `.env.local` locally). Without it the invitation is still saved, but no email is sent —
  Settings says so and shows a link to pass on by hand.

## For production sending

Supabase's built-in mailer sends from a Supabase address and only a few emails per hour — enough to hit a
rate limit while inviting a team. Before real customers sign up, set **Authentication → Emails → SMTP
Settings** to your own provider (e.g. Resend, Postmark, SendGrid) with sender name **BudgetFlow** and an
address on your domain, such as `no-reply@yourdomain.com`.
