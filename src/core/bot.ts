import { detectCross, sma } from './indicators'
import { OrderError, PaperAccount } from './paperAccount'
import type { Fill } from './types'

export type BotStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'halted'

export interface BotConfig {
  symbol: string
  fastPeriod: number
  slowPeriod: number
  /** Share of available cash committed to each entry. */
  allocationPct: number
  stopLossPct: number
  takeProfitPct: number
  feePct: number
  startingCash: number
  /** Kill switch: the bot flattens and halts when equity falls this far below its peak. */
  maxDrawdownPct: number
}

export const DEFAULT_BOT_CONFIG: BotConfig = {
  symbol: 'ETH',
  fastPeriod: 9,
  slowPeriod: 21,
  allocationPct: 50,
  stopLossPct: 1.5,
  takeProfitPct: 3,
  feePct: 0.1,
  startingCash: 10_000,
  maxDrawdownPct: 12,
}

export const MIN_ORDER_USD = 10

export interface BotLog {
  id: number
  time: number
  kind: 'info' | 'signal' | 'trade' | 'risk' | 'error'
  message: string
}

export interface BotStats {
  equity: number
  netPnl: number
  netPnlPct: number
  realizedPnl: number
  unrealizedPnl: number
  feesPaid: number
  closedTrades: number
  wins: number
  winRatePct: number
  maxDrawdownPct: number
  currentDrawdownPct: number
}

export function validateBotConfig(config: BotConfig): string[] {
  const errors: string[] = []
  const isInt = (n: number) => Number.isInteger(n)
  if (!(isInt(config.fastPeriod) && config.fastPeriod >= 2)) errors.push('Fast MA must be a whole number of at least 2.')
  if (!(isInt(config.slowPeriod) && config.slowPeriod > config.fastPeriod)) {
    errors.push('Slow MA must be a whole number longer than the fast MA.')
  }
  if (config.slowPeriod > 200) errors.push('Slow MA can be at most 200 candles.')
  if (!(config.allocationPct > 0 && config.allocationPct <= 100)) errors.push('Allocation must be between 1% and 100%.')
  if (!(config.stopLossPct > 0 && config.stopLossPct < 50)) errors.push('Stop-loss must be between 0% and 50%.')
  if (!(config.takeProfitPct > 0 && config.takeProfitPct <= 500)) errors.push('Take-profit must be between 0% and 500%.')
  if (!(config.feePct >= 0 && config.feePct < 5)) errors.push('Fee must be between 0% and 5%.')
  if (!(config.startingCash >= 100)) errors.push('Starting balance must be at least $100.')
  if (!(config.maxDrawdownPct > 0 && config.maxDrawdownPct < 100)) errors.push('Max drawdown must be between 0% and 100%.')
  return errors
}

/**
 * Moving-average crossover bot. It evaluates signals only on completed candles, enters long when the
 * fast MA crosses above the slow MA, and exits on the opposite cross, a stop-loss, a take-profit, or
 * the drawdown kill switch. It trades its own paper account so its results stay separate from manual trades.
 */
export class TradingBot {
  config: BotConfig
  status: BotStatus = 'idle'
  account: PaperAccount
  readonly logs: BotLog[] = []
  readonly equityCurve: { time: number; equity: number }[] = []
  peakEquity: number
  maxDrawdownPct = 0
  private previous: { fast: number; slow: number } | null = null
  private logSeq = 0

  constructor(config: BotConfig = DEFAULT_BOT_CONFIG) {
    const errors = validateBotConfig(config)
    if (errors.length) throw new Error(errors.join(' '))
    this.config = { ...config }
    this.account = new PaperAccount({ startingCash: config.startingCash, feePct: config.feePct })
    this.peakEquity = config.startingCash
  }

  get strategyLabel(): string {
    const c = this.config
    return `SMA ${c.fastPeriod}/${c.slowPeriod} crossover · SL ${c.stopLossPct}% · TP ${c.takeProfitPct}%`
  }

  get position() {
    return this.account.positions.get(this.config.symbol) ?? null
  }

  /** Replaces the configuration and clears all results. Only allowed while the bot isn't trading. */
  reset(config: BotConfig, time: number): void {
    if (this.status === 'running' || this.status === 'paused') throw new Error('Stop the bot before changing its settings.')
    const errors = validateBotConfig(config)
    if (errors.length) throw new Error(errors.join(' '))
    this.config = { ...config }
    this.account = new PaperAccount({ startingCash: config.startingCash, feePct: config.feePct })
    this.logs.length = 0
    this.equityCurve.length = 0
    this.peakEquity = config.startingCash
    this.maxDrawdownPct = 0
    this.previous = null
    this.status = 'idle'
    this.log(time, 'info', 'Bot reset with new settings.')
  }

  start(time: number): void {
    if (this.status === 'running') return
    if (this.status === 'halted') throw new Error('The kill switch halted this bot. Reset it to trade again.')
    const resuming = this.status === 'paused'
    this.status = 'running'
    if (!resuming) this.previous = null
    this.log(time, 'info', resuming
      ? 'Resumed. Watching for signals again.'
      : `Started on ${this.config.symbol}-USD: ${this.strategyLabel}. Waiting for the next candle close.`)
  }

  /** Pausing stops new signals; stop-loss, take-profit and the kill switch keep protecting any open position. */
  pause(time: number): void {
    if (this.status !== 'running') return
    this.status = 'paused'
    this.log(time, 'info', 'Paused. No new entries or signal exits; open-position protection stays active.')
  }

  /** Stops trading and closes any open position at the current price. */
  stop(price: number, time: number): void {
    if (this.status !== 'running' && this.status !== 'paused') return
    const fill = this.account.closePosition(this.config.symbol, price, time, 'Bot stopped: position closed', 'bot')
    if (fill) this.logFill(fill)
    this.status = 'stopped'
    this.log(time, 'info', 'Stopped.')
    this.recordEquity(price, time)
  }

  /** Called on every price tick: enforces exits and tracks drawdown. */
  onTick(price: number, time: number): void {
    if (this.status !== 'running' && this.status !== 'paused') return
    for (const fill of this.account.onPrice(this.config.symbol, price, time, 'bot')) this.logFill(fill)
    this.updateDrawdown(price, time)
  }

  /** Called when a candle completes, with the close prices of all completed candles. */
  onCandleClose(closes: readonly number[], price: number, time: number): void {
    if (this.status === 'running' || this.status === 'paused') this.recordEquity(price, time)
    if (this.status !== 'running') return
    const fast = sma(closes, this.config.fastPeriod)
    const slow = sma(closes, this.config.slowPeriod)
    if (fast === null || slow === null) return
    const previous = this.previous
    this.previous = { fast, slow }
    if (!previous) return

    const cross = detectCross(previous.fast, previous.slow, fast, slow)
    if (!cross) return
    const close = closes[closes.length - 1]
    const holding = this.position !== null

    if (cross === 'up' && !holding) {
      this.log(time, 'signal', `Bullish cross: SMA ${this.config.fastPeriod} ${fast.toFixed(2)} > SMA ${this.config.slowPeriod} ${slow.toFixed(2)}.`)
      this.enter(price, time)
    } else if (cross === 'down' && holding) {
      this.log(time, 'signal', `Bearish cross: SMA ${this.config.fastPeriod} ${fast.toFixed(2)} < SMA ${this.config.slowPeriod} ${slow.toFixed(2)}.`)
      const fill = this.account.closePosition(this.config.symbol, price, time, 'Signal exit (bearish cross)', 'bot')
      if (fill) this.logFill(fill)
    } else {
      this.log(time, 'info', `${cross === 'up' ? 'Bullish' : 'Bearish'} cross at close ${close}; ignored (${holding ? 'already in a position' : 'no position to exit'}).`)
    }
  }

  stats(price: number): BotStats {
    const equity = this.account.equity(() => price)
    const sells = this.account.fills.filter((f) => f.side === 'sell')
    const wins = sells.filter((f) => (f.realizedPnl ?? 0) > 0).length
    const netPnl = equity - this.config.startingCash
    return {
      equity,
      netPnl,
      netPnlPct: (netPnl / this.config.startingCash) * 100,
      realizedPnl: this.account.realizedPnl,
      unrealizedPnl: this.account.unrealizedPnl(this.config.symbol, price),
      feesPaid: this.account.feesPaid,
      closedTrades: sells.length,
      wins,
      winRatePct: sells.length ? (wins / sells.length) * 100 : 0,
      maxDrawdownPct: this.maxDrawdownPct,
      currentDrawdownPct: this.peakEquity > 0 ? ((this.peakEquity - equity) / this.peakEquity) * 100 : 0,
    }
  }

  private enter(price: number, time: number): void {
    const { allocationPct, stopLossPct, takeProfitPct, symbol } = this.config
    const budget = this.account.availableCash() * (allocationPct / 100)
    const qty = Math.floor((budget / (price * (1 + this.account.feeRate))) * 1e6) / 1e6
    if (qty * price < MIN_ORDER_USD) {
      this.log(time, 'risk', `Entry skipped: position size would be under $${MIN_ORDER_USD}.`)
      return
    }
    try {
      const order = this.account.placeOrder({
        symbol,
        side: 'buy',
        type: 'market',
        qty,
        stopLoss: price * (1 - stopLossPct / 100),
        takeProfit: price * (1 + takeProfitPct / 100),
        source: 'bot',
      }, price, time)
      const fill = this.account.fills.find((f) => f.orderId === order.id)
      if (fill) this.logFill(fill)
    } catch (error) {
      this.log(time, 'error', `Order rejected: ${error instanceof OrderError ? error.message : String(error)}`)
    }
  }

  private updateDrawdown(price: number, time: number): void {
    const equity = this.account.equity(() => price)
    this.peakEquity = Math.max(this.peakEquity, equity)
    const drawdown = ((this.peakEquity - equity) / this.peakEquity) * 100
    this.maxDrawdownPct = Math.max(this.maxDrawdownPct, drawdown)
    if (drawdown >= this.config.maxDrawdownPct) {
      const fill = this.account.closePosition(this.config.symbol, price, time, 'Kill switch: max drawdown reached', 'bot')
      if (fill) this.logFill(fill)
      this.status = 'halted'
      this.log(time, 'risk', `Kill switch: drawdown ${drawdown.toFixed(2)}% reached the ${this.config.maxDrawdownPct}% limit. Bot halted.`)
    }
  }

  private recordEquity(price: number, time: number): void {
    this.equityCurve.push({ time, equity: this.account.equity(() => price) })
    if (this.equityCurve.length > 600) this.equityCurve.shift()
  }

  private logFill(fill: Fill): void {
    const pnl = fill.realizedPnl === null ? '' : ` · P&L ${fill.realizedPnl >= 0 ? '+' : '-'}$${Math.abs(fill.realizedPnl).toFixed(2)}`
    this.log(fill.time, fill.reason.startsWith('Kill') || fill.reason.startsWith('Stop-loss') ? 'risk' : 'trade',
      `${fill.side.toUpperCase()} ${fill.qty} ${fill.symbol} @ ${fill.price.toFixed(2)} (${fill.reason})${pnl}`)
  }

  private log(time: number, kind: BotLog['kind'], message: string): void {
    this.logSeq += 1
    this.logs.push({ id: this.logSeq, time, kind, message })
    if (this.logs.length > 300) this.logs.shift()
  }
}
