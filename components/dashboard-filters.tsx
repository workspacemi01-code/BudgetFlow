"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useTransition } from "react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export interface FilterOption {
  id: string
  name: string
  /** Only on units, so choosing a department can narrow the unit list. */
  departmentId?: string
}

const GRAINS = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
] as const

/**
 * The dashboard's filters: how finely to cut the chart, and whose spend to
 * count.
 *
 * State lives in the URL rather than in the component, so a filtered view can
 * be sent to someone, survives a refresh, and lets the page stay a server
 * component that reads searchParams — which is also why the numbers are
 * filtered in the query instead of in the browser.
 *
 * The lists handed in are already limited to what this person may see, so a
 * line manager is not offered departments they have no access to and then
 * shown an empty result.
 */
export function DashboardFilters({
  departments,
  units,
  unitLabel,
  showDepartments,
}: {
  departments: FilterOption[]
  units: FilterOption[]
  /** Orgs name this level themselves: Brand, Unit, Cost Center. */
  unitLabel: string
  showDepartments: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  const grain = params.get("grain") ?? "month"
  const department = params.get("department") ?? ""
  const unit = params.get("unit") ?? ""

  const apply = useCallback(
    (changes: Record<string, string>) => {
      const next = new URLSearchParams(params.toString())
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      startTransition(() => router.replace(`?${next.toString()}`, { scroll: false }))
    },
    [params, router],
  )

  /* A unit belongs to one department, so a unit chosen under a department that
     is then changed would silently filter to nothing. Clear it instead. */
  const onDepartment = (value: string) => apply({ department: value, unit: "" })

  const visibleUnits = department ? units.filter((u) => u.departmentId === department) : units

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3 transition-opacity",
        pending && "opacity-60",
      )}
    >
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Show by</Label>
        <div className="flex rounded-md border p-0.5">
          {GRAINS.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => apply({ grain: g.value })}
              aria-pressed={grain === g.value}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                grain === g.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {showDepartments && departments.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="filter-department" className="text-xs text-muted-foreground">
            Department
          </Label>
          <select
            id="filter-department"
            value={department}
            onChange={(e) => onDepartment(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {visibleUnits.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="filter-unit" className="text-xs text-muted-foreground">
            {unitLabel}
          </Label>
          <select
            id="filter-unit"
            value={unit}
            onChange={(e) => apply({ unit: e.target.value })}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">All {unitLabel.toLowerCase()}s</option>
            {visibleUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {(department || unit || grain !== "month") && (
        <button
          type="button"
          onClick={() => apply({ department: "", unit: "", grain: "" })}
          className="h-9 px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  )
}
