"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useTransition } from "react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export interface FilterOption {
  id: string
  name: string
  /** A brand's department, or a unit's brand — whichever sits above it. */
  parentId?: string
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
  brands,
  units,
  brandLabel,
  showDepartments,
}: {
  departments: FilterOption[]
  brands: FilterOption[]
  units: FilterOption[]
  /** Orgs name the middle level themselves: Brand, Project, Cost Center. */
  brandLabel: string
  showDepartments: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  const grain = params.get("grain") ?? "month"
  const department = params.get("department") ?? ""
  const brand = params.get("brand") ?? ""
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

  /* Each level belongs to exactly one above it, so changing a parent would
     leave a child filtering to nothing. Clear what is below instead. */
  const onDepartment = (value: string) => apply({ department: value, brand: "", unit: "" })
  const onBrand = (value: string) => apply({ brand: value, unit: "" })

  const visibleBrands = department ? brands.filter((b) => b.parentId === department) : brands
  /* With a brand chosen, its units. With only a department chosen, the units of
     every brand in it — so the list still narrows one step at a time. */
  const brandIds = new Set(visibleBrands.map((b) => b.id))
  const visibleUnits = brand
    ? units.filter((u) => u.parentId === brand)
    : department
      ? units.filter((u) => u.parentId && brandIds.has(u.parentId))
      : units

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

      <div className="space-y-1.5">
        <Label htmlFor="filter-brand" className="text-xs text-muted-foreground">
          {brandLabel}
        </Label>
        <select
          id="filter-brand"
          value={brand}
          disabled={visibleBrands.length === 0}
          onChange={(e) => onBrand(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {visibleBrands.length === 0 ? (
            <option value="">
              {department ? `No ${brandLabel.toLowerCase()}s here` : `No ${brandLabel.toLowerCase()}s yet`}
            </option>
          ) : (
            <>
              <option value="">All {brandLabel.toLowerCase()}s</option>
              {visibleBrands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </>
          )}
        </select>
      </div>

      {/* Shown even with nothing in it. Hiding the control made a brand with no
          units look like a dashboard missing a filter, rather than one with
          nothing to filter by. */}
      <div className="space-y-1.5">
        <Label htmlFor="filter-unit" className="text-xs text-muted-foreground">
          Unit
        </Label>
        <select
          id="filter-unit"
          value={unit}
          disabled={visibleUnits.length === 0}
          onChange={(e) => apply({ unit: e.target.value })}
          className="h-9 rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {visibleUnits.length === 0 ? (
            <option value="">{brand || department ? "No units here" : "No units yet"}</option>
          ) : (
            <>
              <option value="">All units</option>
              {visibleUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </>
          )}
        </select>
      </div>

      {(department || brand || unit || grain !== "month") && (
        <button
          type="button"
          onClick={() => apply({ department: "", brand: "", unit: "", grain: "" })}
          className="h-9 px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  )
}
