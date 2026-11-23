import { useState } from 'react'
import { loanPosition } from '../lib/lending.js'

const money = (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })

export default function LoanPanel() {
  const [form, setForm] = useState({
    collateralAmount: 2,
    collateralPrice: 3000,
    debt: 3000,
    maxLtvPct: 70,
    liquidationThresholdPct: 80,
  })
  const update = (key) => (event) => setForm((f) => ({ ...f, [key]: Number(event.target.value) }))

  let position = null
  let error = ''
  try {
    position = loanPosition(form)
  } catch (err) {
    error = err.message
  }

  const field = (key, label, step = 1) => (
    <label className="field">
      <span>{label}</span>
      <input type="number" min="0" step={step} value={form[key]} onChange={update(key)} />
    </label>
  )

  return (
    <section className="card" aria-labelledby="loan-title">
      <h2 id="loan-title">Collateralized loan</h2>
      <p className="muted">The math behind crypto-backed lending: loan-to-value, health factor, and liquidation price.</p>
      <div className="controls controls-2">
        {field('collateralAmount', 'Collateral (units)', 0.1)}
        {field('collateralPrice', 'Collateral price ($)', 10)}
        {field('debt', 'Borrowed ($)', 100)}
        {field('maxLtvPct', 'Max LTV %')}
        {field('liquidationThresholdPct', 'Liquidation at %')}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {position && (
        <dl className="stats">
          <div><dt>Collateral value</dt><dd>{money(position.collateralValue)}</dd></div>
          <div><dt>LTV</dt><dd>{Number.isFinite(position.ltvPct) ? `${position.ltvPct.toFixed(1)}%` : '—'}</dd></div>
          <div><dt>Health factor</dt><dd>{Number.isFinite(position.healthFactor) ? position.healthFactor.toFixed(2) : '∞'}</dd></div>
          <div><dt>Liquidation price</dt><dd>{position.liquidationPrice ? money(position.liquidationPrice) : '—'}</dd></div>
          <div><dt>Can still borrow</dt><dd>{money(position.availableToBorrow)}</dd></div>
          <div><dt>Status</dt><dd className={position.status === 'Healthy' ? 'up' : 'down'}>{position.status}</dd></div>
        </dl>
      )}
    </section>
  )
}
