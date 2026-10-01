// What each role may do in the UI. The database enforces the same rules with
// RLS and triggers (supabase/migrations/0001_init.sql) — these only decide
// which buttons to show.

import type { Role } from "@/lib/types"

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  finance: "Finance",
  dept_manager: "Department manager",
  line_manager: "Unit manager",
  officer: "Officer",
  viewer: "Viewer",
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Full control, including other owners.",
  admin: "Manages people, departments and budgets.",
  finance: "Sets budgets, approves spend and records payments.",
  dept_manager: "Raises spend and manages lines in their departments.",
  line_manager: "Edits their own units. Sees the rest of the department read-only.",
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

/** Who may filter across the whole organisation, department by department. */
export const canFilterDepartments = (role: Role) => isApprover(role)
