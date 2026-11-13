import { describe, expect, it } from 'vitest'
import { epley, estimate1RM, roundToIncrement } from './e1rm'

describe('estimate1RM', () => {
  it('1 rep = la charge', () => {
    expect(estimate1RM(100, 1)).toBeCloseTo(100)
  })

  it('formule d’Epley', () => {
    expect(estimate1RM(100, 5)).toBeCloseTo(epley(100, 5))
    expect(estimate1RM(100, 6)).toBeCloseTo(120)
  })

  it('ignore les séries inexploitables', () => {
    expect(estimate1RM(100, 12)).toBeUndefined()
    expect(estimate1RM(0, 5)).toBeUndefined()
    expect(estimate1RM(undefined, 5)).toBeUndefined()
    expect(estimate1RM(100, 0)).toBeUndefined()
  })
})

describe('roundToIncrement', () => {
  it('arrondit au pas', () => {
    expect(roundToIncrement(83.7, 2.5)).toBe(82.5)
    expect(roundToIncrement(84, 2.5)).toBe(85)
    expect(roundToIncrement(23.1, 2)).toBe(24)
  })
})
