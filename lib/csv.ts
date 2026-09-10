type Cell = string | number

function escapeCell(value: Cell): string {
  let text = String(value)
  // Stop spreadsheet apps from executing text that looks like a formula.
  if (typeof value === "string" && /^[=+\-@]/.test(text)) text = `'${text}`
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function downloadCsv(filename: string, header: string[], rows: Cell[][]): void {
  const csv = [header, ...rows].map((row) => row.map(escapeCell).join(",")).join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
