"use client"

import { Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import { downloadCsv } from "@/lib/csv"

export function ExportCsvButton({
  filename,
  header,
  rows,
  label = "Export CSV",
}: {
  filename: string
  header: string[]
  rows: (string | number)[][]
  label?: string
}) {
  return (
    <Button variant="outline" className="h-10 px-3" onClick={() => downloadCsv(filename, header, rows)}>
      <Download />
      {label}
    </Button>
  )
}
