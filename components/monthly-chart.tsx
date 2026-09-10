"use client"

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import type { MonthTotal } from "@/lib/queries"
import { formatMoney } from "@/lib/format"

export function MonthlyChart({ data, currency }: { data: MonthTotal[]; currency: string }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        No approved spend yet this period.
      </div>
    )
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
          <YAxis
            tickLine={false}
            axisLine={false}
            fontSize={12}
            width={56}
            stroke="var(--muted-foreground)"
            tickFormatter={(value: number) => formatMoney(value, currency, { compact: true })}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            formatter={(value) => formatMoney(Number(value), currency)}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="spent" name="Spent" stackId="spend" fill="var(--chart-1)" />
          <Bar dataKey="committed" name="Committed" stackId="spend" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
