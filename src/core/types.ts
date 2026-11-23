export type Side = 'buy' | 'sell'
export type OrderType = 'market' | 'limit'
export type OrderSource = 'manual' | 'bot'
export type OrderStatus = 'open' | 'filled' | 'cancelled'

export interface AssetConfig {
  symbol: string
  name: string
  /** Illustrative starting level for the simulation, not a quote. */
  startPrice: number
  /** Standard deviation of log returns per tick. */
  volatility: number
  decimals: number
}

export interface Candle {
  /** Unix seconds at the start of the candle. */
  time: number
  open: number
  high: number
  low: number
  close: number
}

export interface OrderRequest {
  symbol: string
  side: Side
  type: OrderType
  qty: number
  limitPrice?: number
  stopLoss?: number
  takeProfit?: number
  source?: OrderSource
}

export interface Order {
  id: string
  symbol: string
  side: Side
  type: OrderType
  qty: number
  limitPrice?: number
  stopLoss?: number
  takeProfit?: number
  source: OrderSource
  status: OrderStatus
  createdAt: number
  filledAt?: number
  fillPrice?: number
}

export interface Fill {
  id: string
  orderId: string
  symbol: string
  side: Side
  qty: number
  price: number
  fee: number
  /** Profit or loss realized by this fill after all fees. Null for buys. */
  realizedPnl: number | null
  time: number
  reason: string
  source: OrderSource
}

export interface Position {
  symbol: string
  qty: number
  /** Volume-weighted entry price, excluding fees. */
  avgEntry: number
  /** Total paid for the open quantity, including buy fees. */
  costBasis: number
  stopLoss?: number
  takeProfit?: number
  openedAt: number
}
