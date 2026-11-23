import { describe, expect, it } from 'vitest'
import { DEFAULT_BOT_CONFIG, TradingBot, validateBotConfig, type BotConfig } from './bot'
import { SimulatedMarket } from './market'

const config: BotConfig = {
  ...DEFAULT_BOT_CONFIG,
  symbol: 'ETH',
  fastPeriod: 2,
  slowPeriod: 4,
  stopLossPct: 10,
  takeProfitPct: 50,
  feePct: 0,
  allocationPct: 100,
  maxDrawdownPct: 50,
}

/** Feeds a list of candle closes to the bot, one tick and one candle close per price. */
function feed(bot: TradingBot, closes: number[]) {
  const history: number[] = []
  closes.forEach((price, i) => {
    bot.onTick(price, i)
    history.push(price)
    bot.onCandleClose(history, price, i)
  })
}

describe('validateBotConfig', () => {
  it('accepts the defaults and rejects bad settings', () => {
    expect(validateBotConfig(DEFAULT_BOT_CONFIG)).toEqual([])
    expect(validateBotConfig({ ...DEFAULT_BOT_CONFIG, slowPeriod: 5, fastPeriod: 9 })).toHaveLength(1)
    expect(validateBotConfig({ ...DEFAULT_BOT_CONFIG, fastPeriod: 2.5 })).not.toEqual([])
    expect(validateBotConfig({ ...DEFAULT_BOT_CONFIG, allocationPct: 0 })).not.toEqual([])
    expect(() => new TradingBot({ ...DEFAULT_BOT_CONFIG, stopLossPct: 0 })).toThrow()
  })
})

describe('TradingBot', () => {
  it('does nothing until started', () => {
    const bot = new TradingBot(config)
    feed(bot, [100, 100, 100, 100, 110, 120, 130])
    expect(bot.account.fills).toHaveLength(0)
  })

  it('buys on a bullish cross and sells on a bearish cross', () => {
    const bot = new TradingBot(config)
    bot.start(0)
    feed(bot, [100, 100, 100, 100, 100, 110, 120, 120, 110, 104, 100])
    const sides = bot.account.fills.map((f) => f.side)
    expect(sides).toEqual(['buy', 'sell'])
    expect(bot.account.fills[1].reason).toBe('Signal exit (bearish cross)')
    expect(bot.logs.some((l) => l.kind === 'signal' && l.message.startsWith('Bullish'))).toBe(true)
  })

  it('attaches stop-loss and take-profit to entries and honours them', () => {
    const bot = new TradingBot({ ...config, stopLossPct: 5 })
    bot.start(0)
    feed(bot, [100, 100, 100, 100, 100, 110])
    const position = bot.position!
    expect(position.stopLoss).toBeCloseTo(104.5)
    expect(position.takeProfit).toBeCloseTo(165)
    bot.onTick(104, 10)
    expect(bot.account.fills.at(-1)).toMatchObject({ side: 'sell', reason: 'Stop-loss triggered', source: 'bot' })
  })

  it('sizes entries from the allocation setting', () => {
    const bot = new TradingBot({ ...config, allocationPct: 25 })
    bot.start(0)
    feed(bot, [100, 100, 100, 100, 100, 110])
    expect(bot.position!.qty * 110).toBeCloseTo(2500, -1)
  })

  it('ignores signals while paused but keeps enforcing the stop-loss', () => {
    const bot = new TradingBot(config)
    bot.start(0)
    feed(bot, [100, 100, 100, 100, 100, 110])
    expect(bot.position).not.toBeNull()
    bot.pause(6)
    feed(bot, [110, 100, 90])
    expect(bot.account.fills.filter((f) => f.reason.startsWith('Signal'))).toHaveLength(0)
    bot.onTick(98, 20)
    expect(bot.account.fills.at(-1)!.reason).toBe('Stop-loss triggered')
  })

  it('flattens the position when stopped', () => {
    const bot = new TradingBot(config)
    bot.start(0)
    feed(bot, [100, 100, 100, 100, 100, 110])
    bot.stop(115, 7)
    expect(bot.status).toBe('stopped')
    expect(bot.position).toBeNull()
    expect(bot.account.fills.at(-1)!.reason).toBe('Bot stopped: position closed')
  })

  it('halts on the max-drawdown kill switch and refuses to restart until reset', () => {
    const bot = new TradingBot({ ...config, stopLossPct: 40, maxDrawdownPct: 5 })
    bot.start(0)
    feed(bot, [100, 100, 100, 100, 100, 110])
    bot.onTick(100, 10)
    expect(bot.status).toBe('halted')
    expect(bot.position).toBeNull()
    expect(bot.logs.at(-1)!.kind).toBe('risk')
    expect(() => bot.start(11)).toThrow(/Reset/)
    bot.reset(config, 12)
    expect(bot.status).toBe('idle')
    expect(bot.account.fills).toHaveLength(0)
  })

  it('reports stats that reconcile with the account', () => {
    const bot = new TradingBot({ ...config, feePct: 0.1 })
    bot.start(0)
    feed(bot, [100, 100, 100, 100, 100, 110, 120, 120, 110, 104, 100])
    const stats = bot.stats(100)
    expect(stats.closedTrades).toBe(1)
    expect(stats.netPnl).toBeCloseTo(stats.realizedPnl + stats.unrealizedPnl)
    expect(stats.equity).toBeCloseTo(config.startingCash + stats.netPnl)
  })

  it('trades a long simulated session without breaking accounting invariants', () => {
    const market = new SimulatedMarket({ seed: 11, historyCandles: 30 })
    const bot = new TradingBot({ ...DEFAULT_BOT_CONFIG, symbol: 'SOL', maxDrawdownPct: 90 })
    bot.start(market.time)
    for (let i = 0; i < 8 * 600; i++) {
      const closed = market.tick()
      const price = market.price('SOL')
      bot.onTick(price, market.time)
      if (closed) bot.onCandleClose(market.closedCloses('SOL'), price, market.time)
    }
    const price = market.price('SOL')
    const stats = bot.stats(price)
    expect(bot.account.fills.length).toBeGreaterThan(4)
    expect(bot.account.cash).toBeGreaterThanOrEqual(0)
    expect(stats.netPnl).toBeCloseTo(stats.realizedPnl + stats.unrealizedPnl, 6)
    expect(stats.maxDrawdownPct).toBeGreaterThanOrEqual(stats.currentDrawdownPct - 1e-9)
  })
})
