import { gaussian, mulberry32, roundTo } from './random'
import type { AssetConfig, Candle } from './types'

export const CANDLE_SECONDS = 60

export const ASSETS: AssetConfig[] = [
  { symbol: 'BTC', name: 'Bitcoin', startPrice: 64000, volatility: 0.0021, decimals: 2 },
  { symbol: 'ETH', name: 'Ether', startPrice: 3200, volatility: 0.0027, decimals: 2 },
  { symbol: 'SOL', name: 'Solana', startPrice: 150, volatility: 0.0036, decimals: 3 },
  { symbol: 'LINK', name: 'Chainlink', startPrice: 14, volatility: 0.0034, decimals: 4 },
]

export interface MarketOptions {
  seed?: number
  assets?: AssetConfig[]
  ticksPerCandle?: number
  historyCandles?: number
  maxCandles?: number
  startTime?: number
}

/**
 * Simulated multi-asset market. Each tick moves every price by a geometric random walk whose drift
 * changes regime occasionally, so the series has trends and chop for strategies to react to.
 * Ticks are aggregated into OHLC candles; the last candle in each series is still forming.
 */
export class SimulatedMarket {
  readonly assets: AssetConfig[]
  readonly ticksPerCandle: number
  private readonly maxCandles: number
  private readonly startTime: number
  private readonly rand: () => number
  private readonly prices = new Map<string, number>()
  private readonly drifts = new Map<string, number>()
  private readonly series = new Map<string, Candle[]>()
  private tickCount = 0

  constructor(options: MarketOptions = {}) {
    this.assets = options.assets ?? ASSETS
    this.ticksPerCandle = options.ticksPerCandle ?? 8
    this.maxCandles = options.maxCandles ?? 400
    this.startTime = options.startTime ?? Date.UTC(2026, 0, 5) / 1000
    this.rand = mulberry32(options.seed ?? 2026)
    if (!Number.isInteger(this.ticksPerCandle) || this.ticksPerCandle < 1) {
      throw new Error('ticksPerCandle must be a positive integer.')
    }
    for (const asset of this.assets) {
      this.prices.set(asset.symbol, asset.startPrice)
      this.drifts.set(asset.symbol, 0)
      this.series.set(asset.symbol, [this.openCandle(asset.startPrice)])
    }
    const historyTicks = (options.historyCandles ?? 140) * this.ticksPerCandle
    for (let i = 0; i < historyTicks; i++) this.tick()
  }

  /** Current simulated time in Unix seconds. */
  get time(): number {
    return this.startTime + (this.tickCount * CANDLE_SECONDS) / this.ticksPerCandle
  }

  asset(symbol: string): AssetConfig {
    const asset = this.assets.find((a) => a.symbol === symbol)
    if (!asset) throw new Error(`Unknown market ${symbol}.`)
    return asset
  }

  price(symbol: string): number {
    const price = this.prices.get(symbol)
    if (price === undefined) throw new Error(`Unknown market ${symbol}.`)
    return price
  }

  /** All candles, including the one still forming. */
  candles(symbol: string): readonly Candle[] {
    const candles = this.series.get(symbol)
    if (!candles) throw new Error(`Unknown market ${symbol}.`)
    return candles
  }

  /** Close prices of completed candles only, which is what strategies should act on. */
  closedCloses(symbol: string): number[] {
    return this.candles(symbol).slice(0, -1).map((c) => c.close)
  }

  /** Percent change from the open of the oldest candle still in memory. */
  changePct(symbol: string): number {
    const first = this.candles(symbol)[0]
    return ((this.price(symbol) - first.open) / first.open) * 100
  }

  /** Advances the market one tick. Returns true when this tick completed a candle. */
  tick(): boolean {
    this.tickCount++
    for (const asset of this.assets) {
      let drift = this.drifts.get(asset.symbol)!
      if (this.rand() < 0.015) {
        drift = (this.rand() - 0.5) * asset.volatility * 0.5
        this.drifts.set(asset.symbol, drift)
      }
      const previous = this.prices.get(asset.symbol)!
      const next = roundTo(previous * Math.exp(drift + asset.volatility * gaussian(this.rand)), asset.decimals)
      this.prices.set(asset.symbol, next)
      const candles = this.series.get(asset.symbol)!
      const current = candles[candles.length - 1]
      current.close = next
      current.high = Math.max(current.high, next)
      current.low = Math.min(current.low, next)
    }
    if (this.tickCount % this.ticksPerCandle !== 0) return false
    for (const asset of this.assets) {
      const candles = this.series.get(asset.symbol)!
      candles.push(this.openCandle(this.prices.get(asset.symbol)!))
      if (candles.length > this.maxCandles) candles.shift()
    }
    return true
  }

  private openCandle(price: number): Candle {
    return { time: this.time, open: price, high: price, low: price, close: price }
  }
}
