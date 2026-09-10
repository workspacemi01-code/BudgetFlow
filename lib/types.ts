export type Role = "owner" | "admin" | "finance" | "dept_manager" | "viewer"

export type TxnStatus = "draft" | "pending" | "approved" | "partially_paid" | "paid" | "rejected" | "voided"

/** Result of a form's server action, fed back through useActionState. */
export interface FormState {
  error?: string
  message?: string
  /** Set when sign-in failed only because this email isn't confirmed yet. */
  unconfirmedEmail?: string
}
