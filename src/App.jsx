import WalletPanel from './components/WalletPanel.jsx'
import BotPanel from './components/BotPanel.jsx'
import LoanPanel from './components/LoanPanel.jsx'

export default function App() {
  return (
    <div className="page">
      <header className="header">
        <p className="demo-badge" role="note">
          Demo · simulated data · not a client deliverable
        </p>
        <h1>Web3 Trading Demo</h1>
        <p className="lede">
          A representative implementation of three things crypto products need: connecting a wallet, running a
          trading bot with risk controls, and pricing a collateralized loan. Prices are simulated and nothing is
          traded or signed.
        </p>
      </header>

      <main className="grid">
        <WalletPanel />
        <BotPanel />
        <LoanPanel />
      </main>

      <footer className="footer">
        Built by Charlie James Abejo as an illustrative demo. Earlier production work in this area lives in private
        client repositories and isn't shown here.
      </footer>
    </div>
  )
}
