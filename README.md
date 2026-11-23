# Web3 Trading Demo

> **Illustrative demo, not a client deliverable.** All prices are simulated. Nothing is traded, and the wallet panel never requests a signature.

My earlier Web3 and crypto work, including trading bots, trading dashboards, dApp front ends, and a crypto lending platform, was done in private company and client repositories that I can't share. This repo shows the same concepts in code I can make public.

## What it shows

| Panel | Concepts |
|---|---|
| **Wallet** | Connecting MetaMask or any EIP-1193 wallet with ethers.js v6, reading the address, network, and native balance, and handling account and chain changes |
| **Paper-trading bot** | Moving-average crossover strategy, stop-loss, per-trade fees, position sizing, a live tick loop, equity curve, win rate, and max drawdown |
| **Collateralized loan** | Loan-to-value, max borrow, health factor, liquidation price, and position status |

The strategy and lending logic live in `src/lib/` as plain functions with unit tests, separate from the React UI.

## Run it

```bash
npm install
npm run dev
```

```bash
npm test
```

## Stack

React 18, Vite, ethers.js v6, Vitest.

## Author

Charlie James Abejo · [portfoliobboy.vercel.app](https://portfoliobboy.vercel.app)
