// Loads the "Rite Foods Nigeria" sample organization into ONE existing account.
// Everyone else starts with an empty organization; this is only for demos.
//
//   node --env-file=.env.local scripts/seed-demo.mjs [email]
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-only).
// The account must already exist — sign up in the app and confirm the email first.
// Running it twice does nothing the second time.

const EMAIL = (process.argv[2] ?? "koredebusuyi.career@gmail.com").trim().toLowerCase()
const ORG_NAME = "Rite Foods Nigeria"
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!BASE || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local")
  process.exit(1)
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

const insert = (table, rows) => api(`/rest/v1/${table}`, { method: "POST", body: rows })

// ---------------------------------------------------------------------------
// Sample data (shaped like the 2026 budget-tracking Excel mock)
// ---------------------------------------------------------------------------

const DEPARTMENTS = [
  { key: "mkt", name: "Marketing", code: "MKT", budget: 100_000_000 },
  { key: "sls", name: "Sales", code: "SLS", budget: 70_000_000 },
  { key: "ops", name: "Operations", code: "OPS", budget: 55_000_000 },
  { key: "hr", name: "Human Resources", code: "HR", budget: 25_000_000 },
  { key: "it", name: "IT", code: "IT", budget: 40_000_000 },
]

const BRANDS = [
  { key: "zest", dept: "mkt", name: "Zest" },
  { key: "kora", dept: "mkt", name: "Kora" },
  { key: "retail", dept: "sls", name: "Retail" },
  { key: "enterprise", dept: "sls", name: "Enterprise" },
]

const CATEGORIES = ["Advertising", "Events", "Travel", "Software", "Consulting", "Equipment", "Logistics", "Training", "Recruitment"]

// [key, department, brand, category, annual budget]
const LINES = [
  ["L01", "mkt", "zest", "Advertising", 30_000_000],
  ["L02", "mkt", "zest", "Events", 15_000_000],
  ["L03", "mkt", "kora", "Advertising", 25_000_000],
  ["L04", "mkt", "kora", "Travel", 8_000_000],
  ["L05", "mkt", null, "Software", 10_000_000],
  ["L06", "sls", "retail", "Travel", 12_000_000],
  ["L07", "sls", "retail", "Events", 18_000_000],
  ["L08", "sls", "enterprise", "Consulting", 20_000_000],
  ["L09", "sls", "enterprise", "Travel", 15_000_000],
  ["L10", "ops", null, "Equipment", 25_000_000],
  ["L11", "ops", null, "Logistics", 20_000_000],
  ["L12", "ops", null, "Software", 8_000_000],
  ["L13", "hr", null, "Training", 12_000_000],
  ["L14", "hr", null, "Recruitment", 10_000_000],
  ["L15", "it", null, "Software", 25_000_000],
  ["L16", "it", null, "Equipment", 15_000_000],
]

// [code, date, line, description, vendor, amount, paid, status, note]
const TRANSACTIONS = [
  ["TXN-1001", "2026-01-12", "L01", "Q1 Google Ads campaign", "Google Ireland", 6_500_000, 6_500_000, "paid"],
  ["TXN-1002", "2026-01-20", "L15", "Microsoft 365 annual licences", "Microsoft", 9_800_000, 9_800_000, "paid"],
  ["TXN-1003", "2026-02-03", "L02", "Lagos product launch event", "Eko Hotels", 7_200_000, 4_000_000, "partially_paid"],
  ["TXN-1004", "2026-02-14", "L06", "Regional sales trip — Abuja", "Air Peace", 1_850_000, 1_850_000, "paid"],
  ["TXN-1005", "2026-02-22", "L10", "Forklift purchase", "Mikano", 11_000_000, 11_000_000, "paid"],
  ["TXN-1006", "2026-03-05", "L13", "Leadership training cohort", "Lagos Business School", 4_500_000, 4_500_000, "paid"],
  ["TXN-1007", "2026-03-18", "L03", "Billboard — Lekki-Ikoyi bridge", "Alpha Outdoor", 9_000_000, 0, "approved"],
  ["TXN-1008", "2026-03-27", "L08", "CRM implementation consultants", "Andersen Nigeria", 8_000_000, 5_000_000, "partially_paid"],
  ["TXN-1009", "2026-04-08", "L16", "Staff laptops (20 units)", "Slot Systems", 12_400_000, 12_400_000, "paid"],
  ["TXN-1010", "2026-04-15", "L11", "Q2 haulage contract", "GIG Logistics", 6_300_000, 6_300_000, "paid"],
  ["TXN-1011", "2026-04-29", "L04", "Influencer tour — Port Harcourt", "Arik Air", 2_100_000, 2_100_000, "paid"],
  ["TXN-1012", "2026-05-06", "L07", "Trade fair booth", "Landmark Centre", 5_600_000, 5_600_000, "paid"],
  ["TXN-1013", "2026-05-19", "L01", "Meta ads — mid-year push", "Meta Platforms", 8_200_000, 3_000_000, "partially_paid"],
  ["TXN-1014", "2026-05-28", "L14", "Recruitment agency fees", "Workforce Group", 3_400_000, 0, "approved"],
  ["TXN-1015", "2026-06-09", "L12", "Fleet tracking software", "Tranzit", 2_700_000, 2_700_000, "paid"],
  ["TXN-1016", "2026-06-17", "L09", "Client visits — Kano & Kaduna", "Overland Airways", 2_950_000, 2_950_000, "paid"],
  ["TXN-1017", "2026-06-30", "L05", "Design tools (Figma, Canva)", "Figma", 1_600_000, 1_600_000, "paid"],
  ["TXN-1018", "2026-07-07", "L02", "Customer appreciation dinner", "Radisson Blu", 4_800_000, 0, "approved"],
  ["TXN-1019", "2026-07-16", "L15", "Cloud hosting — H2", "AWS", 7_500_000, 2_500_000, "partially_paid"],
  ["TXN-1020", "2026-07-25", "L10", "Generator servicing", "Mikano", 3_200_000, 3_200_000, "paid"],
  ["TXN-1021", "2026-08-04", "L13", "Excel & data skills training", "NIIT", 1_900_000, 0, "approved"],
  ["TXN-1022", "2026-08-12", "L06", "Sales conference travel", "Air Peace", 2_400_000, 0, "rejected", "Travel freeze for Q3"],
  ["TXN-1023", "2026-08-20", "L03", "Radio jingles — Cool FM", "Cool FM", 3_600_000, 0, "voided", "Duplicate of an existing radio booking"],
  ["TXN-1024", "2026-08-28", "L01", "Q4 TikTok campaign", "TikTok", 5_500_000, 0, "pending"],
  ["TXN-1025", "2026-09-01", "L08", "Pricing strategy advisory", "PwC Nigeria", 6_000_000, 0, "pending"],
  ["TXN-1026", "2026-09-03", "L16", "Network switches upgrade", "Cisco partner", 4_200_000, 0, "pending"],
  ["TXN-1027", "2026-09-05", "L07", "Roadshow — Ibadan", "Sheraton", 3_100_000, 0, "pending"],
  ["TXN-1028", "2026-09-08", "L14", "Graduate trainee assessment", "SHL", 1_750_000, 0, "pending"],
  ["TXN-1029", "2026-09-09", "L04", "Media trip — Accra", "Africa World Airlines", 2_300_000, 0, "pending"],
]

// Pending invitations so the People list shows every role. No emails are sent.
const INVITES = [
  { email: "tunde@ritefoods.example", role: "finance", depts: [] },
  { email: "chiamaka@ritefoods.example", role: "dept_manager", depts: ["mkt"] },
  { email: "ibrahim@ritefoods.example", role: "dept_manager", depts: ["sls"] },
  { email: "grace@ritefoods.example", role: "viewer", depts: [] },
]

const addDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------

async function findUser(email) {
  for (let page = 1; ; page++) {
    const { users } = await api(`/auth/v1/admin/users?page=${page}&per_page=200`)
    const user = users.find((u) => u.email?.toLowerCase() === email)
    if (user || users.length < 200) return user
  }
}

const user = await findUser(EMAIL)
if (!user) {
  console.error(`No account for ${EMAIL} yet. Sign up in the app with that email, confirm it, then run this again.`)
  process.exit(1)
}

const existing = await api(
  `/rest/v1/organizations?created_by=eq.${user.id}&name=eq.${encodeURIComponent(ORG_NAME)}&select=id`
)
if (existing.length > 0) {
  console.log(`${EMAIL} already has the ${ORG_NAME} sample organization — nothing to do.`)
  process.exit(0)
}

const [org] = await insert("organizations", {
  name: ORG_NAME,
  slug: `rite-foods-${Math.random().toString(36).slice(2, 6)}`,
  currency: "NGN",
  fiscal_year_start: 1,
  industry: "Food & beverages",
  created_by: user.id,
})
await insert("memberships", { org_id: org.id, user_id: user.id, role: "owner", status: "active", invited_by: user.id })
const [period] = await insert("budget_periods", {
  org_id: org.id,
  name: "FY2026",
  start_date: "2026-01-01",
  end_date: "2026-12-31",
})

const departments = await insert(
  "departments",
  DEPARTMENTS.map((d) => ({ org_id: org.id, name: d.name, code: d.code }))
)
const deptId = Object.fromEntries(DEPARTMENTS.map((d) => [d.key, departments.find((row) => row.code === d.code).id]))
await insert(
  "department_budgets",
  DEPARTMENTS.map((d) => ({ org_id: org.id, department_id: deptId[d.key], period_id: period.id, annual_budget: d.budget }))
)

const brands = await insert(
  "brands",
  BRANDS.map((b) => ({ org_id: org.id, department_id: deptId[b.dept], name: b.name }))
)
const brandId = Object.fromEntries(BRANDS.map((b) => [b.key, brands.find((row) => row.name === b.name).id]))

const categories = await insert("categories", CATEGORIES.map((name) => ({ org_id: org.id, name })))
const categoryId = Object.fromEntries(categories.map((c) => [c.name, c.id]))

const lines = await insert(
  "budget_lines",
  LINES.map(([, dept, brand, category, budget]) => ({
    org_id: org.id,
    period_id: period.id,
    department_id: deptId[dept],
    brand_id: brand ? brandId[brand] : null,
    category_id: categoryId[category],
    annual_budget: budget,
  }))
)
const lineId = Object.fromEntries(LINES.map(([key], i) => [key, lines[i].id]))

// Paid / part-paid start as approved; recording payments moves them on (a trigger derives the status).
const transactions = await insert(
  "transactions",
  TRANSACTIONS.map(([code, date, line, description, vendor, amount, , status, note]) => {
    const approvedLike = ["approved", "partially_paid", "paid"].includes(status)
    return {
      org_id: org.id,
      budget_line_id: lineId[line],
      txn_code: code,
      txn_date: date,
      description,
      vendor,
      approved_amount: amount,
      status: approvedLike ? "approved" : status,
      created_by: user.id,
      submitted_at: `${date}T09:00:00Z`,
      ...(approvedLike && { approved_by: user.id, approved_at: `${addDays(date, 1)}T10:00:00Z` }),
      ...(status === "rejected" && { rejected_by: user.id, rejected_at: `${addDays(date, 1)}T10:00:00Z`, rejection_reason: note }),
      ...(status === "voided" && { voided_by: user.id, voided_at: `${addDays(date, 1)}T10:00:00Z`, void_reason: note }),
    }
  })
)
const txnId = Object.fromEntries(transactions.map((t) => [t.txn_code, t.id]))

const payments = TRANSACTIONS.filter(([, , , , , , paid]) => paid > 0).map(([code, date, , , , , paid]) => ({
  org_id: org.id,
  transaction_id: txnId[code],
  amount: paid,
  paid_on: addDays(date, 7),
  method: "Bank transfer",
  created_by: user.id,
}))
await insert("payments", payments)

for (const invite of INVITES) {
  const [membership] = await insert("memberships", {
    org_id: org.id,
    invited_email: invite.email,
    role: invite.role,
    status: "pending",
    invited_by: user.id,
  })
  if (invite.depts.length > 0) {
    await insert(
      "membership_departments",
      invite.depts.map((d) => ({ membership_id: membership.id, department_id: deptId[d], org_id: org.id }))
    )
  }
}

console.log(
  `Seeded ${ORG_NAME} for ${EMAIL}: ${DEPARTMENTS.length} departments, ${LINES.length} budget lines, ` +
    `${TRANSACTIONS.length} transactions, ${payments.length} payments, ${INVITES.length} pending invites.`
)
