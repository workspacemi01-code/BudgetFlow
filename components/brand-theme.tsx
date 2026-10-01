"use client"

import { useEffect } from "react"

/**
 * Applies an organisation's palette.
 *
 * The first version set `document.documentElement.dataset.brand` from an inline
 * <script>. A script tag runs once, when the browser first parses it — so
 * saving a new palette revalidated the page, re-rendered the layout, and
 * changed nothing on screen until the tab was reloaded by hand.
 *
 * Two mechanisms now, each doing the half the other cannot:
 *
 *   · the wrapper carries `data-brand`, which is plain markup. React updates
 *     it like any other attribute, so a saved change takes effect immediately,
 *     and it is server-rendered, so the first paint is already the right
 *     colour with no flash.
 *
 *   · the effect mirrors it onto <html>, because dialogs and menus render
 *     through a portal attached to <body>, outside this wrapper, and would
 *     otherwise keep the default palette.
 */
export function BrandTheme({
  theme,
  children,
}: {
  theme?: string | null
  children: React.ReactNode
}) {
  const brand = theme && theme !== "default" ? theme : null

  useEffect(() => {
    const root = document.documentElement
    if (brand) root.dataset.brand = brand
    else delete root.dataset.brand
    /* Left in place on unmount: this layout wraps the whole signed-in app, so
       it only unmounts on the way out, and clearing it there would flash the
       default palette over the page being left. */
  }, [brand])

  /* `contents` removes the wrapper from the layout box tree entirely, so the
     shell's own full-height layout behaves exactly as it did before. Custom
     properties still inherit through it, which is all this element is for. */
  return (
    <div className="contents" data-brand={brand ?? undefined}>
      {children}
    </div>
  )
}
