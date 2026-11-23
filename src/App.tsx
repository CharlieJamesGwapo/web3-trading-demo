import { useEffect, useState } from 'react'
import { formatClock } from './core/format'
import { SimulationContext, SPEEDS, useCreateSimulation, useSimulation, type Speed } from './state/simulation'
import AboutView from './components/AboutView'
import BotView from './components/BotView'
import LendingView from './components/LendingView'
import TerminalView from './components/TerminalView'
import WalletMenu from './components/WalletMenu'

type View = 'terminal' | 'bot' | 'lending' | 'about'

const VIEWS: { id: View; label: string }[] = [
  { id: 'terminal', label: 'Terminal' },
  { id: 'bot', label: 'Strategy bot' },
  { id: 'lending', label: 'Lending' },
  { id: 'about', label: 'About' },
]

function readView(): View {
  const hash = window.location.hash.replace('#', '')
  return VIEWS.some((v) => v.id === hash) ? (hash as View) : 'terminal'
}

function ClockControls() {
  const sim = useSimulation()
  return (
    <div className="clock" role="group" aria-label="Simulation clock">
      <span className="clock-time" title="Simulated market time (UTC)">
        <span className={`dot ${sim.running ? 'dot-live' : ''}`} aria-hidden="true" />
        {formatClock(sim.market.time)}
      </span>
      <button type="button" className="button button-ghost button-small" onClick={() => sim.setRunning(!sim.running)}>
        {sim.running ? 'Pause market' : 'Resume market'}
      </button>
      <label className="sr-only" htmlFor="speed">Simulation speed</label>
      <select id="speed" className="speed" value={sim.speed} onChange={(e) => sim.setSpeed(Number(e.target.value) as Speed)}>
        {SPEEDS.map((s) => <option key={s} value={s}>{s}× speed</option>)}
      </select>
    </div>
  )
}

export default function App() {
  const simulation = useCreateSimulation()
  const [view, setView] = useState<View>(readView)

  useEffect(() => {
    const onHash = () => setView(readView())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (next: View) => {
    window.history.replaceState(null, '', `#${next}`)
    setView(next)
  }

  return (
    <SimulationContext.Provider value={simulation}>
      <div className="app">
        <p className="demo-banner" role="note">
          Public Demonstration Project — Simulated Trading Data — No Real Funds or Exchange Orders
        </p>
        <header className="topbar">
          <a className="brand" href="#terminal" onClick={(e) => { e.preventDefault(); go('terminal') }}>
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
              <rect x="3" y="6" width="4" height="10" rx="1" className="brand-up" />
              <line x1="5" y1="2" x2="5" y2="20" className="brand-up-line" />
              <rect x="15" y="4" width="4" height="8" rx="1" className="brand-down" />
              <line x1="17" y1="1" x2="17" y2="16" className="brand-down-line" />
              <rect x="9" y="9" width="4" height="7" rx="1" className="brand-up" />
            </svg>
            <span>Web3 Trading Demo</span>
          </a>
          <nav className="tabs" aria-label="Sections">
            {VIEWS.map((v) => (
              <a
                key={v.id}
                href={`#${v.id}`}
                className={`tab ${view === v.id ? 'is-active' : ''}`}
                aria-current={view === v.id ? 'page' : undefined}
                onClick={(e) => { e.preventDefault(); go(v.id) }}
              >
                {v.label}
              </a>
            ))}
          </nav>
          <div className="topbar-right">
            <ClockControls />
            <WalletMenu />
          </div>
        </header>
        <main className="content">
          {view === 'terminal' && <TerminalView />}
          {view === 'bot' && <BotView />}
          {view === 'lending' && <LendingView />}
          {view === 'about' && <AboutView />}
        </main>
        <footer className="footer">
          Built by Charlie James Abejo as a public demonstration. Simulated market data; no real funds, exchange orders or smart contracts.
        </footer>
      </div>
    </SimulationContext.Provider>
  )
}
