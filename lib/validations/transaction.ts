import { z } from "zod"

// Shared between the client form and (later) the Supabase Edge Function.
export const transactionSchema = z.object({
  departmentId: z.string().min(1, "Choose a department"),
  budgetLineId: z.string().min(1, "Choose a budget line"),
  amount: z.number({ error: "Enter an amount" }).positive("Amount must be more than zero"),
  txnDate: z.string().min(1, "Pick a date"),
  description: z
    .string()
    .trim()
    .min(3, "Describe what this spend is for")
    .max(200, "Keep it under 200 characters"),
  vendor: z.string().trim().max(120, "Keep it under 120 characters").optional(),
})

export type TransactionInput = z.infer<typeof transactionSchema>
