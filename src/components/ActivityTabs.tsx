import { useState } from 'react'
import { formatClock, formatPrice, formatQty, formatSignedUsd, formatUsd } from '../core/format'
import { useSimulation } from '../state/simulation'
import { EmptyState, Panel, Segmented, toneOf } from './ui'

type Tab = 'positions' | 'orders' | 'history'

export default function ActivityTabs() {
  const sim = useSimulation()
  const account = sim.account
  const [tab, setTab] = useState<Tab>('positions')
  const positions = [...account.positions.values()]
  const openOrders = account.openOrders
  const fills = account.fills.slice(-60).reverse()
  const decimalsOf = (symbol: string) => sim.market.asset(symbol).decimals

  return (
    <Panel className="activity">
      <Segmented
        label="Account activity"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'positions', label: `Positions (${positions.length})` },
          { value: 'orders', label: `Open orders (${openOrders.length})` },
          { value: 'history', label: `Trade history (${account.fills.length})` },
        ]}
      />

      {tab === 'positions' && (positions.length === 0
        ? <EmptyState title="No open positions">Place a buy order to open one. Stop-loss and take-profit exits show here.</EmptyState>
        : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Market</th><th>Size</th><th>Entry</th><th>Mark</th><th>Value</th><th>Unrealized P&amp;L</th><th>Stop / Target</th><th /></tr></thead>
              <tbody>
                {positions.map((p) => {
                  const d = decimalsOf(p.symbol)
                  const mark = sim.market.price(p.symbol)
                  const pnl = account.unrealizedPnl(p.symbol, mark)
                  return (
                    <tr key={p.symbol}>
                      <td><b>{p.symbol}</b>/USD</td>
                      <td>{formatQty(p.qty)}</td>
                      <td>{formatPrice(p.avgEntry, d)}</td>
                      <td>{formatPrice(mark, d)}</td>
                      <td>{formatUsd(p.qty * mark)}</td>
                      <td className={`tone-${toneOf(pnl) ?? 'muted'}`}>{formatSignedUsd(pnl)} <small>({((pnl / p.costBasis) * 100).toFixed(2)}%)</small></td>
                      <td>{p.stopLoss ? formatPrice(p.stopLoss, d) : '—'} / {p.takeProfit ? formatPrice(p.takeProfit, d) : '—'}</td>
                      <td><button type="button" className="button button-small button-ghost" onClick={() => sim.closePosition(p.symbol)}>Close</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}

      {tab === 'orders' && (openOrders.length === 0
        ? <EmptyState title="No open orders">Limit orders rest here until the simulated price reaches them.</EmptyState>
        : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Placed</th><th>Market</th><th>Side</th><th>Size</th><th>Limit</th><th>Stop / Target</th><th /></tr></thead>
              <tbody>
                {openOrders.map((o) => {
                  const d = decimalsOf(o.symbol)
                  return (
                    <tr key={o.id}>
                      <td>{formatClock(o.createdAt)}</td>
                      <td><b>{o.symbol}</b>/USD</td>
                      <td className={o.side === 'buy' ? 'tone-up' : 'tone-down'}>{o.side.toUpperCase()}</td>
                      <td>{formatQty(o.qty)}</td>
                      <td>{formatPrice(o.limitPrice!, d)}</td>
                      <td>{o.stopLoss ? formatPrice(o.stopLoss, d) : '—'} / {o.takeProfit ? formatPrice(o.takeProfit, d) : '—'}</td>
                      <td><button type="button" className="button button-small button-ghost" onClick={() => sim.cancelOrder(o.id)}>Cancel</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}

      {tab === 'history' && (fills.length === 0
        ? <EmptyState title="No trades yet">Every fill is recorded here with its fee and realized P&amp;L.</EmptyState>
        : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Time</th><th>Market</th><th>Side</th><th>Size</th><th>Price</th><th>Fee</th><th>Realized P&amp;L</th><th>Reason</th></tr></thead>
              <tbody>
                {fills.map((f) => (
                  <tr key={f.id}>
                    <td>{formatClock(f.time)}</td>
                    <td><b>{f.symbol}</b>/USD</td>
                    <td className={f.side === 'buy' ? 'tone-up' : 'tone-down'}>{f.side.toUpperCase()}</td>
                    <td>{formatQty(f.qty)}</td>
                    <td>{formatPrice(f.price, decimalsOf(f.symbol))}</td>
                    <td>{formatUsd(f.fee)}</td>
                    <td className={f.realizedPnl === null ? 'tone-muted' : `tone-${toneOf(f.realizedPnl) ?? 'muted'}`}>{f.realizedPnl === null ? '—' : formatSignedUsd(f.realizedPnl)}</td>
                    <td className="muted">{f.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </Panel>
  )
}
