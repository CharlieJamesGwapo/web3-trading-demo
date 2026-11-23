import { useEffect, useRef, useState } from 'react'
import { formatQty, shortenAddress } from '../core/format'
import { chainById, CHAINS } from '../wallet/chains'
import { useWallet } from '../wallet/useWallet'

export default function WalletMenu() {
  const { state, connect, disconnect, refresh, switchNetwork } = useWallet()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const connected = state.status === 'connected' ? state : null
  const chain = connected ? chainById(connected.chainId) : undefined

  const label = connected
    ? shortenAddress(connected.address)
    : state.status === 'connecting' ? 'Connecting…' : 'Connect wallet'

  const copy = async () => {
    if (!connected) return
    try {
      await navigator.clipboard.writeText(connected.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="wallet" ref={root}>
      <button
        type="button"
        className={`button wallet-button ${connected ? 'is-connected' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`dot ${connected ? 'dot-on' : ''}`} aria-hidden="true" />
        {label}
      </button>

      {open && (
        <div className="wallet-pop" role="dialog" aria-label="Wallet">
          <p className="wallet-pop-title">Wallet <span className="badge badge-up">Real on-chain data</span></p>

          {state.status === 'unavailable' && (
            <>
              <p>No browser wallet detected.</p>
              <p className="muted small">
                Install <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">MetaMask</a> or another
                EIP-1193 wallet, then reload. The trading terminal works without a wallet.
              </p>
            </>
          )}

          {(state.status === 'disconnected' || state.status === 'connecting') && (
            <>
              <p className="muted small">
                Read-only connection: this site reads your address, network and balance. It never requests a
                signature, a transaction, a private key or a seed phrase.
              </p>
              <button type="button" className="button button-block" onClick={connect} disabled={state.status === 'connecting'}>
                {state.status === 'connecting' ? 'Waiting for your wallet…' : 'Connect MetaMask'}
              </button>
              {state.status === 'disconnected' && state.error && <p className="feedback feedback-error" role="alert">{state.error}</p>}
            </>
          )}

          {connected && (
            <>
              <dl className="wallet-facts">
                <div>
                  <dt>Address</dt>
                  <dd>
                    <code title={connected.address}>{shortenAddress(connected.address)}</code>
                    <button type="button" className="link-button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
                    {chain && (
                      <a className="link-button" href={`${chain.explorerUrl}/address/${connected.address}`} target="_blank" rel="noreferrer">Explorer</a>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Balance</dt>
                  <dd><b>{formatQty(Number(connected.balance))}</b> {chain?.currency ?? 'native token'}</dd>
                </div>
              </dl>
              <label className="field" htmlFor="wallet-network">
                <span className="field-label">Network</span>
                <select
                  id="wallet-network"
                  value={chain ? String(chain.id) : 'other'}
                  onChange={(e) => switchNetwork(Number(e.target.value))}
                >
                  {!chain && <option value="other">Chain {connected.chainId} (unsupported)</option>}
                  {CHAINS.map((c) => <option key={c.id} value={c.id}>{c.name}{c.testnet ? ' (testnet)' : ''}</option>)}
                </select>
              </label>
              {connected.error && <p className="feedback feedback-error" role="alert">{connected.error}</p>}
              <div className="button-row">
                <button type="button" className="button button-ghost button-small" onClick={refresh} disabled={connected.refreshing}>
                  {connected.refreshing ? 'Refreshing…' : 'Refresh balance'}
                </button>
                <button type="button" className="button button-ghost button-small" onClick={() => { disconnect(); setOpen(false) }}>Disconnect</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
