import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserProvider, formatEther } from 'ethers'
import { chainById, toHexChainId } from './chains'

/** Minimal EIP-1193 provider shape (MetaMask and compatible wallets). */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>
  on?(event: string, listener: (...args: unknown[]) => void): void
  removeListener?(event: string, listener: (...args: unknown[]) => void): void
  isMetaMask?: boolean
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider
  }
}

export type WalletState =
  | { status: 'unavailable' }
  | { status: 'disconnected'; error?: string }
  | { status: 'connecting' }
  | {
      status: 'connected'
      address: string
      chainId: number
      balance: string
      refreshing: boolean
      error?: string
    }

function errorCode(error: unknown): number | string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const e = error as { code?: number | string; info?: { error?: { code?: number } } }
  return e.info?.error?.code ?? e.code
}

export function describeWalletError(error: unknown): string {
  switch (errorCode(error)) {
    case 4001:
    case 'ACTION_REJECTED':
      return 'You rejected the request in your wallet.'
    case -32002:
      return 'A wallet request is already pending. Open MetaMask to finish it.'
    case 4100:
      return 'The wallet has not authorized this site. Connect again.'
    case 4902:
      return 'That network is not added to your wallet.'
    default:
      return 'The wallet request failed. Check MetaMask and try again.'
  }
}

/**
 * Read-only wallet integration through ethers.js v6. It requests account access, reads the network
 * and native balance, and can ask the wallet to switch networks. It never asks for signatures,
 * transactions, private keys or seed phrases.
 */
export function useWallet() {
  const provider = typeof window !== 'undefined' ? window.ethereum : undefined
  const [state, setState] = useState<WalletState>(provider ? { status: 'disconnected' } : { status: 'unavailable' })
  const requestId = useRef(0)

  const load = useCallback(async (address: string) => {
    if (!provider) return
    const id = ++requestId.current
    const browserProvider = new BrowserProvider(provider, 'any')
    const [network, balance] = await Promise.all([browserProvider.getNetwork(), browserProvider.getBalance(address)])
    if (id !== requestId.current) return
    setState({
      status: 'connected',
      address,
      chainId: Number(network.chainId),
      balance: formatEther(balance),
      refreshing: false,
    })
  }, [provider])

  const handleAccounts = useCallback((accounts: unknown) => {
    const list = Array.isArray(accounts) ? (accounts as string[]) : []
    if (list.length === 0) {
      requestId.current++
      setState({ status: 'disconnected' })
      return
    }
    load(list[0]).catch((error) => setState({ status: 'disconnected', error: describeWalletError(error) }))
  }, [load])

  // Restore an existing authorization silently, and follow account and network changes.
  useEffect(() => {
    if (!provider) return undefined
    provider.request({ method: 'eth_accounts' }).then(handleAccounts).catch(() => {})
    const onChainChanged = () => {
      provider.request({ method: 'eth_accounts' }).then(handleAccounts).catch(() => {})
    }
    provider.on?.('accountsChanged', handleAccounts)
    provider.on?.('chainChanged', onChainChanged)
    return () => {
      provider.removeListener?.('accountsChanged', handleAccounts)
      provider.removeListener?.('chainChanged', onChainChanged)
    }
  }, [provider, handleAccounts])

  const connect = useCallback(async () => {
    if (!provider) return
    setState({ status: 'connecting' })
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' })
      handleAccounts(accounts)
    } catch (error) {
      setState({ status: 'disconnected', error: describeWalletError(error) })
    }
  }, [provider, handleAccounts])

  /** Revokes this site's permission where the wallet supports it, and always clears local state. */
  const disconnect = useCallback(async () => {
    requestId.current++
    setState({ status: 'disconnected' })
    try {
      await provider?.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] })
    } catch {
      // Older wallets don't support revoking; clearing local state is enough for a read-only app.
    }
  }, [provider])

  const refresh = useCallback(async () => {
    if (state.status !== 'connected') return
    setState({ ...state, refreshing: true, error: undefined })
    try {
      await load(state.address)
    } catch (error) {
      setState({ ...state, refreshing: false, error: describeWalletError(error) })
    }
  }, [state, load])

  const switchNetwork = useCallback(async (chainId: number) => {
    if (!provider || state.status !== 'connected') return
    const chain = chainById(chainId)
    if (!chain) return
    setState({ ...state, error: undefined })
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: toHexChainId(chainId) }] })
    } catch (error) {
      if (errorCode(error) !== 4902) {
        setState({ ...state, error: describeWalletError(error) })
        return
      }
      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: toHexChainId(chain.id),
            chainName: chain.name,
            nativeCurrency: { name: chain.currency, symbol: chain.currency, decimals: 18 },
            rpcUrls: [chain.rpcUrl],
            blockExplorerUrls: [chain.explorerUrl],
          }],
        })
      } catch (addError) {
        setState({ ...state, error: describeWalletError(addError) })
      }
    }
  }, [provider, state])

  return { state, connect, disconnect, refresh, switchNetwork }
}
