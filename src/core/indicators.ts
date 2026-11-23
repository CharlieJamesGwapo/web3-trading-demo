/** Simple moving average of the last `period` values, or null when there isn't enough data. */
export function sma(values: readonly number[], period: number): number | null {
  if (period < 1 || values.length < period) return null
  let sum = 0
  for (let i = values.length - period; i < values.length; i++) sum += values[i]
  return sum / period
}

/** Moving average for every index, aligned with the input. Used for chart overlays. */
export function smaSeries(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = []
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    out.push(i >= period - 1 ? sum / period : null)
  }
  return out
}

export type Cross = 'up' | 'down' | null

/** Detects a crossover between two series given their previous and current values. */
export function detectCross(prevFast: number, prevSlow: number, fast: number, slow: number): Cross {
  if (prevFast <= prevSlow && fast > slow) return 'up'
  if (prevFast >= prevSlow && fast < slow) return 'down'
  return null
}
