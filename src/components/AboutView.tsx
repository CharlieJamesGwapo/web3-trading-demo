import { Panel } from './ui'

const REAL_VS_SIMULATED = [
  ['Wallet address, network, balance', 'Real', 'Read from your wallet through ethers.js. Read-only: no signatures or transactions.'],
  ['Network switching', 'Real', 'Asks the wallet to switch or add a network. Your wallet asks you to confirm.'],
  ['Market prices and candles', 'Simulated', 'Seeded random walk with trend regimes. Starting levels are illustrative, not quotes.'],
  ['Orders, fills, balances, P&L', 'Simulated', 'Paper account with $10,000 of play money. No exchange is contacted.'],
  ['Strategy bot', 'Simulated', 'Runs real rule logic against the simulated feed. Results are not trading performance.'],
  ['Loan calculator', 'Educational', 'Standard over-collateralized loan formulas with illustrative parameters.'],
]

export default function AboutView() {
  return (
    <div className="about-layout">
      <Panel title="About this demo" id="about">
        <p>
          A public demonstration project by Charlie James Abejo. It shows, in code anyone can read, the kinds of
          systems I have built for clients: a trading interface, an automated trading bot with risk controls, wallet
          integration, and lending math. That earlier client work lives in private repositories and isn't shown here.
        </p>
        <p className="muted">
          Nothing here uses real funds, places exchange orders, deploys smart contracts, or asks for private keys or
          seed phrases.
        </p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Feature</th><th>Data</th><th>Details</th></tr></thead>
            <tbody>
              {REAL_VS_SIMULATED.map(([feature, kind, detail]) => (
                <tr key={feature}>
                  <td>{feature}</td>
                  <td><span className={`badge badge-${kind === 'Real' ? 'up' : kind === 'Simulated' ? 'warn' : 'info'}`}>{kind}</span></td>
                  <td className="muted">{detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Architecture" id="architecture">
        <ul className="arch">
          <li><b>core/market</b> Seeded multi-asset price simulator that builds OHLC candles.</li>
          <li><b>core/paperAccount</b> Order matching (market and limit), fees, cost basis, realized and unrealized P&amp;L, stop-loss and take-profit.</li>
          <li><b>core/bot</b> Moving-average crossover bot with position sizing, protective exits and a drawdown kill switch, trading its own account.</li>
          <li><b>core/lending</b> LTV, health factor, liquidation price and interest projections.</li>
          <li><b>state/simulation</b> One clock drives the market, account and bot; React subscribes through useSyncExternalStore.</li>
          <li><b>wallet/useWallet</b> EIP-1193 + ethers.js v6 connection, account and network events, network switching.</li>
        </ul>
        <p className="muted small">
          The core modules are plain TypeScript with no React imports, covered by unit tests with Vitest.
        </p>
        <p>
          <a href="https://github.com/CharlieJamesGwapo/web3-trading-demo" target="_blank" rel="noreferrer">Source on GitHub</a>
          {' · '}
          <a href="https://portfoliobboy.vercel.app" target="_blank" rel="noreferrer">Portfolio</a>
        </p>
      </Panel>
    </div>
  )
}
