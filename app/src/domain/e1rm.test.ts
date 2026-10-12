import { describe, expect, it } from 'vitest'
import { epley, estimate1RM, roundToIncrement } from './e1rm'

describe('estimate1RM', () => {
  it('1 rep à RPE 10 = la charge', () => {
    expect(estimate1RM(100, 1, 10)).toBeCloseTo(100)
  })

  it('utilise la table RPE : 5 reps @ RPE 8 ≈ 7 reps à l’échec', () => {
    expect(estimate1RM(100, 5, 8)).toBeCloseTo(100 / 0.811, 1)
  })

  it('interpole les demi-points de RPE', () => {
    const e = estimate1RM(100, 3, 8.5)!
    expect(e).toBeGreaterThan(estimate1RM(100, 3, 9)!)
    expect(e).toBeLessThan(estimate1RM(100, 3, 8)!)
  })

  it('retombe sur Epley sans RPE ou avec un RPE peu fiable', () => {
    expect(estimate1RM(100, 5)).toBeCloseTo(epley(100, 5))
    expect(estimate1RM(100, 5, 5)).toBeCloseTo(epley(100, 5))
  })

  it('ignore les séries inexploitables', () => {
    expect(estimate1RM(100, 12, 9)).toBeUndefined()
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
