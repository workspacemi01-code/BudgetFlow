export const CURRENCIES = [
  { code: "NGN", name: "Nigerian naira", locale: "en-NG" },
  { code: "GHS", name: "Ghanaian cedi", locale: "en-GH" },
  { code: "KES", name: "Kenyan shilling", locale: "en-KE" },
  { code: "ZAR", name: "South African rand", locale: "en-ZA" },
  { code: "USD", name: "US dollar", locale: "en-US" },
  { code: "GBP", name: "British pound", locale: "en-GB" },
  { code: "EUR", name: "Euro", locale: "en-IE" },
] as const

const moneyFormats = new Map<string, Intl.NumberFormat>()

function moneyFormat(currency: string, compact: boolean): Intl.NumberFormat {
  const key = `${currency}:${compact}`
  let format = moneyFormats.get(key)
  if (!format) {
    const locale = CURRENCIES.find((c) => c.code === currency)?.locale ?? "en"
    format = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      ...(compact ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: 0 }),
    })
    moneyFormats.set(key, format)
  }
  return format
}

export function formatMoney(value: number, currency: string, options: { compact?: boolean } = {}): string {
  return moneyFormat(currency, !!options.compact).format(value)
}

const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
})

export function formatDate(iso: string): string {
  return date.format(new Date(iso))
}

export function formatDateTime(iso: string): string {
  return `${dateTime.format(new Date(iso))} UTC`
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}
