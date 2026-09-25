// Shown the instant a tab is tapped, so the app answers immediately even while
// the numbers are still coming from the database.
//
// Shaped like the screen it replaces — one big figure, then a list — rather
// than a spinner. A spinner says "wait"; this says "your budget is arriving",
// and because the blocks land where the real content will be, nothing jumps
// when it does.
export default function Loading() {
  const block = "animate-pulse rounded-xl bg-muted"
  return (
    <div role="status" aria-label="Loading your budget" className="space-y-4">
      <div className={`${block} h-56`} />
      <div className="space-y-2">
        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`${block} h-20`} />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}
