// Shown instantly while a page's data loads.
export default function Loading() {
  const block = "animate-pulse rounded-xl bg-muted"
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded-md bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`${block} h-24 ${i === 4 ? "col-span-2 lg:col-span-1" : ""}`} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`${block} h-72 lg:col-span-2`} />
        <div className={`${block} h-72`} />
      </div>
      <div className={`${block} h-64`} />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
