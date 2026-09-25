import type { Metadata } from "next"

import { PageHeader } from "@/components/page-header"
import { InviteForm, OrgSettingsForm, RemoveMemberButton, ResendInviteButton } from "@/components/settings-forms"
import { STATUS_LABELS } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CURRENCIES, formatDateTime, formatMoney } from "@/lib/format"
import { getAuditLog, getDepartments, getMembers, type AuditEntry } from "@/lib/queries"
import { ROLE_LABELS, invitableRoles, isAdmin, isApprover } from "@/lib/roles"
import { requireOrg } from "@/lib/session"
import { inviteUrl, siteOrigin } from "@/lib/site"
import type { TxnStatus } from "@/lib/types"

export const metadata: Metadata = { title: "Settings" }

const ENTITY_LABELS: Record<string, string> = {
  organizations: "organization settings",
  memberships: "membership",
  membership_departments: "department access",
  budget_periods: "budget period",
  departments: "department",
  department_budgets: "department budget",
  brands: "brand",
  categories: "category",
  budget_lines: "budget line",
  transactions: "transaction",
  payments: "payment",
  budget_transfers: "budget transfer",
  comments: "comment",
  alerts: "alert",
}

const VERBS = { insert: "added", update: "updated", delete: "removed" } as const

function describe(entry: AuditEntry, currency: string): { what: string; detail?: string } {
  const row = entry.after ?? entry.before ?? {}
  const name = (row.txn_code ?? row.name ?? row.invited_email ?? "") as string
  const amount = row.approved_amount ?? row.amount ?? row.annual_budget
  const detail = typeof amount === "number" || typeof amount === "string" ? formatMoney(Number(amount), currency) : undefined

  if (entry.entity === "transactions" && entry.action === "update" && entry.before?.status !== entry.after?.status) {
    const status = entry.after?.status as TxnStatus
    return { what: `marked ${name} as ${STATUS_LABELS[status]?.toLowerCase() ?? status}`, detail }
  }
  const label = ENTITY_LABELS[entry.entity] ?? entry.entity
  return { what: `${VERBS[entry.action]} ${label}${name ? ` ${name}` : ""}`, detail }
}

export default async function SettingsPage() {
  const ctx = await requireOrg()
  const admin = isAdmin(ctx.role)
  const [members, departments, audit, origin] = await Promise.all([
    getMembers(ctx),
    getDepartments(ctx),
    isApprover(ctx.role) ? getAuditLog(ctx) : Promise.resolve([]),
    siteOrigin(),
  ])
  const departmentName = new Map(departments.map((d) => [d.id, d.name]))

  const details = [
    { label: "Organization", value: ctx.org.name },
    { label: "Currency", value: CURRENCIES.find((c) => c.code === ctx.org.currency)?.name ?? ctx.org.currency },
    { label: "Budget period", value: ctx.period?.name ?? "—" },
    { label: "Over-budget approvals", value: ctx.org.allow_over_budget ? "Allowed for owners and admins" : "Blocked" },
  ]

  return (
    <>
      <PageHeader title="Settings" description="Organization details, people and activity." />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
            {!admin && <CardDescription>Only owners and admins can change these.</CardDescription>}
          </CardHeader>
          <CardContent>
            {admin ? (
              <OrgSettingsForm
                org={{
                  name: ctx.org.name,
                  currency: ctx.org.currency,
                  allowOverBudget: ctx.org.allow_over_budget,
                }}
              />
            ) : (
              <dl className="grid gap-3 text-sm">
                {details.map((item) => (
                  <div key={item.label}>
                    <dt className="text-xs text-muted-foreground">{item.label}</dt>
                    <dd className="font-medium">{item.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>People</CardTitle>
            <CardDescription>Department managers only see the departments they are assigned to.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Departments</TableHead>
                    <TableHead>Status</TableHead>
                    {admin && <TableHead className="w-48" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.membershipId}>
                      <TableCell>
                        <div className="font-medium">{m.name}</div>
                        {m.name !== m.email && <div className="text-xs text-muted-foreground">{m.email}</div>}
                      </TableCell>
                      <TableCell>{ROLE_LABELS[m.role]}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {m.departmentIds.length > 0
                          ? m.departmentIds.map((id) => departmentName.get(id) ?? "—").join(", ")
                          : m.role === "dept_manager"
                            ? "None assigned"
                            : "All departments"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.status === "active" ? "secondary" : "outline"}>
                          {m.status === "active" ? "Active" : m.status === "pending" ? "Invited" : "Suspended"}
                        </Badge>
                        {m.status === "pending" && m.inviteExpiresAt && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Link expires {formatDateTime(m.inviteExpiresAt)}
                          </div>
                        )}
                      </TableCell>
                      {admin && (
                        <TableCell className="space-y-1 text-right">
                          {m.status === "pending" && m.inviteToken && (
                            <ResendInviteButton
                              membershipId={m.membershipId}
                              inviteUrl={inviteUrl(origin, m.inviteToken)}
                            />
                          )}
                          {m.userId !== ctx.user.id && m.role !== "owner" && (
                            <RemoveMemberButton membershipId={m.membershipId} label={m.name} />
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {admin && (
              <div className="space-y-3 border-t pt-4">
                <div>
                  <h3 className="font-medium">Invite someone</h3>
                  <p className="text-xs text-muted-foreground">
                    We email them a link. It works for 7 days and only for this address.
                  </p>
                </div>
                <InviteForm
                  roles={invitableRoles(ctx.role)}
                  departments={departments.map((d) => ({ id: d.id, name: d.name }))}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {isApprover(ctx.role) && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <CardDescription>Every change is recorded. Nothing can be edited or deleted from this log.</CardDescription>
          </CardHeader>
          <CardContent>
            {audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="divide-y">
                {audit.map((entry) => {
                  const { what, detail } = describe(entry, ctx.org.currency)
                  return (
                    <li key={entry.id} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:gap-4">
                      <span className="w-36 shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatDateTime(entry.at)}
                      </span>
                      <div className="min-w-0 text-sm">
                        <span className="font-medium">{entry.actor}</span> {what}
                        {detail && <span className="text-muted-foreground"> · {detail}</span>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
