const usdFormatters = new Map<number, Intl.NumberFormat>()

export function formatUsd(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—'
  let formatter = usdFormatters.get(decimals)
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    usdFormatters.set(decimals, formatter)
  }
  return formatter.format(value)
}

export function formatSignedUsd(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0.004 ? '+' : value < -0.004 ? '-' : ''
  return `${sign}${formatUsd(Math.abs(value))}`
}

export function formatPrice(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function formatPct(value: number, decimals = 2, signed = false): string {
  if (!Number.isFinite(value)) return '—'
  const sign = signed && value > 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}%`
}

export function formatQty(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', { maximumFractionDigits: 6 })
}

/** Simulated clock time as HH:MM (UTC), matching the candle timestamps. */
export function formatClock(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000)
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
