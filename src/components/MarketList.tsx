import { formatPct, formatPrice } from '../core/format'
import { useSimulation } from '../state/simulation'

export default function MarketList({ selected, onSelect }: { selected: string; onSelect: (symbol: string) => void }) {
  const sim = useSimulation()
  return (
    <nav className="markets" aria-label="Markets">
      <p className="markets-title">Markets <span className="muted">· simulated</span></p>
      <ul>
        {sim.market.assets.map((asset) => {
          const change = sim.market.changePct(asset.symbol)
          const active = asset.symbol === selected
          return (
            <li key={asset.symbol}>
              <button
                type="button"
                className={`market-row ${active ? 'is-active' : ''}`}
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect(asset.symbol)}
              >
                <span className="market-name">
                  <b>{asset.symbol}<span className="muted">/USD</span></b>
                  <small>{asset.name}</small>
                </span>
                <span className="market-price">
                  <b>{formatPrice(sim.market.price(asset.symbol), asset.decimals)}</b>
                  <small className={change >= 0 ? 'tone-up' : 'tone-down'}>{formatPct(change, 2, true)}</small>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
