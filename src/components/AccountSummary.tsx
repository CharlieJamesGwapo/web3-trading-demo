import { formatPct, formatSignedUsd, formatUsd } from '../core/format'
import { useSimulation } from '../state/simulation'
import { Panel, Stat, toneOf } from './ui'

export default function AccountSummary() {
  const sim = useSimulation()
  const account = sim.account
  const priceOf = (symbol: string) => sim.market.price(symbol)
  const equity = account.equity(priceOf)
  let unrealized = 0
  for (const position of account.positions.values()) unrealized += account.unrealizedPnl(position.symbol, priceOf(position.symbol))
  const net = equity - account.startingCash

  const reset = () => {
    if (window.confirm('Reset the paper account to $10,000 and clear all positions, orders and history?')) sim.resetAccount()
  }

  return (
    <Panel
      title="Paper account"
      id="account"
      actions={<button type="button" className="button button-ghost button-small" onClick={reset}>Reset</button>}
    >
      <dl className="stats stats-account">
        <Stat label="Equity" value={formatUsd(equity)} />
        <Stat label="Net P&L" value={`${formatSignedUsd(net)} (${formatPct((net / account.startingCash) * 100, 2, true)})`} tone={toneOf(net)} />
        <Stat label="Cash available" value={formatUsd(account.availableCash())} />
        <Stat label="Unrealized P&L" value={formatSignedUsd(unrealized)} tone={toneOf(unrealized)} hint="Mark-to-market, net of the buy fee, before any exit fee" />
        <Stat label="Realized P&L" value={formatSignedUsd(account.realizedPnl)} tone={toneOf(account.realizedPnl)} hint="Closed trades, net of all fees" />
        <Stat label="Fees paid" value={formatUsd(account.feesPaid)} tone="muted" />
      </dl>
    </Panel>
  )
}
