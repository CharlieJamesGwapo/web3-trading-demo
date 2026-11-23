# Interview walkthrough (5–7 minutes)

A script for presenting this demo. Share the live site and talk through it in this order.

## 1. Frame it (30 seconds)

> "This is a public demo I built to show the kinds of systems I've worked on for clients, whose code is private. It's a paper-trading terminal, an automated trading bot, wallet integration and lending math. The wallet data is real. Prices and trades are simulated on purpose, so nobody risks money and no exchange keys are involved."

## 2. Trading terminal (1.5 minutes)

1. Switch markets and point out the live candles and the moving averages.
2. Place a **market buy** using the 25% button, with a stop-loss and take-profit. Point out the entry, stop and target lines on the chart and the position row.
3. Place a **limit buy** below the market. Show that it appears under Open orders and that available cash went down, because the order reserves its cost.
4. Close the position and open **Trade history**: fee and realized P&L on every fill.

Points to make:
- "Cost basis includes the buy fee, so realized P&L is net of both fees, and equity always reconciles to starting cash plus realized plus unrealized P&L. That invariant is unit-tested."
- "Resting orders reserve funds so you can't double-spend."
- "Stops fill at the tick that crossed them, not at the exact trigger, so a gap shows up as slippage like it would on a real venue."

## 3. Strategy bot (2 minutes)

1. Set the speed to 16× and start the bot.
2. Walk through the execution log: a signal, then an order, then a fill, then an exit by take-profit, stop-loss or a bearish cross.
3. Pause it. "Pausing stops new signals, but the stop, the target and the kill switch keep protecting an open position."
4. Stop and flatten.

Points to make:
- "Signals run on **closed candles only**, which avoids look-ahead bias. Exits are checked every tick."
- "The kill switch flattens the position and halts the bot at a max drawdown. It can't restart without a reset."
- "The bot trades its own account, so its stats don't mix with manual trades."
- "These are simulated results from a simple strategy. I'd never present them as real performance."

## 4. Wallet (1 minute)

Connect MetaMask, switch networks and show the balance update.

- "It's ethers.js v6 over EIP-1193. It listens for account and chain changes, and if the wallet doesn't know a network it falls back to `wallet_addEthereumChain`. Disconnect revokes the permission."
- "It's read-only by design: no signatures, no transactions, and it never touches keys."

## 5. Lending (45 seconds)

Raise the loan amount until the status changes to At risk, then Liquidatable. Turn on "follow the simulated price" and watch the health factor move.

- "Health factor is collateral times the liquidation threshold, divided by debt. Below 1, the position can be liquidated. The page shows every formula."

## 6. Architecture (1 minute)

- "The `core/` folder is plain TypeScript with no React: market simulator, paper account, bot and lending math, with 34 unit tests."
- "One simulation clock drives everything, and React subscribes through `useSyncExternalStore`."
- "The chart is hand-built SVG, so the only runtime dependencies are React and ethers."

## Likely questions

**Why simulated prices instead of a live feed?**
It keeps the demo deterministic and free of API keys and rate limits. The market sits behind one class, so swapping in a WebSocket feed only changes that provider.

**How would you take this to production?**
- Move the engine to a server.
- Replace the paper account with an exchange adapter that has idempotent order IDs, reconciles against exchange fills, and uses rate limiting and retries.
- Store orders and fills in Postgres.
- Add monitoring and alerts on the kill switch.

**What's missing compared with a real venue?**
Order-book depth, partial fills, shorting and margin, funding, and liquidation penalties in the loan model. The README lists these limits.

**Did you write smart contracts here?**
No. This demo has no contracts, and it says so.
