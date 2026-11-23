import { describe, expect, it } from 'vitest'
import { OrderError, PaperAccount } from './paperAccount'

const T = 1_000

function account(feePct = 0.1) {
  return new PaperAccount({ startingCash: 10_000, feePct })
}

describe('PaperAccount market orders', () => {
  it('fills a market buy immediately and charges the fee', () => {
    const a = account()
    const order = a.placeOrder({ symbol: 'ETH', side: 'buy', type: 'market', qty: 1 }, 2000, T)
    expect(order.status).toBe('filled')
    expect(a.cash).toBeCloseTo(10_000 - 2000 - 2)
    expect(a.positions.get('ETH')).toMatchObject({ qty: 1, avgEntry: 2000, costBasis: 2002 })
    expect(a.feesPaid).toBeCloseTo(2)
  })

  it('realizes P&L net of both fees on a round trip', () => {
    const a = account()
    a.placeOrder({ symbol: 'ETH', side: 'buy', type: 'market', qty: 1 }, 2000, T)
    a.placeOrder({ symbol: 'ETH', side: 'sell', type: 'market', qty: 1 }, 2100, T + 1)
    // 2100 - 2.1 sell fee - 2002 cost basis
    expect(a.realizedPnl).toBeCloseTo(95.9)
    expect(a.positions.has('ETH')).toBe(false)
    expect(a.cash).toBeCloseTo(10_000 + 95.9)
  })

  it('keeps equity equal to starting cash plus realized plus unrealized P&L', () => {
    const a = account()
    a.placeOrder({ symbol: 'BTC', side: 'buy', type: 'market', qty: 0.05 }, 60_000, T)
    a.placeOrder({ symbol: 'BTC', side: 'sell', type: 'market', qty: 0.02 }, 61_000, T + 1)
    const price = 59_500
    const equity = a.equity(() => price)
    expect(equity).toBeCloseTo(a.startingCash + a.realizedPnl + a.unrealizedPnl('BTC', price))
  })

  it('averages the entry price across buys', () => {
    const a = account(0)
    a.placeOrder({ symbol: 'SOL', side: 'buy', type: 'market', qty: 10 }, 100, T)
    a.placeOrder({ symbol: 'SOL', side: 'buy', type: 'market', qty: 30 }, 120, T + 1)
    expect(a.positions.get('SOL')!.avgEntry).toBeCloseTo(115)
  })

  it('rejects orders it cannot fund or fill', () => {
    const a = account()
    expect(() => a.placeOrder({ symbol: 'BTC', side: 'buy', type: 'market', qty: 1 }, 60_000, T)).toThrow(OrderError)
    expect(() => a.placeOrder({ symbol: 'ETH', side: 'sell', type: 'market', qty: 1 }, 2000, T)).toThrow(/Not enough ETH/)
    expect(() => a.placeOrder({ symbol: 'ETH', side: 'buy', type: 'market', qty: 0 }, 2000, T)).toThrow(/greater than zero/)
    expect(() => a.placeOrder({ symbol: 'ETH', side: 'buy', type: 'market', qty: Number.NaN }, 2000, T)).toThrow()
    expect(a.cash).toBe(10_000)
    expect(a.orders).toHaveLength(0)
  })
})

describe('PaperAccount limit orders', () => {
  it('rests a limit buy, reserves cash, and fills when price trades through', () => {
    const a = account()
    const order = a.placeOrder({ symbol: 'ETH', side: 'buy', type: 'limit', qty: 2, limitPrice: 1900 }, 2000, T)
    expect(order.status).toBe('open')
    expect(a.availableCash()).toBeCloseTo(10_000 - 3800 * 1.001)
    expect(a.onPrice('ETH', 1950, T + 1)).toHaveLength(0)
    const fills = a.onPrice('ETH', 1890, T + 2)
    expect(fills).toHaveLength(1)
    expect(fills[0].price).toBe(1900)
    expect(order.status).toBe('filled')
  })

  it('fills a marketable limit immediately at the market price', () => {
    const a = account()
    const order = a.placeOrder({ symbol: 'ETH', side: 'buy', type: 'limit', qty: 1, limitPrice: 2050 }, 2000, T)
    expect(order).toMatchObject({ status: 'filled', fillPrice: 2000 })
  })

  it('does not let resting orders double-spend cash or quantity', () => {
    const a = account()
    a.placeOrder({ symbol: 'ETH', side: 'buy', type: 'limit', qty: 4, limitPrice: 1900 }, 2000, T)
    expect(() => a.placeOrder({ symbol: 'ETH', side: 'buy', type: 'market', qty: 2 }, 2000, T)).toThrow(/Insufficient/)

    const b = account()
    b.placeOrder({ symbol: 'ETH', side: 'buy', type: 'market', qty: 1 }, 2000, T)
    b.placeOrder({ symbol: 'ETH', side: 'sell', type: 'limit', qty: 1, limitPrice: 2200 }, 2000, T)
    expect(() => b.placeOrder({ symbol: 'ETH', side: 'sell', type: 'market', qty: 0.5 }, 2000, T)).toThrow(/Not enough/)
  })

  it('releases reserved cash when an order is cancelled', () => {
    const a = account()
    const order = a.placeOrder({ symbol: 'ETH', side: 'buy', type: 'limit', qty: 2, limitPrice: 1900 }, 2000, T)
    expect(a.cancelOrder(order.id)).toBe(true)
    expect(a.availableCash()).toBe(10_000)
    expect(a.cancelOrder(order.id)).toBe(false)
    expect(a.onPrice('ETH', 1800, T + 1)).toHaveLength(0)
  })
})

describe('PaperAccount stop-loss and take-profit', () => {
  it('validates protection levels against the entry price', () => {
    const a = account()
    expect(() => a.placeOrder({ symbol: 'ETH', side: 'buy', type: 'market', qty: 1, stopLoss: 2100 }, 2000, T)).toThrow(/below/)
    expect(() => a.placeOrder({ symbol: 'ETH', side: 'buy', type: 'market', qty: 1, takeProfit: 1900 }, 2000, T)).toThrow(/above/)
  })

  it('closes the position when the stop-loss is hit, filling at the tick price', () => {
    const a = account()
    a.placeOrder({ symbol: 'ETH', side: 'buy', type: 'market', qty: 1, stopLoss: 1950, takeProfit: 2100 }, 2000, T)
    expect(a.onPrice('ETH', 1960, T + 1)).toHaveLength(0)
    const [fill] = a.onPrice('ETH', 1940, T + 2)
    expect(fill).toMatchObject({ side: 'sell', price: 1940, reason: 'Stop-loss triggered' })
    expect(fill.realizedPnl!).toBeLessThan(0)
    expect(a.positions.has('ETH')).toBe(false)
  })

  it('closes the position at take-profit and cancels resting sells first', () => {
    const a = account()
    a.placeOrder({ symbol: 'ETH', side: 'buy', type: 'market', qty: 1, takeProfit: 2100 }, 2000, T)
    a.placeOrder({ symbol: 'ETH', side: 'sell', type: 'limit', qty: 0.5, limitPrice: 2300 }, 2000, T)
    const fills = a.onPrice('ETH', 2105, T + 1)
    expect(fills).toHaveLength(1)
    expect(fills[0]).toMatchObject({ reason: 'Take-profit triggered', qty: 1 })
    expect(a.openOrders).toHaveLength(0)
  })

  it('lets the user change protection on an open position', () => {
    const a = account()
    a.placeOrder({ symbol: 'ETH', side: 'buy', type: 'market', qty: 1 }, 2000, T)
    a.setProtection('ETH', 2000, 1980, undefined)
    expect(a.onPrice('ETH', 1979, T + 1)[0].reason).toBe('Stop-loss triggered')
    expect(() => a.setProtection('ETH', 2000, 1900)).toThrow(/No open ETH/)
  })
})
