import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { DEFAULT_BOT_CONFIG, TradingBot, type BotConfig } from '../core/bot'
import { SimulatedMarket } from '../core/market'
import { PaperAccount } from '../core/paperAccount'
import type { Order, OrderRequest } from '../core/types'

export const SPEEDS = [1, 4, 16] as const
export type Speed = (typeof SPEEDS)[number]

const TICK_MS = 250
export const MANUAL_STARTING_CASH = 10_000
export const MANUAL_FEE_PCT = 0.1

/**
 * Owns the simulated market, the manual paper account and the bot, and advances them together.
 * React components subscribe through useSyncExternalStore and re-render on each version bump.
 */
export class Simulation {
  market: SimulatedMarket
  account: PaperAccount
  bot: TradingBot
  running = true
  speed: Speed = 1
  private version = 0
  private readonly listeners = new Set<() => void>()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(seed = 2026) {
    this.market = new SimulatedMarket({ seed })
    this.account = new PaperAccount({ startingCash: MANUAL_STARTING_CASH, feePct: MANUAL_FEE_PCT })
    this.bot = new TradingBot(DEFAULT_BOT_CONFIG)
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getVersion = () => this.version

  attach(): () => void {
    this.timer = setInterval(() => {
      if (this.running) this.step(this.speed)
    }, TICK_MS)
    return () => {
      if (this.timer) clearInterval(this.timer)
      this.timer = null
    }
  }

  step(ticks: number): void {
    for (let i = 0; i < ticks; i++) {
      const candleClosed = this.market.tick()
      const time = this.market.time
      for (const asset of this.market.assets) {
        this.account.onPrice(asset.symbol, this.market.price(asset.symbol), time)
      }
      const botSymbol = this.bot.config.symbol
      const botPrice = this.market.price(botSymbol)
      this.bot.onTick(botPrice, time)
      if (candleClosed) this.bot.onCandleClose(this.market.closedCloses(botSymbol), botPrice, time)
    }
    this.emit()
  }

  setRunning(running: boolean): void {
    this.running = running
    this.emit()
  }

  setSpeed(speed: Speed): void {
    this.speed = speed
    this.emit()
  }

  placeOrder(request: OrderRequest): Order {
    const order = this.account.placeOrder(request, this.market.price(request.symbol), this.market.time)
    this.emit()
    return order
  }

  cancelOrder(orderId: string): void {
    this.account.cancelOrder(orderId)
    this.emit()
  }

  closePosition(symbol: string): void {
    this.account.closePosition(symbol, this.market.price(symbol), this.market.time, 'Closed manually', 'manual')
    this.emit()
  }

  setProtection(symbol: string, stopLoss?: number, takeProfit?: number): void {
    this.account.setProtection(symbol, this.market.price(symbol), stopLoss, takeProfit)
    this.emit()
  }

  resetAccount(): void {
    this.account = new PaperAccount({ startingCash: MANUAL_STARTING_CASH, feePct: MANUAL_FEE_PCT })
    this.emit()
  }

  startBot(): void {
    this.bot.start(this.market.time)
    this.emit()
  }

  pauseBot(): void {
    this.bot.pause(this.market.time)
    this.emit()
  }

  stopBot(): void {
    this.bot.stop(this.market.price(this.bot.config.symbol), this.market.time)
    this.emit()
  }

  configureBot(config: BotConfig): void {
    this.bot.reset(config, this.market.time)
    this.emit()
  }

  private emit(): void {
    this.version += 1
    for (const listener of this.listeners) listener()
  }
}

export const SimulationContext = createContext<Simulation | null>(null)

/** Creates one simulation for the app's lifetime and runs its clock while mounted. */
export function useCreateSimulation(): Simulation {
  const [simulation] = useState(() => new Simulation())
  useEffect(() => simulation.attach(), [simulation])
  return simulation
}

/** Returns the simulation and re-renders the caller whenever it changes. */
export function useSimulation(): Simulation {
  const simulation = useContext(SimulationContext)
  if (!simulation) throw new Error('useSimulation must be used inside SimulationContext.')
  useSyncExternalStore(simulation.subscribe, simulation.getVersion)
  return simulation
}
