import { useMemo, useState } from 'react'
import { validateBotConfig, type BotConfig, type BotStatus } from '../core/bot'
import { smaSeries } from '../core/indicators'
import { formatClock, formatPct, formatPrice, formatQty, formatSignedUsd, formatUsd } from '../core/format'
import { useSimulation } from '../state/simulation'
import CandleChart, { LineChart, type ChartLevel } from './CandleChart'
import { Badge, EmptyState, NumberField, Panel, Stat, toneOf } from './ui'

type Draft = Record<Exclude<keyof BotConfig, 'symbol'>, string> & { symbol: string }

const toDraft = (config: BotConfig): Draft => ({
  symbol: config.symbol,
  fastPeriod: String(config.fastPeriod),
  slowPeriod: String(config.slowPeriod),
  allocationPct: String(config.allocationPct),
  stopLossPct: String(config.stopLossPct),
  takeProfitPct: String(config.takeProfitPct),
  feePct: String(config.feePct),
  startingCash: String(config.startingCash),
  maxDrawdownPct: String(config.maxDrawdownPct),
})

const fromDraft = (draft: Draft): BotConfig => ({
  symbol: draft.symbol,
  fastPeriod: Number(draft.fastPeriod),
  slowPeriod: Number(draft.slowPeriod),
  allocationPct: Number(draft.allocationPct),
  stopLossPct: Number(draft.stopLossPct),
  takeProfitPct: Number(draft.takeProfitPct),
  feePct: Number(draft.feePct),
  startingCash: Number(draft.startingCash),
  maxDrawdownPct: Number(draft.maxDrawdownPct),
})

const STATUS: Record<BotStatus, { label: string; tone: 'neutral' | 'up' | 'warn' | 'down' | 'info' }> = {
  idle: { label: 'Idle', tone: 'neutral' },
  running: { label: 'Running', tone: 'up' },
  paused: { label: 'Paused', tone: 'warn' },
  stopped: { label: 'Stopped', tone: 'info' },
  halted: { label: 'Halted by kill switch', tone: 'down' },
}

export default function BotView() {
  const sim = useSimulation()
  const bot = sim.bot
  const [draft, setDraft] = useState<Draft>(() => toDraft(bot.config))
  const [configError, setConfigError] = useState('')
  const [actionError, setActionError] = useState('')

  const symbol = bot.config.symbol
  const asset = sim.market.asset(symbol)
  const price = sim.market.price(symbol)
  const stats = bot.stats(price)
  const trading = bot.status === 'running' || bot.status === 'paused'
  const dirty = JSON.stringify(fromDraft(draft)) !== JSON.stringify(bot.config)
  const candles = sim.market.candles(symbol)
  const closes = candles.map((c) => c.close)
  const position = bot.position

  const fills = bot.account.fills
  const markers = useMemo(
    () => fills.map((f) => ({ id: f.id, time: f.time, side: f.side, price: f.price })),
    [fills, fills.length],
  )
  const levels: ChartLevel[] = position
    ? [
        { label: 'Entry', price: position.avgEntry, tone: 'entry' },
        ...(position.stopLoss ? [{ label: 'Stop', price: position.stopLoss, tone: 'stop' as const }] : []),
        ...(position.takeProfit ? [{ label: 'Target', price: position.takeProfit, tone: 'target' as const }] : []),
      ]
    : []

  const set = (key: keyof Draft) => (value: string) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setConfigError('')
  }

  const apply = () => {
    const config = fromDraft(draft)
    const errors = validateBotConfig(config)
    if (errors.length) return setConfigError(errors.join(' '))
    try {
      sim.configureBot(config)
      setConfigError('')
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : 'Could not apply settings.')
    }
  }

  const run = (action: () => void) => {
    try {
      setActionError('')
      action()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Action failed.')
    }
  }

  const status = STATUS[bot.status]
  const logs = bot.logs.slice(-80).reverse()

  return (
    <div className="bot-layout">
      <Panel
        className="bot-controls"
        title="Strategy bot"
        id="bot"
        actions={<Badge tone={status.tone}>{status.label}</Badge>}
      >
        <p className="muted small">{bot.strategyLabel}</p>
        <div className="button-row">
          {(bot.status === 'idle' || bot.status === 'stopped') && (
            <button type="button" className="button button-up" disabled={dirty} onClick={() => run(() => sim.startBot())}>Start bot</button>
          )}
          {bot.status === 'running' && <button type="button" className="button" onClick={() => run(() => sim.pauseBot())}>Pause</button>}
          {bot.status === 'paused' && <button type="button" className="button button-up" onClick={() => run(() => sim.startBot())}>Resume</button>}
          {trading && <button type="button" className="button button-down" onClick={() => run(() => sim.stopBot())}>Stop &amp; flatten</button>}
          {!trading && (
            <button type="button" className="button button-ghost" onClick={apply}>
              {dirty ? 'Apply settings' : 'Reset results'}
            </button>
          )}
        </div>
        {dirty && !trading && <p className="feedback feedback-info">Apply the new settings before starting. Applying clears this bot's results.</p>}
        {actionError && <p className="feedback feedback-error" role="alert">{actionError}</p>}

        <form className="bot-form" onSubmit={(e) => { e.preventDefault(); apply() }}>
          <fieldset disabled={trading}>
            <legend>Settings {trading && <span className="muted">· stop the bot to edit</span>}</legend>
            <label className="field" htmlFor="bot-symbol">
              <span className="field-label">Market</span>
              <select id="bot-symbol" value={draft.symbol} onChange={(e) => set('symbol')(e.target.value)}>
                {sim.market.assets.map((a) => <option key={a.symbol} value={a.symbol}>{a.symbol}/USD</option>)}
              </select>
            </label>
            <div className="field-grid">
              <NumberField id="bot-fast" label="Fast MA" value={draft.fastPeriod} onChange={set('fastPeriod')} step={1} suffix="candles" />
              <NumberField id="bot-slow" label="Slow MA" value={draft.slowPeriod} onChange={set('slowPeriod')} step={1} suffix="candles" />
              <NumberField id="bot-alloc" label="Position size" value={draft.allocationPct} onChange={set('allocationPct')} suffix="% of cash" />
              <NumberField id="bot-fee" label="Fee per trade" value={draft.feePct} onChange={set('feePct')} step={0.01} suffix="%" />
              <NumberField id="bot-sl" label="Stop-loss" value={draft.stopLossPct} onChange={set('stopLossPct')} step={0.1} suffix="%" />
              <NumberField id="bot-tp" label="Take-profit" value={draft.takeProfitPct} onChange={set('takeProfitPct')} step={0.1} suffix="%" />
              <NumberField id="bot-dd" label="Max drawdown" value={draft.maxDrawdownPct} onChange={set('maxDrawdownPct')} suffix="% kill switch" />
              <NumberField id="bot-cash" label="Starting balance" value={draft.startingCash} onChange={set('startingCash')} step={100} suffix="USD" />
            </div>
          </fieldset>
          {configError && <p className="feedback feedback-error" role="alert">{configError}</p>}
        </form>

        <details className="rules">
          <summary>How the bot decides</summary>
          <ol>
            <li>Signals use completed candles only, never the candle still forming.</li>
            <li>Enters long when the fast MA crosses above the slow MA and it has no position. Size is the set share of available cash, net of fees.</li>
            <li>Each entry gets a stop-loss and take-profit, checked on every price tick.</li>
            <li>Exits when the fast MA crosses back below the slow MA.</li>
            <li>If equity falls the max-drawdown amount below its peak, it closes the position and halts until reset.</li>
            <li>Pause stops new signals, but stops, targets and the kill switch keep protecting an open position.</li>
          </ol>
        </details>
      </Panel>

      <div className="bot-main">
        <Panel className="bot-stats">
          <dl className="stats stats-bot">
            <Stat label="Net P&L" value={`${formatSignedUsd(stats.netPnl)} (${formatPct(stats.netPnlPct, 2, true)})`} tone={toneOf(stats.netPnl)} />
            <Stat label="Equity" value={formatUsd(stats.equity)} />
            <Stat label="Closed trades" value={stats.closedTrades} />
            <Stat label="Win rate" value={stats.closedTrades ? formatPct(stats.winRatePct, 0) : '—'} />
            <Stat label="Max drawdown" value={formatPct(stats.maxDrawdownPct)} tone={stats.maxDrawdownPct > 0 ? 'down' : undefined} />
            <Stat label="Fees paid" value={formatUsd(stats.feesPaid)} tone="muted" />
            <Stat
              label="Open position"
              value={position ? `${formatQty(position.qty)} ${symbol} @ ${formatPrice(position.avgEntry, asset.decimals)}` : 'Flat'}
            />
            <Stat label="Unrealized P&L" value={position ? formatSignedUsd(stats.unrealizedPnl) : '—'} tone={position ? toneOf(stats.unrealizedPnl) : undefined} />
          </dl>
        </Panel>

        <Panel
          className="chart-panel"
          title={<span className="instrument"><b>{symbol}/USD</b><span className="instrument-price">{formatPrice(price, asset.decimals)}</span><span className="muted">bot market</span></span>}
        >
          <CandleChart
            candles={candles}
            decimals={asset.decimals}
            height={300}
            overlays={[
              { label: `MA ${bot.config.fastPeriod}`, color: 'var(--ma-fast)', values: smaSeries(closes, bot.config.fastPeriod) },
              { label: `MA ${bot.config.slowPeriod}`, color: 'var(--ma-slow)', values: smaSeries(closes, bot.config.slowPeriod) },
            ]}
            markers={markers}
            levels={levels}
            label={`Simulated ${symbol}/USD candles with the bot's moving averages and trades`}
          />
        </Panel>

        <div className="bot-bottom">
          <Panel title="Equity curve" id="equity">
            <LineChart values={bot.equityCurve.map((p) => p.equity)} label="Bot equity over time" />
          </Panel>
          <Panel title="Execution log" id="log" className="log-panel">
            {logs.length === 0
              ? <EmptyState title="No activity yet">Start the bot. Signals, orders, fills and risk events are logged here.</EmptyState>
              : (
                <ol className="log">
                  {logs.map((entry) => (
                    <li key={entry.id} className={`log-${entry.kind}`}>
                      <time>{formatClock(entry.time)}</time>
                      <span className="log-kind">{entry.kind}</span>
                      <span>{entry.message}</span>
                    </li>
                  ))}
                </ol>
              )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
