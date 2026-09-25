// A search box, then days of spending.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
      <div className="h-12 animate-pulse rounded-lg bg-muted" />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="h-32 animate-pulse rounded-xl bg-muted" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  )
}
