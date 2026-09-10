# Email templates

Branded emails for Supabase Auth. Supabase doesn't read these files — paste them into the dashboard.

| Dashboard template (Authentication → Emails → Templates) | Subject | Body |
|---|---|---|
| Confirm signup | `Confirm your BudgetFlow account` | [confirm-signup.html](confirm-signup.html) |
| Reset Password | `Reset your BudgetFlow password` | [reset-password.html](reset-password.html) |

Both links point to `{{ .SiteURL }}/auth/confirm?token_hash=…`, which [app/auth/confirm/route.ts](../../app/auth/confirm/route.ts)
verifies. Unlike Supabase's default `?code=` links, token-hash links work on any device or browser.

## Required settings

- **Authentication → URL Configuration → Site URL** must be the live app address
  (e.g. `https://budget-flow-two-sigma.vercel.app`) — the links are built from it.
- **Redirect URLs**: add `https://<live address>/**` and `http://localhost:3000/**`.

## For production sending

Supabase's built-in mailer sends from a Supabase address and only a few emails per hour. Before real
customers sign up, set **Authentication → Emails → SMTP Settings** to your own provider (e.g. Resend,
Postmark, SendGrid) with sender name **BudgetFlow** and an address on your domain, such as
`no-reply@yourdomain.com`.
