#!/usr/bin/env node
/**
 * Applies the deployment SQL to a Postgres database.
 *
 * Exists because psql is not installed everywhere and needs Homebrew on a Mac.
 * This needs only Node and the `pg` driver, which npm fetches on demand.
 *
 *   npm install --no-save pg
 *   DATABASE_URL='postgresql://…' node scripts/deploy/run.mjs
 *
 * The two files run on separate connections, deliberately. Postgres will not
 * let a value added by ALTER TYPE be used in the transaction that added it, so
 * step 1 has to be committed and done with before step 2 is parsed.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))

let pg
try {
  pg = await import("pg")
} catch {
  console.error(
    "\n  The pg driver is not installed. Run this first:\n\n    npm install --no-save pg\n",
  )
  process.exit(1)
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error(
    "\n  Set DATABASE_URL first. In Supabase: Project Settings → Database →\n" +
      "  Connection string → URI, and put your password in place of [YOUR-PASSWORD].\n\n" +
      "    export DATABASE_URL='postgresql://…'\n",
  )
  process.exit(1)
}

/* Supabase terminates TLS with its own certificate chain; verifying it would
   need the CA bundle shipped separately, and the connection is to a host the
   operator named themselves. */
const ssl = { rejectUnauthorized: false }

async function runFile(name) {
  const sql = readFileSync(join(here, name), "utf8")
  const client = new pg.default.Client({ connectionString: url, ssl })
  await client.connect()
  try {
    const results = await client.query(sql)
    /* The verification SELECT at the end of step 2 is the last result that
       carries rows; print it so success is visible rather than inferred. */
    const withRows = (Array.isArray(results) ? results : [results]).filter(
      (r) => r?.rows?.length,
    )
    const last = withRows[withRows.length - 1]
    if (last) {
      console.log()
      for (const row of last.rows) {
        const [a, b] = Object.values(row)
        const bad = b && !String(b).startsWith("OK")
        console.log(`    ${bad ? "✗" : "✓"} ${String(a).padEnd(36)} ${b ?? ""}`)
      }
    }
    return last?.rows ?? []
  } finally {
    await client.end()
  }
}

try {
  console.log("\n  Step 1 — adding the two roles…")
  await runFile("1-roles-enum.sql")
  console.log("    done.")

  console.log("\n  Step 2 — unit scoping, spend rule, views…")
  const checks = await runFile("2-scoping-and-views.sql")

  const failed = checks.filter((r) => {
    const value = Object.values(r)[1]
    return value && !String(value).startsWith("OK")
  })

  if (failed.length) {
    console.error(`\n  ${failed.length} check(s) did not pass. Nothing else was run.\n`)
    process.exit(1)
  }
  console.log("\n  All checks passed. The database is ready.\n")
} catch (error) {
  console.error(`\n  Failed: ${error.message}\n`)
  /* A half-applied step 1 is harmless and re-runnable; say so rather than
     leaving someone wondering whether to start over. */
  console.error("  Both files are safe to run again once the cause is fixed.\n")
  process.exit(1)
}
