import { describe, expect, it } from 'vitest'
import { formatDateDMY, formatSessionDuration } from './dates'

describe('formatSessionDuration', () => {
  it('minutes sous l’heure, heures et minutes au-delà', () => {
    expect(formatSessionDuration(45 * 60_000)).toBe('45 min')
    expect(formatSessionDuration(65 * 60_000)).toBe('1 h 05')
    expect(formatSessionDuration(133 * 60_000 + 20_000)).toBe('2 h 13')
  })
})

describe('formatDateDMY', () => {
  it('jj-mm-aaaa', () => {
    expect(formatDateDMY(new Date(2026, 9, 12, 18).getTime())).toBe('12-10-2026')
  })
})
