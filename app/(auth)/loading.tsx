import { Spinner } from "@/components/spinner"

export default function Loading() {
  return (
    <div role="status" className="flex h-64 items-center justify-center rounded-xl bg-card ring-1 ring-foreground/10">
      <Spinner className="size-6 text-primary" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
