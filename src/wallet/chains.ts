export interface ChainInfo {
  id: number
  name: string
  currency: string
  rpcUrl: string
  explorerUrl: string
  testnet?: boolean
}

export const CHAINS: ChainInfo[] = [
  { id: 1, name: 'Ethereum', currency: 'ETH', rpcUrl: 'https://ethereum-rpc.publicnode.com', explorerUrl: 'https://etherscan.io' },
  { id: 11155111, name: 'Sepolia', currency: 'ETH', rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com', explorerUrl: 'https://sepolia.etherscan.io', testnet: true },
  { id: 137, name: 'Polygon', currency: 'POL', rpcUrl: 'https://polygon-rpc.com', explorerUrl: 'https://polygonscan.com' },
  { id: 8453, name: 'Base', currency: 'ETH', rpcUrl: 'https://mainnet.base.org', explorerUrl: 'https://basescan.org' },
  { id: 42161, name: 'Arbitrum One', currency: 'ETH', rpcUrl: 'https://arb1.arbitrum.io/rpc', explorerUrl: 'https://arbiscan.io' },
]

export function chainById(id: number): ChainInfo | undefined {
  return CHAINS.find((chain) => chain.id === id)
}

export function toHexChainId(id: number): string {
  return `0x${id.toString(16)}`
}
