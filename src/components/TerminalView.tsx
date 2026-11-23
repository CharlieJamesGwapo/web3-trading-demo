import { useMemo, useState } from 'react'
import { smaSeries } from '../core/indicators'
import { formatPct, formatPrice } from '../core/format'
import { useSimulation } from '../state/simulation'
import AccountSummary from './AccountSummary'
import ActivityTabs from './ActivityTabs'
import CandleChart, { type ChartLevel } from './CandleChart'
import MarketList from './MarketList'
import OrderTicket from './OrderTicket'
import { Panel } from './ui'

export default function TerminalView() {
  const sim = useSimulation()
  const [symbol, setSymbol] = useState('BTC')
  const [showMa, setShowMa] = useState(true)
  const asset = sim.market.asset(symbol)
  const candles = sim.market.candles(symbol)
  const closes = candles.map((c) => c.close)
  const price = sim.market.price(symbol)
  const change = sim.market.changePct(symbol)

  const overlays = showMa
    ? [
        { label: 'MA 9', color: 'var(--ma-fast)', values: smaSeries(closes, 9) },
        { label: 'MA 21', color: 'var(--ma-slow)', values: smaSeries(closes, 21) },
      ]
    : []

  const position = sim.account.positions.get(symbol)
  const levels: ChartLevel[] = []
  if (position) {
    levels.push({ label: 'Entry', price: position.avgEntry, tone: 'entry' })
    if (position.stopLoss) levels.push({ label: 'Stop', price: position.stopLoss, tone: 'stop' })
    if (position.takeProfit) levels.push({ label: 'Target', price: position.takeProfit, tone: 'target' })
  }
  for (const order of sim.account.openOrders) {
    if (order.symbol === symbol) levels.push({ label: order.side === 'buy' ? 'Bid' : 'Ask', price: order.limitPrice!, tone: 'order' })
  }

  const fills = sim.account.fills
  const markers = useMemo(
    () => fills.filter((f) => f.symbol === symbol).map((f) => ({ id: f.id, time: f.time, side: f.side, price: f.price })),
    [fills, fills.length, symbol],
  )

  return (
    <div className="terminal">
      <MarketList selected={symbol} onSelect={setSymbol} />
      <div className="terminal-main">
        <Panel
          className="chart-panel"
          title={
            <span className="instrument">
              <b>{asset.symbol}/USD</b>
              <span className="instrument-price">{formatPrice(price, asset.decimals)}</span>
              <span className={change >= 0 ? 'tone-up' : 'tone-down'}>{formatPct(change, 2, true)}</span>
            </span>
          }
          actions={
            <label className="check check-small">
              <input type="checkbox" checked={showMa} onChange={(e) => setShowMa(e.target.checked)} /> Moving averages
            </label>
          }
        >
          <CandleChart
            candles={candles}
            decimals={asset.decimals}
            overlays={overlays}
            markers={markers}
            levels={levels}
            label={`Simulated ${asset.symbol}/USD one-minute candles with your paper trades`}
          />
          <p className="chart-note">Simulated 1-minute candles. Triangles mark your paper fills; dashed lines show entry, stop, target and resting orders.</p>
        </Panel>
        <ActivityTabs />
      </div>
      <div className="terminal-side">
        <OrderTicket symbol={symbol} />
        <AccountSummary />
      </div>
    </div>
  )
}
