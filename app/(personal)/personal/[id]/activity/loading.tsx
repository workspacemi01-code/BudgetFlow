import { Block, LoadingBar } from "@/components/personal/skeleton"

// A title, a search box, then days of spending.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <LoadingBar />
      <Block className="h-6 w-40" />
      <Block className="h-12" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <Block className="h-3 w-24" />
          <Block className="h-28" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  )
}
