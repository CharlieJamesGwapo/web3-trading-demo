import { describe, expect, it } from 'vitest'
import { CANDLE_SECONDS, SimulatedMarket } from './market'
import { detectCross, sma, smaSeries } from './indicators'

describe('SimulatedMarket', () => {
  it('is deterministic for a seed', () => {
    const a = new SimulatedMarket({ seed: 5 })
    const b = new SimulatedMarket({ seed: 5 })
    const c = new SimulatedMarket({ seed: 6 })
    expect(a.candles('BTC')).toEqual(b.candles('BTC'))
    expect(a.price('ETH')).not.toBe(c.price('ETH'))
  })

  it('builds valid OHLC candles on a fixed interval', () => {
    const market = new SimulatedMarket({ seed: 1, historyCandles: 50 })
    const candles = market.candles('ETH')
    expect(candles).toHaveLength(51)
    for (const candle of candles) {
      expect(candle.high).toBeGreaterThanOrEqual(Math.max(candle.open, candle.close))
      expect(candle.low).toBeLessThanOrEqual(Math.min(candle.open, candle.close))
      expect(candle.low).toBeGreaterThan(0)
    }
    for (let i = 1; i < candles.length; i++) {
      expect(candles[i].time - candles[i - 1].time).toBe(CANDLE_SECONDS)
      expect(candles[i].open).toBe(candles[i - 1].close)
    }
  })

  it('reports a candle close every ticksPerCandle ticks', () => {
    const market = new SimulatedMarket({ seed: 1, ticksPerCandle: 4, historyCandles: 0 })
    const closes = Array.from({ length: 12 }, () => market.tick())
    expect(closes.filter(Boolean)).toHaveLength(3)
    expect(market.closedCloses('BTC')).toHaveLength(3)
  })

  it('caps memory at maxCandles and rejects unknown markets', () => {
    const market = new SimulatedMarket({ seed: 1, historyCandles: 50, maxCandles: 20 })
    expect(market.candles('BTC')).toHaveLength(20)
    expect(() => market.price('DOGE')).toThrow(/Unknown market/)
  })
})

describe('indicators', () => {
  it('computes moving averages', () => {
    expect(sma([1, 2, 3, 4], 2)).toBe(3.5)
    expect(sma([1, 2], 3)).toBeNull()
    expect(smaSeries([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5])
  })

  it('detects crossovers', () => {
    expect(detectCross(1, 2, 3, 2)).toBe('up')
    expect(detectCross(3, 2, 1, 2)).toBe('down')
    expect(detectCross(3, 2, 4, 2)).toBeNull()
  })
})
