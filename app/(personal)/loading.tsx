import { Block, LoadingBar } from "@/components/personal/skeleton"

// Covers the personal screens outside a budget — starting one, and the
// redirect that decides which budget to open.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <LoadingBar />
      <Block className="h-48" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
