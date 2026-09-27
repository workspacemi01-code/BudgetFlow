"use client"

import { WifiOff } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * What you get instead of a white screen.
 *
 * With no boundary here, a server component that could not reach the database
 * — which on a phone usually means the connection dropped — threw all the way
 * past the root, and Next served a blank page. No message, no retry, nothing to
 * tell you the app was fine and the train had gone into a tunnel.
 *
 * The wording avoids blaming either side, because from here we cannot tell
 * which it was: the phone may be offline, or we may be.
 */
export default function PersonalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <WifiOff className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <div>
        <h1 className="text-lg font-semibold">Couldn&apos;t load your budget</h1>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          You may be offline. Nothing has been lost — try again when you have a
          connection.
        </p>
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
