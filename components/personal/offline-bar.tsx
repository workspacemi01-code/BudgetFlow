"use client"

import { useEffect, useState } from "react"
import { WifiOff } from "lucide-react"

/**
 * A strip that appears when the connection goes.
 *
 * Without it, being offline looks like the app being broken: a spend you record
 * seems to save, nothing updates, and there is no way to tell whether the
 * problem is yours or ours. One line removes the doubt.
 *
 * It only says what is true — that the figures on screen are the last ones we
 * fetched — rather than promising to send anything later, because it does not.
 * Recording a spend still needs the network.
 */
export function OfflineBar() {
  // Starts online: navigator is not available while this renders on the server,
  // and guessing offline would flash the bar at everybody on first paint.
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])

  if (online) return null

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"
    >
      <WifiOff className="size-3.5 shrink-0" aria-hidden />
      You&apos;re offline — showing the last figures we loaded.
    </div>
  )
}
