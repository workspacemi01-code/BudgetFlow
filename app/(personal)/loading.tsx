// Covers the personal screens that sit outside a budget — starting one, and
// the redirect that picks which budget to open.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <div className="h-48 animate-pulse rounded-xl bg-muted" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
