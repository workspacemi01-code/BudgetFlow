// What each role may do in the UI. The database enforces the same rules with
// RLS and triggers (supabase/migrations/0001_init.sql) — these only decide
// which buttons to show.

import type { Role } from "@/lib/types"

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  finance: "Finance",
  dept_manager: "Department manager",
  viewer: "Viewer",
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Full control, including other owners.",
  admin: "Manages people, departments and budgets.",
  finance: "Sets budgets, approves spend and records payments.",
  dept_manager: "Raises spend and manages lines in their departments.",
  viewer: "Read-only access.",
}

/** Roles an inviter may hand out. Only owners can create other owners. */
export function invitableRoles(inviter: Role): Role[] {
  const roles: Role[] = ["admin", "finance", "dept_manager", "viewer"]
  return inviter === "owner" ? ["owner", ...roles] : roles
}

export const isAdmin = (role: Role) => role === "owner" || role === "admin"

/** Owners, admins and finance approve spend, set budgets and record payments. */
export const isApprover = (role: Role) => isAdmin(role) || role === "finance"

export const canRaiseSpend = (role: Role) => role !== "viewer"

export const canManageLines = (role: Role) => role !== "viewer"
