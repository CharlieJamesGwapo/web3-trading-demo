// Simulated market data. Deterministic for a given seed so tests and demos are repeatable.

export function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Box-Muller transform: turns two uniform samples into one standard normal sample.
function gaussian(rand) {
  const u = Math.max(rand(), 1e-12)
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Geometric random walk with a slow regime drift, so the series has trends a strategy can follow.
export function createPriceFeed({ seed = 42, start = 100, volatility = 0.012 } = {}) {
  const rand = mulberry32(seed)
  let price = start
  let drift = 0
  return function nextPrice() {
    if (rand() < 0.03) drift = (rand() - 0.5) * 0.004
    price = price * Math.exp(drift + volatility * gaussian(rand))
    return Math.round(price * 100) / 100
  }
}

export function generatePrices(count, options) {
  const next = createPriceFeed(options)
  return Array.from({ length: count }, next)
}
