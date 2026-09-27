"use client"

/**
 * The last boundary before a blank page.
 *
 * global-error replaces the entire document, so it carries its own <html> and
 * <body> and cannot use anything from the app's layout — no fonts, no theme, no
 * components. Everything here is inline on purpose.
 *
 * It should almost never be seen. It exists because the alternative, when
 * something fails above every other boundary, is white.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fafafa",
          color: "#111",
          padding: "1.5rem",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "20rem" }}>
          <h1 style={{ fontSize: "1.125rem", margin: 0 }}>Something went wrong</h1>
          <p style={{ color: "#666", fontSize: "0.875rem", marginTop: "0.5rem" }}>
            Your data is safe. Try again, or reload the page.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              padding: "0.7rem 1.4rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#0f766e",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 600,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
