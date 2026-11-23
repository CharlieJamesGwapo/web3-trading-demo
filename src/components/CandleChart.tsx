import { useMemo, useState, type PointerEvent } from 'react'
import { CANDLE_SECONDS } from '../core/market'
import { formatClock, formatPrice } from '../core/format'
import type { Candle, Side } from '../core/types'
import { useElementWidth } from '../hooks/useElementWidth'

export interface ChartOverlay {
  label: string
  color: string
  values: readonly (number | null)[]
}

export interface ChartMarker {
  id: string
  time: number
  side: Side
  price: number
}

export interface ChartLevel {
  label: string
  price: number
  tone: 'entry' | 'stop' | 'target' | 'order'
}

interface Props {
  candles: readonly Candle[]
  decimals: number
  overlays?: ChartOverlay[]
  markers?: ChartMarker[]
  levels?: ChartLevel[]
  height?: number
  visible?: number
  label: string
}

const AXIS_WIDTH = 72
const TIME_AXIS = 22
const PAD_TOP = 12

export default function CandleChart({ candles, decimals, overlays = [], markers = [], levels = [], height = 360, visible = 90, label }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const count = Math.min(visible, candles.length)
  const view = candles.slice(-count)
  const offset = candles.length - count
  const plotW = width - AXIS_WIDTH
  const plotH = height - TIME_AXIS - PAD_TOP
  const step = plotW / Math.max(count, 1)
  const bodyW = Math.max(1, Math.min(14, step * 0.62))

  const { min, max } = useMemo(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const c of view) {
      lo = Math.min(lo, c.low)
      hi = Math.max(hi, c.high)
    }
    for (const level of levels) {
      lo = Math.min(lo, level.price)
      hi = Math.max(hi, level.price)
    }
    const pad = (hi - lo) * 0.08 || hi * 0.01
    return { min: lo - pad, max: hi + pad }
  }, [view, levels])

  const x = (i: number) => i * step + step / 2
  const y = (price: number) => PAD_TOP + ((max - price) / (max - min)) * plotH

  const lastClose = view[view.length - 1]?.close
  const gridPrices = useMemo(() => {
    const lines = 5
    const tagged = [lastClose, ...levels.map((l) => l.price)]
    const yOf = (p: number) => PAD_TOP + ((max - p) / (max - min)) * plotH
    return Array.from({ length: lines }, (_, i) => min + ((max - min) * (i + 0.5)) / lines)
      // Skip axis labels that a price tag would cover.
      .map((price) => ({ price, labelled: !tagged.some((t) => t !== undefined && Math.abs(yOf(t) - yOf(price)) < 16) }))
  }, [min, max, plotH, lastClose, levels])

  const timeLabels = useMemo(() => {
    const every = Math.max(1, Math.round(count / Math.max(2, Math.floor(plotW / 90))))
    return view.map((c, i) => ({ i, time: c.time })).filter(({ i }) => i % every === 0 && x(i) > 24 && x(i) < plotW - 24)
  }, [view, count, plotW])

  const placedMarkers = useMemo(() => markers.flatMap((marker) => {
    const index = view.findIndex((c) => marker.time >= c.time && marker.time < c.time + CANDLE_SECONDS)
    return index === -1 ? [] : [{ ...marker, index }]
  }), [markers, view])

  const onPointer = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const px = event.clientX - rect.left
    if (px < 0 || px > plotW) return setHover(null)
    setHover(Math.min(count - 1, Math.max(0, Math.floor(px / step))))
  }

  const last = view[view.length - 1]
  const shown = hover !== null ? view[hover] : last

  if (!last) return <div className="chart-empty">No market data yet.</div>

  return (
    <div className="chart" ref={ref}>
      <div className="chart-readout" aria-live="off">
        <span className="readout-time">{formatClock(shown.time)}</span>
        <span>O <b>{formatPrice(shown.open, decimals)}</b></span>
        <span>H <b>{formatPrice(shown.high, decimals)}</b></span>
        <span>L <b>{formatPrice(shown.low, decimals)}</b></span>
        <span>C <b className={shown.close >= shown.open ? 'tone-up' : 'tone-down'}>{formatPrice(shown.close, decimals)}</b></span>
        {overlays.map((overlay) => {
          const value = overlay.values[offset + (hover ?? count - 1)]
          return value == null ? null : (
            <span key={overlay.label} style={{ color: overlay.color }}>{overlay.label} <b>{formatPrice(value, decimals)}</b></span>
          )
        })}
      </div>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={label}
        onPointerMove={onPointer}
        onPointerLeave={() => setHover(null)}
      >
        {gridPrices.map(({ price, labelled }) => (
          <g key={price}>
            <line x1={0} x2={plotW} y1={y(price)} y2={y(price)} className="chart-grid" />
            {labelled && <text x={plotW + 8} y={y(price) + 4} className="chart-axis">{formatPrice(price, decimals)}</text>}
          </g>
        ))}
        {timeLabels.map(({ i, time }) => (
          <text key={time} x={x(i)} y={height - 6} textAnchor="middle" className="chart-axis">{formatClock(time)}</text>
        ))}

        {view.map((c, i) => {
          const up = c.close >= c.open
          const top = y(Math.max(c.open, c.close))
          const bodyH = Math.max(1, Math.abs(y(c.open) - y(c.close)))
          return (
            <g key={c.time} className={up ? 'candle-up' : 'candle-down'}>
              <line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} className="candle-wick" />
              <rect x={x(i) - bodyW / 2} y={top} width={bodyW} height={bodyH} rx={1} className="candle-body" />
            </g>
          )
        })}

        {overlays.map((overlay) => {
          const points = overlay.values.slice(offset)
          let d = ''
          points.forEach((value, i) => {
            if (value == null) return
            d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(value).toFixed(1)}`
          })
          return d ? <path key={overlay.label} d={d} fill="none" stroke={overlay.color} strokeWidth={1.5} /> : null
        })}

        {levels.map((level) => (
          <g key={`${level.label}-${level.price}`} className={`level level-${level.tone}`}>
            <line x1={0} x2={plotW} y1={y(level.price)} y2={y(level.price)} />
            <rect x={plotW + 2} y={y(level.price) - 9} width={AXIS_WIDTH - 4} height={18} rx={3} />
            <text x={plotW + 8} y={y(level.price) + 4}>{level.label}</text>
          </g>
        ))}

        {placedMarkers.map((marker) => {
          const cx = x(marker.index)
          const candle = view[marker.index]
          const isBuy = marker.side === 'buy'
          const cy = isBuy ? y(candle.low) + 10 : y(candle.high) - 10
          const d = isBuy
            ? `M${cx},${cy - 5} L${cx - 5},${cy + 4} L${cx + 5},${cy + 4} Z`
            : `M${cx},${cy + 5} L${cx - 5},${cy - 4} L${cx + 5},${cy - 4} Z`
          return <path key={marker.id} d={d} className={isBuy ? 'marker-buy' : 'marker-sell'}><title>{`${marker.side.toUpperCase()} @ ${formatPrice(marker.price, decimals)}`}</title></path>
        })}

        <g className="last-price">
          <line x1={0} x2={plotW} y1={y(last.close)} y2={y(last.close)} />
          <rect x={plotW + 2} y={y(last.close) - 9} width={AXIS_WIDTH - 4} height={18} rx={3} />
          <text x={plotW + 8} y={y(last.close) + 4}>{formatPrice(last.close, decimals)}</text>
        </g>

        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD_TOP} y2={PAD_TOP + plotH} className="crosshair" />
        )}
      </svg>
    </div>
  )
}

/** Compact line chart for equity curves. */
export function LineChart({ values, height = 120, label }: { values: readonly number[]; height?: number; label: string }) {
  const [ref, width] = useElementWidth<HTMLDivElement>(300)
  if (values.length < 2) {
    return <div ref={ref} className="chart-empty" style={{ height }}>The equity curve appears after the first completed candle.</div>
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const x = (i: number) => (i / (values.length - 1)) * width
  const y = (v: number) => 6 + ((max - v) / span) * (height - 12)
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const rising = values[values.length - 1] >= values[0]
  return (
    <div ref={ref} className="line-chart">
      <svg width={width} height={height} role="img" aria-label={label}>
        <path d={`${line}L${width},${height}L0,${height}Z`} className={rising ? 'area-up' : 'area-down'} />
        <path d={line} fill="none" className={rising ? 'stroke-up' : 'stroke-down'} strokeWidth={1.6} />
      </svg>
    </div>
  )
}
