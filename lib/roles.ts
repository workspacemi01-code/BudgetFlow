// What each role may do in the UI. The database enforces the same rules with
// RLS and triggers (supabase/migrations/0001_init.sql) — these only decide
// which buttons to show.

import type { Role } from "@/lib/types"

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  finance: "Finance",
  dept_manager: "Department manager",
  line_manager: "Unit/Line manager",
  officer: "Unit officer",
  viewer: "Viewer",
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Full control, including other owners.",
  admin: "Manages people, departments and budgets.",
  finance: "Sets budgets, approves spend and records payments.",
  dept_manager: "Raises spend and manages lines in their departments.",
  line_manager: "Edits their own unit and sends approvals up. Sees the rest of the department read-only.",
  officer: "Spends within their own units. Cannot change a budget.",
  viewer: "Read-only access.",
}

/** Roles an inviter may hand out. Only owners can create other owners. */
export function invitableRoles(inviter: Role): Role[] {
  const roles: Role[] = ["admin", "finance", "dept_manager", "line_manager", "officer", "viewer"]
  return inviter === "owner" ? ["owner", ...roles] : roles
}

export const isAdmin = (role: Role) => role === "owner" || role === "admin"

/** Owners, admins and finance approve spend, set budgets and record payments. */
export const isApprover = (role: Role) => isAdmin(role) || role === "finance"

/**
 * Who sees the approvals queue.
 *
 * Wider than isApprover, because a department manager gives final approval for
 * their own department — the brief's words. Which department is theirs is not a
 * question this can answer, and it does not need to: the database scopes it
 * (can_approve_line in 0011), and the queue only ever contains rows RLS let
 * through. This decides whether the screen is worth showing at all.
 */
export const canApproveSpend = (role: Role) => isApprover(role) || role === "dept_manager"

export const canRaiseSpend = (role: Role) => role !== "viewer"

/**
 * Editing a budget and spending against it are different questions, and an
 * officer is exactly the person who may do the second and not the first. The
 * database draws the same line (can_edit_line vs can_spend_line in
 * supabase/migrations/0006_unit_scoping.sql); this only hides the button.
 */
export const canManageLines = (role: Role) => role !== "viewer" && role !== "officer"

/** Roles whose view is scoped to particular units rather than whole departments. */
export const isUnitScoped = (role: Role) => role === "line_manager" || role === "officer"

/*
 * There is deliberately no role check for the department filter.
 *
 * The list the dashboard offers comes back through RLS (departments_select
 * uses can_view_department), so it already holds exactly the departments this
 * person may see — one for a departmental account, all of them for a super
 * admin, their own for a department manager who runs several. Gating it on
 * role as well meant a department manager with two departments could not
 * switch between them, while the list sitting right there held both.
 *
 * The rule is simply: more than one to choose from, so offer the choice.
 */


/**
 * Palettes an organisation can choose between.
 *
 * Named rather than a free colour picker, because each one is tuned as a set —
 * including a warning colour that stays distinct from the brand colour. A red
 * brand with a red warning means an overspent line looks like every button on
 * the page, which is what made the first attempt at this unusable.
 */
export const BRAND_THEMES = [
  { value: "default", label: "Teal (default)", swatch: "#2a7f7f" },
  { value: "crimson", label: "Red & navy", swatch: "#ff0a11" },
] as const
