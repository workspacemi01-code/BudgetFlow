"use server"

import { revalidatePath } from "next/cache"

import { canManageLines, isApprover } from "@/lib/roles"
import { requireOrg } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import type { FormState } from "@/lib/types"

function amountFrom(formData: FormData, field: string): number | null {
  const raw = String(formData.get(field) ?? "").replace(/,/g, "").trim()
  if (raw === "") return 0
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

export async function addDepartment(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireOrg()
  if (!isApprover(ctx.role)) return { error: "Only owners, admins and finance can add departments." }
  if (!ctx.period) return { error: "This organization has no budget period yet." }

  const name = String(formData.get("name") ?? "").trim()
  const code = (String(formData.get("code") ?? "").trim() || name.slice(0, 3)).toUpperCase()
  const budget = amountFrom(formData, "budget")
  if (name.length < 1) return { error: "Enter a department name." }
  if (code.length > 20) return { error: "Keep the code under 20 characters." }
  if (budget === null) return { error: "Enter the annual budget as a number." }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("departments")
    .insert({ org_id: ctx.org.id, name, code })
    .select("id")
    .single()
  if (error) return { error: error.code === "23505" ? `The code ${code} is already used.` : error.message }

  if (budget > 0) {
    const { error: budgetError } = await supabase.from("department_budgets").insert({
      org_id: ctx.org.id,
      department_id: data.id,
      period_id: ctx.period.id,
      annual_budget: budget,
    })
    if (budgetError) return { error: budgetError.message }
  }
  revalidatePath("/", "layout")
  return { message: `${name} added.` }
}

export async function addBudgetLine(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireOrg()
  if (!canManageLines(ctx.role)) return { error: "Viewers can't add budget lines." }
  if (!ctx.period) return { error: "This organization has no budget period yet." }

  const departmentId = String(formData.get("departmentId") ?? "")
  const brandName = String(formData.get("brand") ?? "").trim()
  const categoryName = String(formData.get("category") ?? "").trim()
  const budget = amountFrom(formData, "budget")
  if (!departmentId) return { error: "Choose a department." }
  if (ctx.departmentIds && !ctx.departmentIds.includes(departmentId)) {
    return { error: "You can only add lines to your own departments." }
  }
  if (!categoryName) return { error: "Choose or type a category." }
  if (budget === null) return { error: "Enter the annual budget as a number." }

  const supabase = await createClient()
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

  // Category: reuse by name, or create it (finance and above only).
  const { data: categories, error: categoryError } = await supabase
    .from("categories")
    .select("id, name")
    .eq("org_id", ctx.org.id)
  if (categoryError) return { error: categoryError.message }
  let categoryId = categories?.find((c) => same(c.name, categoryName))?.id as string | undefined
  if (!categoryId) {
    if (!isApprover(ctx.role)) return { error: `There's no "${categoryName}" category yet — ask Finance to add it.` }
    const { data, error } = await supabase
      .from("categories")
      .insert({ org_id: ctx.org.id, name: categoryName })
      .select("id")
      .single()
    if (error) return { error: error.message }
    categoryId = data.id
  }

  // Brand / project is optional and belongs to one department.
  let brandId: string | null = null
  if (brandName) {
    const { data: brands, error: brandError } = await supabase
      .from("brands")
      .select("id, name")
      .eq("department_id", departmentId)
    if (brandError) return { error: brandError.message }
    brandId = (brands?.find((b) => same(b.name, brandName))?.id as string | undefined) ?? null
    if (!brandId) {
      const { data, error } = await supabase
        .from("brands")
        .insert({ org_id: ctx.org.id, department_id: departmentId, name: brandName })
        .select("id")
        .single()
      if (error) return { error: error.message }
      brandId = data.id
    }
  }

  const { error } = await supabase.from("budget_lines").insert({
    org_id: ctx.org.id,
    period_id: ctx.period.id,
    department_id: departmentId,
    brand_id: brandId,
    category_id: categoryId,
    annual_budget: budget,
  })
  if (error) return { error: error.code === "23505" ? "That budget line already exists." : error.message }
  revalidatePath("/", "layout")
  return { message: "Budget line added." }
}
