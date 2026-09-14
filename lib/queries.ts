// Reads for the app pages. All totals come from the database views, which
// derive spent / committed / available from raw transactions and payments.

import { createClient } from "@/lib/supabase/server"
import type { OrgContext } from "@/lib/session"
import type { Role, TxnStatus } from "@/lib/types"

type Row = Record<string, unknown>

const num = (value: unknown) => Number(value ?? 0)
const str = (value: unknown) => (value == null ? null : String(value))

function rows(result: { data: unknown; error: { message: string } | null }): Row[] {
  if (result.error) throw new Error(result.error.message)
  return (result.data ?? []) as Row[]
}

export const lineLabel = (...parts: (string | null)[]) => parts.filter(Boolean).join(" › ")

// ---------------------------------------------------------------------------
// Budget lines
// ---------------------------------------------------------------------------

export interface LineTotal {
  id: string
  departmentId: string
  departmentName: string
  brandId: string | null
  brandName: string | null
  categoryId: string
  categoryName: string
  annualBudget: number
  /** Annual budget plus approved transfers in, minus transfers out. */
  budget: number
  spent: number
  committed: number
  available: number
  utilisation: number
  pendingCount: number
  pendingAmount: number
  label: string
}

function toLine(r: Row): LineTotal {
  const departmentName = String(r.department_name)
  const brandName = str(r.brand_name)
  const categoryName = String(r.category_name)
  return {
    id: String(r.budget_line_id),
    departmentId: String(r.department_id),
    departmentName,
    brandId: str(r.brand_id),
    brandName,
    categoryId: String(r.category_id),
    categoryName,
    annualBudget: num(r.annual_budget),
    budget: num(r.effective_budget),
    spent: num(r.spent),
    committed: num(r.committed),
    available: num(r.available),
    utilisation: num(r.utilisation_pct),
    pendingCount: num(r.pending_count),
    pendingAmount: num(r.pending_amount),
    label: lineLabel(departmentName, brandName, categoryName),
  }
}

export async function getLineTotals(ctx: OrgContext): Promise<LineTotal[]> {
  if (!ctx.period) return []
  const supabase = await createClient()
  const result = await supabase
    .from("v_budget_line_totals")
    .select("*")
    .eq("org_id", ctx.org.id)
    .eq("period_id", ctx.period.id)
    .order("department_name")
    .order("brand_name", { nullsFirst: true })
    .order("category_name")
  return rows(result).map(toLine)
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export interface DepartmentSummary {
  id: string
  name: string
  code: string
  /** Department budget for the period (plus net transfers). 0 until one is set. */
  budget: number
  allocated: number
  unallocated: number
  spent: number
  committed: number
  available: number
  utilisation: number
  lineCount: number
}

export async function getDepartmentSummaries(ctx: OrgContext): Promise<DepartmentSummary[]> {
  const supabase = await createClient()
  const [departments, summary] = await Promise.all([
    supabase.from("departments").select("id, name, code").eq("org_id", ctx.org.id).is("archived_at", null).order("name"),
    ctx.period
      ? supabase.from("v_department_summary").select("*").eq("org_id", ctx.org.id).eq("period_id", ctx.period.id)
      : Promise.resolve({ data: [], error: null }),
  ])
  const byId = new Map(rows(summary).map((r) => [String(r.department_id), r]))

  // The view only lists departments that have a budget or lines; new ones still show here.
  return rows(departments).map((d) => {
    const s = byId.get(String(d.id))
    return {
      id: String(d.id),
      name: String(d.name),
      code: String(d.code),
      budget: num(s?.budget),
      allocated: num(s?.allocated),
      unallocated: num(s?.unallocated),
      spent: num(s?.spent),
      committed: num(s?.committed),
      available: num(s?.available),
      utilisation: num(s?.utilisation_pct),
      lineCount: num(s?.line_count),
    }
  })
}

export interface Option {
  id: string
  name: string
}

export async function getDepartments(ctx: OrgContext): Promise<(Option & { code: string })[]> {
  const supabase = await createClient()
  const result = await supabase
    .from("departments")
    .select("id, name, code")
    .eq("org_id", ctx.org.id)
    .is("archived_at", null)
    .order("name")
  return rows(result).map((d) => ({ id: String(d.id), name: String(d.name), code: String(d.code) }))
}

export async function getCategories(ctx: OrgContext): Promise<Option[]> {
  const supabase = await createClient()
  const result = await supabase
    .from("categories")
    .select("id, name")
    .eq("org_id", ctx.org.id)
    .is("archived_at", null)
    .order("name")
  return rows(result).map((c) => ({ id: String(c.id), name: String(c.name) }))
}

export async function getBrands(ctx: OrgContext): Promise<(Option & { departmentId: string })[]> {
  const supabase = await createClient()
  const result = await supabase
    .from("brands")
    .select("id, name, department_id")
    .eq("org_id", ctx.org.id)
    .is("archived_at", null)
    .order("name")
  return rows(result).map((b) => ({ id: String(b.id), name: String(b.name), departmentId: String(b.department_id) }))
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export interface Txn {
  id: string
  code: string
  date: string
  description: string
  vendor: string | null
  status: TxnStatus
  overBudget: boolean
  amount: number
  paid: number
  lineId: string
  departmentId: string
  departmentName: string
  lineLabel: string
  createdBy: string | null
  rejectionReason: string | null
  voidReason: string | null
}

function toTxn(r: Row): Txn {
  const departmentName = String(r.department_name)
  return {
    id: String(r.id),
    code: String(r.txn_code),
    date: String(r.txn_date),
    description: String(r.description),
    vendor: str(r.vendor),
    status: r.status as TxnStatus,
    overBudget: Boolean(r.over_budget),
    amount: num(r.approved_amount),
    paid: num(r.paid_amount),
    lineId: String(r.budget_line_id),
    departmentId: String(r.department_id),
    departmentName,
    lineLabel: lineLabel(departmentName, str(r.brand_name), String(r.category_name)),
    createdBy: str(r.created_by),
    rejectionReason: str(r.rejection_reason),
    voidReason: str(r.void_reason),
  }
}

export async function getTransactions(
  ctx: OrgContext,
  options: { statuses?: TxnStatus[]; limit?: number } = {}
): Promise<Txn[]> {
  const supabase = await createClient()
  let query = supabase.from("v_transactions").select("*").eq("org_id", ctx.org.id)
  if (ctx.period) query = query.eq("period_id", ctx.period.id)
  if (options.statuses) query = query.in("status", options.statuses)
  query = query.order("txn_date", { ascending: false }).order("created_at", { ascending: false })
  if (options.limit) query = query.limit(options.limit)
  return rows(await query).map(toTxn)
}

export async function getPendingCount(ctx: OrgContext): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.org.id)
    .eq("status", "pending")
  if (error) throw new Error(error.message)
  return count ?? 0
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

export interface MonthTotal {
  key: string
  label: string
  count: number
  approved: number
  spent: number
  committed: number
}

const monthName = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" })

export async function getMonthlySummary(ctx: OrgContext): Promise<MonthTotal[]> {
  if (!ctx.period) return []
  const supabase = await createClient()
  const result = await supabase
    .from("v_monthly_summary")
    .select("month, transaction_count, approved, spent, committed")
    .eq("org_id", ctx.org.id)
    .eq("period_id", ctx.period.id)

  // The view is per department per month; fold it into org-wide months.
  const months = new Map<string, MonthTotal>()
  for (const r of rows(result)) {
    const key = String(r.month).slice(0, 7)
    const month = months.get(key) ?? {
      key,
      label: monthName.format(new Date(`${key}-01T00:00:00Z`)),
      count: 0,
      approved: 0,
      spent: 0,
      committed: 0,
    }
    month.count += num(r.transaction_count)
    month.approved += num(r.approved)
    month.spent += num(r.spent)
    month.committed += num(r.committed)
    months.set(key, month)
  }
  return [...months.values()].sort((a, b) => a.key.localeCompare(b.key))
}

export interface Totals {
  budget: number
  spent: number
  committed: number
  available: number
  utilisation: number
}

export function totalsOf(items: { budget: number; spent: number; committed: number }[]): Totals {
  const budget = items.reduce((sum, i) => sum + i.budget, 0)
  const spent = items.reduce((sum, i) => sum + i.spent, 0)
  const committed = items.reduce((sum, i) => sum + i.committed, 0)
  return {
    budget,
    spent,
    committed,
    available: budget - spent - committed,
    utilisation: budget > 0 ? ((spent + committed) / budget) * 100 : 0,
  }
}

export function totalsByCategory(lines: LineTotal[]): (Totals & { name: string })[] {
  const groups = new Map<string, LineTotal[]>()
  for (const line of lines) groups.set(line.categoryName, [...(groups.get(line.categoryName) ?? []), line])
  return [...groups.entries()]
    .map(([name, items]) => ({ name, ...totalsOf(items) }))
    .sort((a, b) => b.spent + b.committed - (a.spent + a.committed))
}

// ---------------------------------------------------------------------------
// People & activity
// ---------------------------------------------------------------------------

export interface Member {
  membershipId: string
  userId: string | null
  name: string
  email: string
  role: Role
  status: "active" | "pending" | "suspended"
  departmentIds: string[]
  /** Pending invitations only: the token in their link, and when it stops working. */
  inviteToken: string | null
  inviteExpiresAt: string | null
}

export async function profileNames(userIds: string[]): Promise<Map<string, { name: string; email: string }>> {
  if (userIds.length === 0) return new Map()
  const supabase = await createClient()
  const result = await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
  return new Map(
    rows(result).map((p) => [
      String(p.id),
      { name: str(p.full_name) || String(p.email ?? "").split("@")[0], email: String(p.email ?? "") },
    ])
  )
}

export async function getMembers(ctx: OrgContext): Promise<Member[]> {
  const supabase = await createClient()
  const result = await supabase
    .from("memberships")
    .select(
      "id, user_id, invited_email, role, status, invite_token, invite_expires_at, membership_departments (department_id)"
    )
    .eq("org_id", ctx.org.id)
    .order("created_at")
  const memberships = rows(result)
  const profiles = await profileNames(memberships.map((m) => str(m.user_id)).filter((id): id is string => !!id))

  return memberships.map((m) => {
    const profile = m.user_id ? profiles.get(String(m.user_id)) : undefined
    const email = profile?.email || String(m.invited_email ?? "")
    return {
      membershipId: String(m.id),
      userId: str(m.user_id),
      name: profile?.name || email,
      email,
      role: m.role as Role,
      status: m.status as Member["status"],
      departmentIds: ((m.membership_departments ?? []) as Row[]).map((d) => String(d.department_id)),
      inviteToken: m.status === "pending" ? str(m.invite_token) : null,
      inviteExpiresAt: m.status === "pending" ? str(m.invite_expires_at) : null,
    }
  })
}

export interface AuditEntry {
  id: string
  at: string
  actor: string
  entity: string
  action: "insert" | "update" | "delete"
  before: Row | null
  after: Row | null
}

export async function getAuditLog(ctx: OrgContext, limit = 40): Promise<AuditEntry[]> {
  const supabase = await createClient()
  const result = await supabase
    .from("audit_logs")
    .select("id, created_at, actor_id, entity, action, before, after")
    .eq("org_id", ctx.org.id)
    .order("created_at", { ascending: false })
    .limit(limit)
  const entries = rows(result)
  const actors = await profileNames([...new Set(entries.map((e) => str(e.actor_id)).filter((id): id is string => !!id))])
  return entries.map((e) => ({
    id: String(e.id),
    at: String(e.created_at),
    actor: e.actor_id ? (actors.get(String(e.actor_id))?.name ?? "A former member") : "System",
    entity: String(e.entity),
    action: e.action as AuditEntry["action"],
    before: (e.before as Row | null) ?? null,
    after: (e.after as Row | null) ?? null,
  }))
}
