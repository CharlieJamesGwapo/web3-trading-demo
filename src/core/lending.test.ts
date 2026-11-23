import { describe, expect, it } from 'vitest'
import { analyzeLoan, validateLoan, type LoanInput } from './lending'

const base: LoanInput = {
  collateralAmount: 2,
  collateralPrice: 3000,
  debt: 3000,
  maxLtvPct: 70,
  liquidationThresholdPct: 80,
  aprPct: 6,
  termMonths: 12,
}

describe('analyzeLoan', () => {
  it('computes LTV, health factor and liquidation price', () => {
    const loan = analyzeLoan(base)
    expect(loan.collateralValue).toBe(6000)
    expect(loan.ltvPct).toBe(50)
    expect(loan.healthFactor).toBeCloseTo(1.6)
    expect(loan.liquidationPrice).toBeCloseTo(1875)
    expect(loan.priceDropToLiquidationPct).toBeCloseTo(37.5)
    expect(loan.availableToBorrow).toBe(1200)
    expect(loan.status).toBe('Healthy')
  })

  it('projects simple interest and its effect on risk', () => {
    const loan = analyzeLoan(base)
    expect(loan.monthlyInterest).toBeCloseTo(15)
    expect(loan.totalInterest).toBeCloseTo(180)
    expect(loan.totalRepayment).toBeCloseTo(3180)
    expect(loan.ltvAtMaturityPct).toBeCloseTo(53)
    expect(loan.healthFactorAtMaturity).toBeLessThan(loan.healthFactor)
    expect(loan.liquidationPriceAtMaturity!).toBeGreaterThan(loan.liquidationPrice!)
  })

  it('classifies risk levels', () => {
    expect(analyzeLoan({ ...base, debt: 4300 }).status).toBe('Over max LTV')
    expect(analyzeLoan({ ...base, debt: 4300 }).availableToBorrow).toBe(0)
    expect(analyzeLoan({ ...base, debt: 4500 }).status).toBe('At risk')
    expect(analyzeLoan({ ...base, debt: 5000 }).status).toBe('Liquidatable')
  })

  it('handles a loan with no debt', () => {
    const loan = analyzeLoan({ ...base, debt: 0 })
    expect(loan.healthFactor).toBe(Infinity)
    expect(loan.liquidationPrice).toBeNull()
    expect(loan.totalRepayment).toBe(0)
  })

  it('rejects invalid input with readable messages', () => {
    expect(validateLoan(base)).toEqual([])
    expect(validateLoan({ ...base, debt: -1 })).toContain('Loan amount must be zero or more.')
    expect(validateLoan({ ...base, maxLtvPct: 90 })).toContain('Max LTV must be below the liquidation threshold.')
    expect(validateLoan({ ...base, termMonths: 1.5 })).not.toEqual([])
    expect(() => analyzeLoan({ ...base, aprPct: 150 })).toThrow(/Interest rate/)
  })
})
