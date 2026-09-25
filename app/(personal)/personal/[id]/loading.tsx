import { Block, LoadingBar } from "@/components/personal/skeleton"

// Shown the instant a tab is tapped, so the app answers immediately even while
// the numbers are still on their way.
//
// Shaped like the screen it stands in for — one big figure, then a list —
// rather than a spinner. A spinner says "wait"; this says "your budget is
// arriving", and because the blocks land where the real content will be,
// nothing jumps when it does.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading your budget" className="space-y-4">
      <LoadingBar />

      {/* The headline card: the big number, its bar, and the two figures. */}
      <div className="rounded-xl border bg-card p-6">
        <div className="space-y-2 text-center">
          <Block className="mx-auto h-3 w-32" />
          <Block className="mx-auto h-11 w-56" />
          <Block className="mx-auto h-4 w-40" />
        </div>
        <Block className="mt-4 h-2.5 rounded-full" />
        <div className="mt-4 flex justify-between">
          <Block className="h-8 w-24" />
          <Block className="h-8 w-24" />
        </div>
      </div>

      <Block className="h-3 w-28" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border bg-card p-4">
          <div className="flex justify-between gap-3">
            <Block className="h-4 w-24" />
            <Block className="h-4 w-20" />
          </div>
          <Block className="mt-3 h-1.5 rounded-full" />
        </div>
      ))}

      <span className="sr-only">Loading…</span>
    </div>
  )
}
