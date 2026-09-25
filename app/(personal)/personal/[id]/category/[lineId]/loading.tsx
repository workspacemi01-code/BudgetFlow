import { Block, LoadingBar } from "@/components/personal/skeleton"

// One category: the figure, the add form, then its spends.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <LoadingBar />
      <Block className="h-4 w-28" />
      <Block className="h-44" />
      <Block className="h-32" />
      <Block className="h-40" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
