import { describe, expect, it } from 'vitest'
import { generatePrices } from './market.js'
import { runBacktest, sma, validateConfig, DEFAULT_CONFIG } from './strategy.js'
import { loanPosition } from './lending.js'

describe('market', () => {
  it('is deterministic for a seed', () => {
    expect(generatePrices(50, { seed: 7 })).toEqual(generatePrices(50, { seed: 7 }))
    expect(generatePrices(50, { seed: 7 })).not.toEqual(generatePrices(50, { seed: 8 }))
  })
  it('keeps prices positive', () => {
    expect(generatePrices(2000, { seed: 1 }).every((p) => p > 0)).toBe(true)
  })
})

describe('strategy', () => {
  it('computes a simple moving average', () => {
    expect(sma([1, 2, 3, 4], 2, 3)).toBe(3.5)
    expect(sma([1, 2, 3, 4], 5, 3)).toBeNull()
  })

  it('rejects invalid configs', () => {
    expect(validateConfig({ ...DEFAULT_CONFIG, slowPeriod: 5, fastPeriod: 8 })).toHaveLength(1)
    expect(() => runBacktest([1, 2, 3], { stopLossPct: 0 })).toThrow()
  })

  it('buys on an upward cross and sells on a downward cross', () => {
    const prices = [...Array(10).fill(100), ...Array(10).fill(120), ...Array(10).fill(90)]
    const { trades } = runBacktest(prices, { fastPeriod: 2, slowPeriod: 4, stopLossPct: 50, feePct: 0 })
    expect(trades.map((t) => t.side)).toEqual(['BUY', 'SELL'])
    expect(trades[0].price).toBe(120)
  })

  it('triggers the stop-loss before a crossover exit', () => {
    const prices = [...Array(6).fill(100), 110, 110, 104, 104]
    const { trades } = runBacktest(prices, { fastPeriod: 2, slowPeriod: 4, stopLossPct: 3, feePct: 0 })
    expect(trades.at(-1)).toMatchObject({ side: 'SELL', reason: 'Stop-loss' })
  })

  it('charges fees on both sides of a round trip', () => {
    const prices = [...Array(10).fill(100), ...Array(10).fill(100.0001), ...Array(10).fill(99.9999)]
    const result = runBacktest(prices, { fastPeriod: 2, slowPeriod: 4, stopLossPct: 50, feePct: 1 })
    expect(result.stats.realizedPnl).toBeLessThan(0)
  })

  it('reports equity for every tick and a bounded drawdown', () => {
    const prices = generatePrices(500, { seed: 3 })
    const result = runBacktest(prices)
    expect(result.equity).toHaveLength(500)
    expect(result.stats.maxDrawdownPct).toBeGreaterThanOrEqual(0)
    expect(result.stats.maxDrawdownPct).toBeLessThan(100)
  })
})

describe('lending', () => {
  const base = { collateralAmount: 2, collateralPrice: 3000, maxLtvPct: 70, liquidationThresholdPct: 80 }

  it('computes LTV, health factor and liquidation price', () => {
    const p = loanPosition({ ...base, debt: 3000 })
    expect(p.collateralValue).toBe(6000)
    expect(p.ltvPct).toBe(50)
    expect(p.healthFactor).toBeCloseTo(1.6)
    expect(p.liquidationPrice).toBeCloseTo(1875)
    expect(p.availableToBorrow).toBe(1200)
    expect(p.status).toBe('Healthy')
  })

  it('flags liquidatable positions', () => {
    expect(loanPosition({ ...base, debt: 5000 }).status).toBe('Liquidatable')
  })

  it('handles zero debt', () => {
    const p = loanPosition({ ...base, debt: 0 })
    expect(p.healthFactor).toBe(Infinity)
    expect(p.liquidationPrice).toBeNull()
  })

  it('rejects invalid input', () => {
    expect(() => loanPosition({ ...base, debt: -1 })).toThrow()
    expect(() => loanPosition({ ...base, maxLtvPct: 90, debt: 1 })).toThrow()
  })
})
