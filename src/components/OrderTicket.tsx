import { useEffect, useState, type FormEvent } from 'react'
import { OrderError } from '../core/paperAccount'
import { formatPrice, formatQty, formatUsd } from '../core/format'
import type { OrderType, Side } from '../core/types'
import { useSimulation } from '../state/simulation'
import { NumberField, Panel, Segmented } from './ui'

type Feedback = { kind: 'success' | 'error'; text: string } | null

const floor6 = (n: number) => Math.floor(n * 1e6) / 1e6
const parse = (value: string) => (value.trim() === '' ? Number.NaN : Number(value))

export default function OrderTicket({ symbol }: { symbol: string }) {
  const sim = useSimulation()
  const asset = sim.market.asset(symbol)
  const price = sim.market.price(symbol)
  const account = sim.account

  const [side, setSide] = useState<Side>('buy')
  const [type, setType] = useState<OrderType>('market')
  const [qty, setQty] = useState('')
  const [limit, setLimit] = useState('')
  const [useStop, setUseStop] = useState(false)
  const [useTarget, setUseTarget] = useState(false)
  const [stop, setStop] = useState('')
  const [target, setTarget] = useState('')
  const [feedback, setFeedback] = useState<Feedback>(null)

  // Reset price-dependent fields when the market changes.
  useEffect(() => {
    const current = sim.market.price(symbol)
    setQty('')
    setLimit(current.toFixed(asset.decimals))
    setUseStop(false)
    setUseTarget(false)
    setFeedback(null)
  }, [symbol])

  const referencePrice = type === 'limit' ? parse(limit) : price
  const qtyValue = parse(qty)
  const notional = qtyValue * referencePrice
  const fee = notional * account.feeRate
  const valid = Number.isFinite(notional) && notional > 0
  const held = account.availableQty(symbol)

  const fillPercent = (pct: number) => {
    const ref = Number.isFinite(referencePrice) && referencePrice > 0 ? referencePrice : price
    const amount = side === 'buy'
      ? (account.availableCash() * pct) / (ref * (1 + account.feeRate))
      : held * pct
    setQty(amount > 0 ? String(floor6(amount)) : '')
  }

  const defaultExits = (ref: number) => {
    const base = Number.isFinite(ref) && ref > 0 ? ref : price
    return { stop: (base * 0.98).toFixed(asset.decimals), target: (base * 1.04).toFixed(asset.decimals) }
  }
  const toggleStop = (on: boolean) => {
    setUseStop(on)
    if (on) setStop(defaultExits(referencePrice).stop)
  }
  const toggleTarget = (on: boolean) => {
    setUseTarget(on)
    if (on) setTarget(defaultExits(referencePrice).target)
  }
  // Exits are relative to the entry, so re-derive them when the entry reference changes type.
  const changeType = (next: OrderType) => {
    setType(next)
    const exits = defaultExits(next === 'limit' ? parse(limit) : price)
    setStop(exits.stop)
    setTarget(exits.target)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    try {
      const order = sim.placeOrder({
        symbol,
        side,
        type,
        qty: qtyValue,
        limitPrice: type === 'limit' ? parse(limit) : undefined,
        stopLoss: side === 'buy' && useStop ? parse(stop) : undefined,
        takeProfit: side === 'buy' && useTarget ? parse(target) : undefined,
      })
      const verb = side === 'buy' ? 'Bought' : 'Sold'
      setFeedback({
        kind: 'success',
        text: order.status === 'filled'
          ? `${verb} ${formatQty(order.qty)} ${symbol} at ${formatPrice(order.fillPrice!, asset.decimals)}.`
          : `Limit ${side} for ${formatQty(order.qty)} ${symbol} at ${formatPrice(order.limitPrice!, asset.decimals)} is resting.`,
      })
      setQty('')
      setUseStop(false)
      setUseTarget(false)
    } catch (error) {
      setFeedback({ kind: 'error', text: error instanceof OrderError ? error.message : 'The order could not be placed.' })
    }
  }

  return (
    <Panel title="Place order" id="ticket" className="ticket">
      <form onSubmit={submit} noValidate>
        <Segmented
          label="Order side"
          value={side}
          onChange={(value) => { setSide(value); setFeedback(null) }}
          options={[{ value: 'buy', label: 'Buy', tone: 'up' }, { value: 'sell', label: 'Sell', tone: 'down' }]}
        />
        <Segmented
          label="Order type"
          value={type}
          onChange={changeType}
          options={[{ value: 'market', label: 'Market' }, { value: 'limit', label: 'Limit' }]}
        />

        <p className="ticket-balance">
          <span>Available</span>
          <b>{side === 'buy' ? formatUsd(account.availableCash()) : `${formatQty(held)} ${symbol}`}</b>
        </p>

        {type === 'limit' && (
          <NumberField id="ticket-limit" label="Limit price" value={limit} onChange={setLimit} suffix="USD" />
        )}
        <NumberField id="ticket-qty" label="Amount" value={qty} onChange={setQty} suffix={symbol} />
        <div className="quick-sizes" role="group" aria-label="Quick size">
          {[0.25, 0.5, 0.75, 1].map((pct) => (
            <button type="button" key={pct} className="chip" onClick={() => fillPercent(pct)}>{pct * 100}%</button>
          ))}
        </div>

        {side === 'buy' && (
          <fieldset className="protection">
            <legend>Risk exits</legend>
            <label className="check">
              <input type="checkbox" checked={useStop} onChange={(e) => toggleStop(e.target.checked)} /> Stop-loss
            </label>
            {useStop && <NumberField id="ticket-sl" label="Stop-loss price" value={stop} onChange={setStop} suffix="USD" />}
            <label className="check">
              <input type="checkbox" checked={useTarget} onChange={(e) => toggleTarget(e.target.checked)} /> Take-profit
            </label>
            {useTarget && <NumberField id="ticket-tp" label="Take-profit price" value={target} onChange={setTarget} suffix="USD" />}
          </fieldset>
        )}

        <dl className="ticket-summary">
          <div><dt>{type === 'market' ? 'Market price' : 'Limit price'}</dt><dd>{Number.isFinite(referencePrice) ? formatPrice(referencePrice, asset.decimals) : '—'}</dd></div>
          <div><dt>Order value</dt><dd>{valid ? formatUsd(notional) : '—'}</dd></div>
          <div><dt>Fee ({(account.feeRate * 100).toFixed(2)}%)</dt><dd>{valid ? formatUsd(fee) : '—'}</dd></div>
          <div><dt>{side === 'buy' ? 'Total cost' : 'You receive'}</dt><dd>{valid ? formatUsd(side === 'buy' ? notional + fee : notional - fee) : '—'}</dd></div>
        </dl>

        <button type="submit" className={`button button-block ${side === 'buy' ? 'button-up' : 'button-down'}`}>
          {side === 'buy' ? 'Buy' : 'Sell'} {symbol} · paper
        </button>
        {feedback && (
          <p className={`feedback feedback-${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.text}</p>
        )}
      </form>
    </Panel>
  )
}
