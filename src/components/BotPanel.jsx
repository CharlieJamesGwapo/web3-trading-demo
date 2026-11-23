import { useEffect, useMemo, useRef, useState } from 'react'
import { createPriceFeed } from '../lib/market.js'
import { DEFAULT_CONFIG, runBacktest, validateConfig } from '../lib/strategy.js'

const WARMUP = 120
const MAX_POINTS = 400
const money = (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
const pct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`

function PriceChart({ prices, trades }) {
  const width = 640
  const height = 220
  if (prices.length < 2) return null
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const x = (i) => (i / (prices.length - 1)) * width
  const y = (p) => height - 8 - ((p - min) / (max - min || 1)) * (height - 16)
  const path = prices.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join('')
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Simulated price with bot buy and sell markers">
      <path d={path} className="chart-line" />
      {trades.map((t) => (
        <circle key={`${t.side}-${t.index}`} cx={x(t.index)} cy={y(t.price)} r="4.5"
          className={t.side === 'BUY' ? 'marker-buy' : 'marker-sell'} />
      ))}
    </svg>
  )
}

export default function BotPanel() {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [seed, setSeed] = useState(42)
  const [prices, setPrices] = useState([])
  const [running, setRunning] = useState(false)
  const feedRef = useRef(null)

  useEffect(() => {
    const feed = createPriceFeed({ seed })
    feedRef.current = feed
    setPrices(Array.from({ length: WARMUP }, feed))
  }, [seed])

  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => {
      setPrices((prev) => [...prev, feedRef.current()].slice(-MAX_POINTS))
    }, 400)
    return () => clearInterval(id)
  }, [running])

  const errors = validateConfig(config)
  const result = useMemo(() => (errors.length ? null : runBacktest(prices, config)), [prices, config, errors.length])

  const update = (key) => (event) => setConfig((c) => ({ ...c, [key]: Number(event.target.value) }))
  const field = (key, label, step = 1) => (
    <label className="field">
      <span>{label}</span>
      <input type="number" step={step} value={config[key]} onChange={update(key)} disabled={running} />
    </label>
  )

  return (
    <section className="card card-wide" aria-labelledby="bot-title">
      <div className="card-head">
        <h2 id="bot-title">Paper-trading bot</h2>
        <span className={`status ${running ? 'status-on' : ''}`}>{running ? 'Running' : 'Stopped'}</span>
      </div>
      <p className="muted">
        Moving-average crossover strategy with a stop-loss and trading fees, run against a simulated price feed.
        Change the settings to re-run the backtest.
      </p>

      <div className="controls">
        {field('fastPeriod', 'Fast MA')}
        {field('slowPeriod', 'Slow MA')}
        {field('stopLossPct', 'Stop-loss %', 0.5)}
        {field('feePct', 'Fee %', 0.05)}
        {field('allocationPct', 'Allocation %', 5)}
      </div>
      <div className="actions">
        <button type="button" className="button" onClick={() => setRunning((r) => !r)} disabled={errors.length > 0}>
          {running ? 'Stop bot' : 'Start live feed'}
        </button>
        <button type="button" className="button button-ghost" onClick={() => { setRunning(false); setSeed((s) => s + 1) }}>
          New market scenario
        </button>
      </div>
      {errors.length > 0 && <p className="error" role="alert">{errors.join(' ')}</p>}

      {result && (
        <>
          <PriceChart prices={prices} trades={result.trades} />
          <dl className="stats">
            <div><dt>Equity</dt><dd>{money(result.stats.finalEquity)}</dd></div>
            <div><dt>Return</dt><dd className={result.stats.returnPct >= 0 ? 'up' : 'down'}>{pct(result.stats.returnPct)}</dd></div>
            <div><dt>Closed trades</dt><dd>{result.stats.closedTrades}</dd></div>
            <div><dt>Win rate</dt><dd>{result.stats.winRatePct.toFixed(0)}%</dd></div>
            <div><dt>Max drawdown</dt><dd>{result.stats.maxDrawdownPct.toFixed(2)}%</dd></div>
            <div><dt>Position</dt><dd>{result.position ? `Long @ ${result.position.entryPrice.toFixed(2)}` : 'Flat'}</dd></div>
          </dl>
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Most recent bot trades</caption>
              <thead><tr><th>Tick</th><th>Side</th><th>Price</th><th>Reason</th><th>P&amp;L</th></tr></thead>
              <tbody>
                {result.trades.slice(-8).reverse().map((t) => (
                  <tr key={`${t.side}-${t.index}`}>
                    <td>{t.index}</td>
                    <td className={t.side === 'BUY' ? 'up' : 'down'}>{t.side}</td>
                    <td>{t.price.toFixed(2)}</td>
                    <td>{t.reason}</td>
                    <td className={t.pnl == null ? '' : t.pnl >= 0 ? 'up' : 'down'}>{t.pnl == null ? '—' : money(t.pnl)}</td>
                  </tr>
                ))}
                {result.trades.length === 0 && <tr><td colSpan="5" className="muted">No trades yet. Start the live feed.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
