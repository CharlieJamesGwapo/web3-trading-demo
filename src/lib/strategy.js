// Paper-trading bot: moving-average crossover with a stop-loss and per-trade fees.
// It only ever trades simulated balances; there is no exchange connection.

export function sma(values, period, endIndex) {
  if (endIndex + 1 < period) return null
  let sum = 0
  for (let i = endIndex - period + 1; i <= endIndex; i++) sum += values[i]
  return sum / period
}

export const DEFAULT_CONFIG = {
  fastPeriod: 8,
  slowPeriod: 21,
  stopLossPct: 3,
  feePct: 0.1,
  startingCash: 10000,
  allocationPct: 50,
}

export function validateConfig(config) {
  const errors = []
  if (!(config.fastPeriod >= 2)) errors.push('Fast period must be at least 2.')
  if (!(config.slowPeriod > config.fastPeriod)) errors.push('Slow period must be longer than the fast period.')
  if (!(config.stopLossPct > 0 && config.stopLossPct < 100)) errors.push('Stop-loss must be between 0 and 100%.')
  if (!(config.feePct >= 0 && config.feePct < 5)) errors.push('Fee must be between 0 and 5%.')
  if (!(config.allocationPct > 0 && config.allocationPct <= 100)) errors.push('Allocation must be between 1 and 100%.')
  if (!(config.startingCash > 0)) errors.push('Starting cash must be positive.')
  return errors
}

export function runBacktest(prices, userConfig = {}) {
  const config = { ...DEFAULT_CONFIG, ...userConfig }
  const errors = validateConfig(config)
  if (errors.length) throw new Error(errors.join(' '))

  const fee = config.feePct / 100
  let cash = config.startingCash
  let qty = 0
  let entryPrice = null
  const trades = []
  const equity = []

  const sell = (i, price, reason) => {
    const gross = qty * price
    const proceeds = gross * (1 - fee)
    const cost = qty * entryPrice * (1 + fee)
    trades.push({ index: i, side: 'SELL', price, qty, reason, pnl: proceeds - cost })
    cash += proceeds
    qty = 0
    entryPrice = null
  }

  for (let i = 0; i < prices.length; i++) {
    const price = prices[i]
    const fast = sma(prices, config.fastPeriod, i)
    const slow = sma(prices, config.slowPeriod, i)
    const prevFast = i > 0 ? sma(prices, config.fastPeriod, i - 1) : null
    const prevSlow = i > 0 ? sma(prices, config.slowPeriod, i - 1) : null

    if (qty > 0 && price <= entryPrice * (1 - config.stopLossPct / 100)) {
      sell(i, price, 'Stop-loss')
    } else if (fast !== null && slow !== null && prevFast !== null && prevSlow !== null) {
      const crossedUp = prevFast <= prevSlow && fast > slow
      const crossedDown = prevFast >= prevSlow && fast < slow
      if (crossedUp && qty === 0) {
        const spend = cash * (config.allocationPct / 100)
        qty = (spend * (1 - fee)) / price
        cash -= spend
        entryPrice = price
        trades.push({ index: i, side: 'BUY', price, qty, reason: 'Fast MA crossed above slow MA', pnl: null })
      } else if (crossedDown && qty > 0) {
        sell(i, price, 'Fast MA crossed below slow MA')
      }
    }
    equity.push(cash + qty * price)
  }

  const closed = trades.filter((t) => t.side === 'SELL')
  const wins = closed.filter((t) => t.pnl > 0).length
  let peak = -Infinity
  let maxDrawdownPct = 0
  for (const value of equity) {
    peak = Math.max(peak, value)
    maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - value) / peak) * 100)
  }
  const finalEquity = equity.at(-1) ?? config.startingCash

  return {
    config,
    trades,
    equity,
    position: qty > 0 ? { qty, entryPrice } : null,
    stats: {
      finalEquity,
      returnPct: ((finalEquity - config.startingCash) / config.startingCash) * 100,
      closedTrades: closed.length,
      winRatePct: closed.length ? (wins / closed.length) * 100 : 0,
      realizedPnl: closed.reduce((sum, t) => sum + t.pnl, 0),
      maxDrawdownPct,
    },
  }
}
