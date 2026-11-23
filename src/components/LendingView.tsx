import { useState } from 'react'
import { analyzeLoan, COLLATERAL_PARAMS, validateLoan, type LoanInput } from '../core/lending'
import { formatPct, formatPrice, formatUsd } from '../core/format'
import { useSimulation } from '../state/simulation'
import { Badge, NumberField, Panel, Stat } from './ui'

const STATUS_TONE = { Healthy: 'up', 'Over max LTV': 'warn', 'At risk': 'warn', Liquidatable: 'down' } as const

export default function LendingView() {
  const sim = useSimulation()
  const [asset, setAsset] = useState('ETH')
  const [followMarket, setFollowMarket] = useState(true)
  const [form, setForm] = useState({
    collateralAmount: '3',
    collateralPrice: sim.market.price('ETH').toFixed(2),
    debt: '5000',
    maxLtvPct: String(COLLATERAL_PARAMS.ETH.maxLtvPct),
    liquidationThresholdPct: String(COLLATERAL_PARAMS.ETH.liquidationThresholdPct),
    aprPct: '6',
    termMonths: '12',
  })
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }))

  const decimals = sim.market.asset(asset).decimals
  const marketPrice = sim.market.price(asset)
  const input: LoanInput = {
    collateralAmount: Number(form.collateralAmount),
    collateralPrice: followMarket ? marketPrice : Number(form.collateralPrice),
    debt: Number(form.debt),
    maxLtvPct: Number(form.maxLtvPct),
    liquidationThresholdPct: Number(form.liquidationThresholdPct),
    aprPct: Number(form.aprPct),
    termMonths: Number(form.termMonths),
  }
  const errors = validateLoan(input)
  const loan = errors.length ? null : analyzeLoan(input)

  const chooseAsset = (symbol: string) => {
    setAsset(symbol)
    const params = COLLATERAL_PARAMS[symbol]
    setForm((f) => ({
      ...f,
      collateralPrice: sim.market.price(symbol).toFixed(sim.market.asset(symbol).decimals),
      maxLtvPct: String(params.maxLtvPct),
      liquidationThresholdPct: String(params.liquidationThresholdPct),
    }))
  }

  const ltvScale = Math.max(100, input.liquidationThresholdPct + 10)
  const pos = (pct: number) => `${Math.min(100, Math.max(0, (pct / ltvScale) * 100))}%`

  return (
    <div className="lending-layout">
      <Panel title="Crypto-backed loan" id="loan" className="loan-form">
        <p className="muted small">
          An educational model of an over-collateralized loan. Risk parameters are illustrative, not any protocol's live settings, and nothing is borrowed.
        </p>
        <form onSubmit={(e) => e.preventDefault()} noValidate>
          <label className="field" htmlFor="loan-asset">
            <span className="field-label">Collateral asset</span>
            <select id="loan-asset" value={asset} onChange={(e) => chooseAsset(e.target.value)}>
              {sim.market.assets.map((a) => <option key={a.symbol} value={a.symbol}>{a.name} ({a.symbol})</option>)}
            </select>
          </label>
          <div className="field-grid">
            <NumberField id="loan-amount" label="Collateral amount" value={form.collateralAmount} onChange={set('collateralAmount')} suffix={asset} />
            <NumberField
              id="loan-price"
              label="Collateral price"
              value={followMarket ? marketPrice.toFixed(decimals) : form.collateralPrice}
              onChange={set('collateralPrice')}
              disabled={followMarket}
              suffix="USD"
            />
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={followMarket}
              onChange={(e) => {
                setFollowMarket(e.target.checked)
                if (!e.target.checked) set('collateralPrice')(marketPrice.toFixed(decimals))
              }}
            />
            Follow the simulated market price live
          </label>
          <div className="field-grid">
            <NumberField id="loan-debt" label="Loan amount" value={form.debt} onChange={set('debt')} step={100} suffix="USD" />
            <NumberField id="loan-apr" label="Interest rate" value={form.aprPct} onChange={set('aprPct')} step={0.1} suffix="% APR" />
            <NumberField id="loan-term" label="Term" value={form.termMonths} onChange={set('termMonths')} step={1} suffix="months" />
            <NumberField id="loan-maxltv" label="Max LTV" value={form.maxLtvPct} onChange={set('maxLtvPct')} suffix="%" />
            <NumberField id="loan-liq" label="Liquidation threshold" value={form.liquidationThresholdPct} onChange={set('liquidationThresholdPct')} suffix="%" />
          </div>
        </form>
        {errors.length > 0 && <p className="feedback feedback-error" role="alert">{errors.join(' ')}</p>}
      </Panel>

      <div className="loan-results">
        <Panel
          title="Position health"
          id="health"
          actions={loan && <Badge tone={STATUS_TONE[loan.status]}>{loan.status}</Badge>}
        >
          {!loan ? <p className="muted">Fix the inputs to see results.</p> : (
            <>
              <div className="health-hero">
                <div>
                  <p className="muted small">Health factor</p>
                  <p className={`health-value tone-${loan.healthFactor < 1 ? 'down' : loan.healthFactor < 1.3 ? 'warn' : 'up'}`}>
                    {Number.isFinite(loan.healthFactor) ? loan.healthFactor.toFixed(2) : '∞'}
                  </p>
                  <p className="muted small">Below 1.00 the position can be liquidated.</p>
                </div>
                <div>
                  <p className="muted small">Liquidation price</p>
                  <p className="health-value">{loan.liquidationPrice ? formatPrice(loan.liquidationPrice, decimals) : '—'}</p>
                  <p className="muted small">
                    {loan.priceDropToLiquidationPct !== null ? `${asset} can fall ${formatPct(loan.priceDropToLiquidationPct, 1)} before liquidation.` : 'No debt, no liquidation risk.'}
                  </p>
                </div>
              </div>

              <div className="ltv-meter" aria-label={`Loan-to-value ${formatPct(loan.ltvPct, 1)}`}>
                <div className="ltv-track">
                  <div className="ltv-fill" style={{ width: pos(loan.ltvPct) }} />
                  <span className="ltv-mark ltv-mark-max" style={{ left: pos(input.maxLtvPct) }} title="Max LTV" />
                  <span className="ltv-mark ltv-mark-liq" style={{ left: pos(input.liquidationThresholdPct) }} title="Liquidation threshold" />
                </div>
                <div className="ltv-legend">
                  <span>LTV <b>{Number.isFinite(loan.ltvPct) ? formatPct(loan.ltvPct, 1) : '—'}</b></span>
                  <span className="ltv-key-max">Max {formatPct(input.maxLtvPct, 0)}</span>
                  <span className="ltv-key-liq">Liquidation {formatPct(input.liquidationThresholdPct, 0)}</span>
                </div>
              </div>

              <dl className="stats stats-loan">
                <Stat label="Collateral value" value={formatUsd(loan.collateralValue)} />
                <Stat label="Max borrow" value={formatUsd(loan.maxBorrow)} />
                <Stat label="Still available" value={formatUsd(loan.availableToBorrow)} />
                <Stat label="Monthly interest" value={formatUsd(loan.monthlyInterest)} />
                <Stat label={`Interest over ${input.termMonths} mo`} value={formatUsd(loan.totalInterest)} />
                <Stat label="Total repayment" value={formatUsd(loan.totalRepayment)} />
                <Stat label="LTV at maturity" value={formatPct(loan.ltvAtMaturityPct, 1)} hint="If interest accrues and the collateral price is unchanged" />
                <Stat label="Health at maturity" value={Number.isFinite(loan.healthFactorAtMaturity) ? loan.healthFactorAtMaturity.toFixed(2) : '∞'} />
              </dl>
            </>
          )}
        </Panel>

        <Panel title="Formulas" id="formulas">
          <ul className="formulas">
            <li><code>Collateral value = amount × price</code></li>
            <li><code>LTV = loan ÷ collateral value</code></li>
            <li><code>Health factor = collateral value × liquidation threshold ÷ loan</code></li>
            <li><code>Liquidation price = loan ÷ (amount × liquidation threshold)</code></li>
            <li><code>Interest = loan × APR ÷ 12 × months</code> (simple interest)</li>
          </ul>
          <p className="muted small">Real protocols add liquidation penalties, variable rates and oracle delays. This model leaves them out on purpose.</p>
        </Panel>
      </div>
    </div>
  )
}
