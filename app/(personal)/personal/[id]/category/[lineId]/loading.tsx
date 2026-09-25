// One category: its figure, the add form, then its spends.
export default function Loading() {
  const block = "animate-pulse rounded-xl bg-muted"
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <div className="h-4 w-28 animate-pulse rounded bg-muted" />
      <div className={`${block} h-44`} />
      <div className={`${block} h-32`} />
      <div className={`${block} h-40`} />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
