/**
 * Educational model of an over-collateralized crypto loan. Risk parameters are illustrative
 * defaults in the range many lending protocols use; they are not any protocol's live settings.
 */

export interface CollateralParams {
  maxLtvPct: number
  liquidationThresholdPct: number
}

export const COLLATERAL_PARAMS: Record<string, CollateralParams> = {
  BTC: { maxLtvPct: 70, liquidationThresholdPct: 78 },
  ETH: { maxLtvPct: 75, liquidationThresholdPct: 82 },
  SOL: { maxLtvPct: 55, liquidationThresholdPct: 65 },
  LINK: { maxLtvPct: 50, liquidationThresholdPct: 62 },
}

export interface LoanInput {
  collateralAmount: number
  collateralPrice: number
  debt: number
  maxLtvPct: number
  liquidationThresholdPct: number
  /** Annual interest rate, simple interest. */
  aprPct: number
  termMonths: number
}

export type LoanStatus = 'Healthy' | 'Over max LTV' | 'At risk' | 'Liquidatable'

export interface LoanAnalysis {
  collateralValue: number
  ltvPct: number
  maxBorrow: number
  availableToBorrow: number
  healthFactor: number
  liquidationPrice: number | null
  /** How far the collateral price can fall before liquidation, today. */
  priceDropToLiquidationPct: number | null
  status: LoanStatus
  monthlyInterest: number
  totalInterest: number
  totalRepayment: number
  /** If interest accrues to the loan and the collateral price doesn't change. */
  ltvAtMaturityPct: number
  healthFactorAtMaturity: number
  liquidationPriceAtMaturity: number | null
}

export function validateLoan(input: LoanInput): string[] {
  const errors: string[] = []
  const nonNegative: [keyof LoanInput, string][] = [
    ['collateralAmount', 'Collateral amount'],
    ['collateralPrice', 'Collateral price'],
    ['debt', 'Loan amount'],
  ]
  for (const [key, label] of nonNegative) {
    if (!Number.isFinite(input[key]) || input[key] < 0) errors.push(`${label} must be zero or more.`)
  }
  if (!(input.maxLtvPct > 0 && input.maxLtvPct < 100)) errors.push('Max LTV must be between 0% and 100%.')
  if (!(input.liquidationThresholdPct > 0 && input.liquidationThresholdPct <= 100)) {
    errors.push('Liquidation threshold must be between 0% and 100%.')
  }
  if (input.maxLtvPct >= input.liquidationThresholdPct) errors.push('Max LTV must be below the liquidation threshold.')
  if (!(input.aprPct >= 0 && input.aprPct <= 100)) errors.push('Interest rate must be between 0% and 100%.')
  if (!(Number.isInteger(input.termMonths) && input.termMonths >= 1 && input.termMonths <= 60)) {
    errors.push('Term must be a whole number of months from 1 to 60.')
  }
  return errors
}

function healthFactor(collateralValue: number, threshold: number, debt: number): number {
  return debt > 0 ? (collateralValue * threshold) / debt : Infinity
}

function liquidationPrice(collateralAmount: number, threshold: number, debt: number): number | null {
  return collateralAmount > 0 && debt > 0 ? debt / (collateralAmount * threshold) : null
}

export function analyzeLoan(input: LoanInput): LoanAnalysis {
  const errors = validateLoan(input)
  if (errors.length) throw new Error(errors.join(' '))

  const threshold = input.liquidationThresholdPct / 100
  const collateralValue = input.collateralAmount * input.collateralPrice
  const ltvPct = collateralValue > 0 ? (input.debt / collateralValue) * 100 : input.debt > 0 ? Infinity : 0
  const maxBorrow = collateralValue * (input.maxLtvPct / 100)
  const hf = healthFactor(collateralValue, threshold, input.debt)
  const liqPrice = liquidationPrice(input.collateralAmount, threshold, input.debt)

  let status: LoanStatus = 'Healthy'
  if (hf < 1) status = 'Liquidatable'
  else if (hf < 1.1) status = 'At risk'
  else if (input.debt > maxBorrow) status = 'Over max LTV'

  const monthlyInterest = (input.debt * input.aprPct) / 100 / 12
  const totalInterest = monthlyInterest * input.termMonths
  const debtAtMaturity = input.debt + totalInterest

  return {
    collateralValue,
    ltvPct,
    maxBorrow,
    availableToBorrow: Math.max(0, maxBorrow - input.debt),
    healthFactor: hf,
    liquidationPrice: liqPrice,
    priceDropToLiquidationPct: liqPrice !== null && input.collateralPrice > 0
      ? Math.max(0, (1 - liqPrice / input.collateralPrice) * 100)
      : null,
    status,
    monthlyInterest,
    totalInterest,
    totalRepayment: debtAtMaturity,
    ltvAtMaturityPct: collateralValue > 0 ? (debtAtMaturity / collateralValue) * 100 : 0,
    healthFactorAtMaturity: healthFactor(collateralValue, threshold, debtAtMaturity),
    liquidationPriceAtMaturity: liquidationPrice(input.collateralAmount, threshold, debtAtMaturity),
  }
}
