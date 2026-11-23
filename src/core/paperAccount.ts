import type { Fill, Order, OrderRequest, OrderSource, Position } from './types'

/** Thrown for orders the account refuses. The message is safe to show to the user. */
export class OrderError extends Error {}

const EPSILON = 1e-9

export interface AccountOptions {
  startingCash?: number
  feePct?: number
}

/**
 * Spot paper-trading account in USD. Long-only: sells can't exceed the quantity held.
 * Fees are charged on both sides. Cost basis includes buy fees, so realized P&L is net of all fees
 * and equity always equals starting cash plus realized plus unrealized P&L.
 */
export class PaperAccount {
  readonly startingCash: number
  readonly feeRate: number
  cash: number
  realizedPnl = 0
  feesPaid = 0
  readonly positions = new Map<string, Position>()
  readonly orders: Order[] = []
  readonly fills: Fill[] = []
  private sequence = 0

  constructor({ startingCash = 10_000, feePct = 0.1 }: AccountOptions = {}) {
    if (!(startingCash > 0)) throw new OrderError('Starting cash must be positive.')
    if (!(feePct >= 0 && feePct < 5)) throw new OrderError('Fee must be between 0% and 5%.')
    this.startingCash = startingCash
    this.feeRate = feePct / 100
    this.cash = startingCash
  }

  get openOrders(): Order[] {
    return this.orders.filter((o) => o.status === 'open')
  }

  /** Cash set aside for open limit buys, including their fees. */
  reservedCash(): number {
    return this.openOrders
      .filter((o) => o.side === 'buy')
      .reduce((sum, o) => sum + o.qty * o.limitPrice! * (1 + this.feeRate), 0)
  }

  availableCash(): number {
    return Math.max(0, this.cash - this.reservedCash())
  }

  availableQty(symbol: string): number {
    const held = this.positions.get(symbol)?.qty ?? 0
    const reserved = this.openOrders
      .filter((o) => o.side === 'sell' && o.symbol === symbol)
      .reduce((sum, o) => sum + o.qty, 0)
    return Math.max(0, held - reserved)
  }

  equity(priceOf: (symbol: string) => number): number {
    let value = this.cash
    for (const position of this.positions.values()) value += position.qty * priceOf(position.symbol)
    return value
  }

  /** Mark-to-market P&L of an open position, net of the buy fee and before any exit fee. */
  unrealizedPnl(symbol: string, price: number): number {
    const position = this.positions.get(symbol)
    return position ? position.qty * price - position.costBasis : 0
  }

  placeOrder(request: OrderRequest, marketPrice: number, time: number): Order {
    const { symbol, side, type, qty, limitPrice, stopLoss, takeProfit } = request
    if (!(marketPrice > 0)) throw new OrderError('No market price available.')
    if (!Number.isFinite(qty) || qty <= 0) throw new OrderError('Enter a quantity greater than zero.')
    if (type === 'limit' && !(Number.isFinite(limitPrice) && limitPrice! > 0)) {
      throw new OrderError('Enter a limit price greater than zero.')
    }
    const referencePrice = type === 'limit' ? limitPrice! : marketPrice

    if (side === 'sell' && (stopLoss !== undefined || takeProfit !== undefined)) {
      throw new OrderError('Stop-loss and take-profit attach to buy orders.')
    }
    if (stopLoss !== undefined && !(stopLoss > 0 && stopLoss < referencePrice)) {
      throw new OrderError('Stop-loss must be below the entry price.')
    }
    if (takeProfit !== undefined && !(takeProfit > referencePrice)) {
      throw new OrderError('Take-profit must be above the entry price.')
    }
    if (qty * referencePrice < 1) throw new OrderError('Minimum order size is $1.')

    if (side === 'buy') {
      const required = qty * referencePrice * (1 + this.feeRate)
      if (required > this.availableCash() + EPSILON) {
        throw new OrderError(`Insufficient balance: this order needs $${required.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} including fees.`)
      }
    } else if (qty > this.availableQty(symbol) + EPSILON) {
      throw new OrderError(`Not enough ${symbol} available to sell.`)
    }

    const order: Order = {
      id: this.nextId('O'),
      symbol,
      side,
      type,
      qty,
      limitPrice: type === 'limit' ? limitPrice : undefined,
      stopLoss,
      takeProfit,
      source: request.source ?? 'manual',
      status: 'open',
      createdAt: time,
    }
    this.orders.push(order)

    if (type === 'market') {
      this.execute(order, marketPrice, time, 'Market order')
    } else {
      // A limit that is already better than the market fills immediately at the market price.
      const marketable = side === 'buy' ? limitPrice! >= marketPrice : limitPrice! <= marketPrice
      if (marketable) this.execute(order, marketPrice, time, 'Limit order (filled on entry)')
    }
    return order
  }

  cancelOrder(orderId: string): boolean {
    const order = this.orders.find((o) => o.id === orderId && o.status === 'open')
    if (!order) return false
    order.status = 'cancelled'
    return true
  }

  setProtection(symbol: string, price: number, stopLoss?: number, takeProfit?: number): void {
    const position = this.positions.get(symbol)
    if (!position) throw new OrderError(`No open ${symbol} position.`)
    if (stopLoss !== undefined && !(stopLoss > 0 && stopLoss < price)) {
      throw new OrderError('Stop-loss must be below the current price.')
    }
    if (takeProfit !== undefined && !(takeProfit > price)) {
      throw new OrderError('Take-profit must be above the current price.')
    }
    position.stopLoss = stopLoss
    position.takeProfit = takeProfit
  }

  /**
   * Processes a new price: fills resting limit orders that the price crossed, then enforces the
   * position's stop-loss and take-profit. Protective exits fill at the tick price, so a fast move
   * can fill beyond the trigger (slippage), as it would on a real venue.
   */
  onPrice(symbol: string, price: number, time: number, source: OrderSource = 'manual'): Fill[] {
    const fills: Fill[] = []
    for (const order of this.openOrders) {
      if (order.symbol !== symbol) continue
      const crossed = order.side === 'buy' ? price <= order.limitPrice! : price >= order.limitPrice!
      if (crossed) fills.push(this.execute(order, order.limitPrice!, time, 'Limit order filled'))
    }
    const position = this.positions.get(symbol)
    if (position) {
      if (position.stopLoss !== undefined && price <= position.stopLoss) {
        const fill = this.closePosition(symbol, price, time, 'Stop-loss triggered', source)
        if (fill) fills.push(fill)
      } else if (position.takeProfit !== undefined && price >= position.takeProfit) {
        const fill = this.closePosition(symbol, price, time, 'Take-profit triggered', source)
        if (fill) fills.push(fill)
      }
    }
    return fills
  }

  /** Sells the whole position at the given price, cancelling resting sells for it first. */
  closePosition(symbol: string, price: number, time: number, reason: string, source: OrderSource): Fill | null {
    const position = this.positions.get(symbol)
    if (!position) return null
    for (const order of this.openOrders) {
      if (order.symbol === symbol && order.side === 'sell') order.status = 'cancelled'
    }
    const order: Order = {
      id: this.nextId('O'),
      symbol,
      side: 'sell',
      type: 'market',
      qty: position.qty,
      source,
      status: 'open',
      createdAt: time,
    }
    this.orders.push(order)
    return this.execute(order, price, time, reason)
  }

  private execute(order: Order, price: number, time: number, reason: string): Fill {
    const notional = order.qty * price
    const fee = notional * this.feeRate
    let realizedPnl: number | null = null

    if (order.side === 'buy') {
      const existing = this.positions.get(order.symbol)
      const position: Position = existing ?? {
        symbol: order.symbol,
        qty: 0,
        avgEntry: 0,
        costBasis: 0,
        openedAt: time,
      }
      position.avgEntry = (position.avgEntry * position.qty + price * order.qty) / (position.qty + order.qty)
      position.qty += order.qty
      position.costBasis += notional + fee
      if (order.stopLoss !== undefined) position.stopLoss = order.stopLoss
      if (order.takeProfit !== undefined) position.takeProfit = order.takeProfit
      this.positions.set(order.symbol, position)
      this.cash -= notional + fee
    } else {
      const position = this.positions.get(order.symbol)!
      const basisSold = position.costBasis * (order.qty / position.qty)
      realizedPnl = notional - fee - basisSold
      position.qty -= order.qty
      position.costBasis -= basisSold
      if (position.qty <= EPSILON) this.positions.delete(order.symbol)
      this.cash += notional - fee
      this.realizedPnl += realizedPnl
    }

    this.feesPaid += fee
    order.status = 'filled'
    order.filledAt = time
    order.fillPrice = price

    const fill: Fill = {
      id: this.nextId('F'),
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      qty: order.qty,
      price,
      fee,
      realizedPnl,
      time,
      reason,
      source: order.source,
    }
    this.fills.push(fill)
    return fill
  }

  private nextId(prefix: string): string {
    this.sequence += 1
    return `${prefix}-${String(this.sequence).padStart(5, '0')}`
  }
}
