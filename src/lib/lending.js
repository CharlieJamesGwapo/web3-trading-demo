// Over-collateralized loan math, the core of most crypto-backed lending products.

export function loanPosition({ collateralAmount, collateralPrice, debt, maxLtvPct, liquidationThresholdPct }) {
  const inputs = { collateralAmount, collateralPrice, debt, maxLtvPct, liquidationThresholdPct }
  for (const [key, value] of Object.entries(inputs)) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${key} must be a non-negative number.`)
  }
  if (maxLtvPct >= liquidationThresholdPct) throw new Error('Max LTV must be below the liquidation threshold.')

  const collateralValue = collateralAmount * collateralPrice
  const ltvPct = collateralValue > 0 ? (debt / collateralValue) * 100 : debt > 0 ? Infinity : 0
  const maxBorrow = collateralValue * (maxLtvPct / 100)
  const healthFactor = debt > 0 ? (collateralValue * (liquidationThresholdPct / 100)) / debt : Infinity
  const liquidationPrice = collateralAmount > 0 && debt > 0
    ? debt / (collateralAmount * (liquidationThresholdPct / 100))
    : null

  let status = 'Healthy'
  if (healthFactor < 1) status = 'Liquidatable'
  else if (healthFactor < 1.2) status = 'At risk'
  else if (debt > maxBorrow) status = 'Over max LTV'

  return {
    collateralValue,
    ltvPct,
    maxBorrow,
    availableToBorrow: Math.max(0, maxBorrow - debt),
    healthFactor,
    liquidationPrice,
    status,
  }
}
