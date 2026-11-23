import type { ReactNode } from 'react'

export function Panel({ title, actions, children, className = '', id }: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <section className={`panel ${className}`} aria-labelledby={title && id ? `${id}-title` : undefined}>
      {(title || actions) && (
        <header className="panel-head">
          {title && <h2 id={id ? `${id}-title` : undefined}>{title}</h2>}
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: 'up' | 'down' | 'muted'; hint?: string }) {
  return (
    <div className="stat" title={hint}>
      <dt>{label}</dt>
      <dd className={tone ? `tone-${tone}` : undefined}>{value}</dd>
    </div>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'up' | 'down' | 'warn' | 'info'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <p className="empty-body">{children}</p>}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label, disabled }: {
  value: T
  options: { value: T; label: string; tone?: 'up' | 'down' }[]
  onChange: (value: T) => void
  label: string
  disabled?: boolean
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          className={`segment ${value === option.value ? `is-active ${option.tone ? `segment-${option.tone}` : ''}` : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function NumberField({ label, value, onChange, step = 'any', suffix, disabled, min = 0, id, hint }: {
  label: string
  value: string
  onChange: (value: string) => void
  step?: number | 'any'
  suffix?: string
  disabled?: boolean
  min?: number
  id: string
  hint?: string
}) {
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="field-control">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix && <span className="field-suffix">{suffix}</span>}
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function toneOf(value: number): 'up' | 'down' | undefined {
  if (value > 0.004) return 'up'
  if (value < -0.004) return 'down'
  return undefined
}
