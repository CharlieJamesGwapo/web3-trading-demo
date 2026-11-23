import { useCallback, useEffect, useState } from 'react'
import { BrowserProvider, formatEther } from 'ethers'

const NETWORK_NAMES = { 1: 'Ethereum Mainnet', 11155111: 'Sepolia testnet', 137: 'Polygon', 8453: 'Base', 56: 'BNB Chain' }

function shorten(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

// Read-only wallet connection over EIP-1193 (MetaMask and compatible wallets). It never requests a signature.
export default function WalletPanel() {
  const [account, setAccount] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const hasWallet = typeof window !== 'undefined' && Boolean(window.ethereum)

  const load = useCallback(async (address) => {
    const provider = new BrowserProvider(window.ethereum)
    const [network, balance] = await Promise.all([provider.getNetwork(), provider.getBalance(address)])
    const chainId = Number(network.chainId)
    setAccount({
      address,
      chainId,
      networkName: NETWORK_NAMES[chainId] ?? `Chain ${chainId}`,
      balance: Number(formatEther(balance)).toFixed(4),
    })
  }, [])

  const connect = async () => {
    setError('')
    setBusy(true)
    try {
      const provider = new BrowserProvider(window.ethereum)
      const [address] = await provider.send('eth_requestAccounts', [])
      await load(address)
    } catch (err) {
      setError(err?.code === 4001 || err?.code === 'ACTION_REJECTED' ? 'Connection request was rejected.' : 'Could not connect to the wallet.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!hasWallet) return undefined
    const onAccounts = (accounts) => (accounts.length ? load(accounts[0]).catch(() => {}) : setAccount(null))
    const onChain = () => window.ethereum.request({ method: 'eth_accounts' }).then(onAccounts).catch(() => {})
    window.ethereum.on?.('accountsChanged', onAccounts)
    window.ethereum.on?.('chainChanged', onChain)
    return () => {
      window.ethereum.removeListener?.('accountsChanged', onAccounts)
      window.ethereum.removeListener?.('chainChanged', onChain)
    }
  }, [hasWallet, load])

  return (
    <section className="card" aria-labelledby="wallet-title">
      <h2 id="wallet-title">Wallet</h2>
      <p className="muted">Connects through ethers.js to MetaMask or any EIP-1193 wallet. Read-only: no transactions or signatures.</p>
      {!hasWallet && <p className="notice">No browser wallet found. Install MetaMask to try this panel.</p>}
      {hasWallet && !account && (
        <button type="button" className="button" onClick={connect} disabled={busy}>
          {busy ? 'Waiting for wallet…' : 'Connect wallet'}
        </button>
      )}
      {account && (
        <dl className="facts">
          <div><dt>Address</dt><dd title={account.address}>{shorten(account.address)}</dd></div>
          <div><dt>Network</dt><dd>{account.networkName}</dd></div>
          <div><dt>Balance</dt><dd>{account.balance} (native token)</dd></div>
        </dl>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  )
}
