export type Role = "owner" | "admin" | "finance" | "dept_manager" | "viewer"

export type TxnStatus = "draft" | "pending" | "approved" | "partially_paid" | "paid" | "rejected" | "voided"

/** Result of a form's server action, fed back through useActionState. */
export interface FormState {
  error?: string
  message?: string
  /** Something worked, but not completely — e.g. the invitation saved but the email didn't send. */
  warning?: string
  /** Set when sign-in failed only because this email isn't confirmed yet. */
  unconfirmedEmail?: string
  /** An invitation link to show the inviter, so they can pass it on themselves. */
  inviteUrl?: string
}
