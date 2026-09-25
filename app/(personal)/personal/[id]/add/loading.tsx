// The add screen's own shape: a big amount at the top, then chips and fields.
export default function Loading() {
  const block = "animate-pulse rounded-xl bg-muted"
  return (
    <div role="status" aria-label="Loading" className="space-y-5">
      <div className="space-y-2 pt-4 text-center">
        <div className="mx-auto h-3 w-20 animate-pulse rounded bg-muted" />
        <div className="mx-auto h-12 w-48 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="flex flex-wrap gap-2">
        {[64, 80, 96, 72, 60].map((w, i) => (
          <div key={i} className="h-11 animate-pulse rounded-full bg-muted" style={{ width: w }} />
        ))}
      </div>
      <div className={`${block} h-12`} />
      <div className={`${block} h-12`} />
      <div className={`${block} h-14`} />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
