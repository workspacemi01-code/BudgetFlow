import { Block, LoadingBar } from "@/components/personal/skeleton"

// The add screen's own shape: a big amount, then chips, then fields.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-5">
      <LoadingBar />
      <div className="space-y-2 pt-4 text-center">
        <Block className="mx-auto h-3 w-20" />
        <Block className="mx-auto h-12 w-48" />
      </div>
      {/* Category chips, in the varied widths real names produce. */}
      <div className="flex flex-wrap gap-2">
        {["w-16", "w-20", "w-24", "w-[4.5rem]", "w-14"].map((w) => (
          <Block key={w} className={`h-11 rounded-full ${w}`} />
        ))}
      </div>
      <Block className="h-12" />
      <Block className="h-12" />
      <Block className="h-14" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
