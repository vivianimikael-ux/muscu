import { describe, expect, it } from 'vitest'
import { COUNTDOWN_SEC, timerCue, timerState, wodDuration } from './wodTimer'
import type { WodFormat } from './types'

const T0 = 1_000_000
/** Instant correspondant à `sec` secondes après le "Go". */
const at = (sec: number) => T0 + (COUNTDOWN_SEC + sec) * 1000

describe('timerState', () => {
  it('compte à rebours avant le départ', () => {
    const s = timerState({ type: 'amrap', durationSec: 600 }, T0, T0 + 2500)
    expect(s.phase).toBe('countdown')
    expect(s.remaining).toBe(8)
  })

  it('AMRAP : chrono descendant puis fini', () => {
    const f: WodFormat = { type: 'amrap', durationSec: 600 }
    expect(timerState(f, T0, at(60)).display).toBeCloseTo(540)
    expect(timerState(f, T0, at(600)).phase).toBe('finished')
  })

  it('For Time : chrono montant, cap respecté, arrêt manuel', () => {
    const f: WodFormat = { type: 'for_time', rounds: 5, capSec: 900 }
    expect(timerState(f, T0, at(125)).display).toBeCloseTo(125)
    expect(timerState(f, T0, at(1000)).phase).toBe('finished')
    const stopped = timerState(f, T0, at(2000), at(431))
    expect(stopped.phase).toBe('finished')
    expect(stopped.display).toBeCloseTo(431)
  })

  it('EMOM : intervalle courant et temps restant dans l’intervalle', () => {
    const f: WodFormat = { type: 'emom', intervalSec: 60, intervals: 10, alternate: false }
    const s = timerState(f, T0, at(135))
    expect(s.round).toBe(3)
    expect(s.display).toBeCloseTo(45)
    expect(timerState(f, T0, at(600)).phase).toBe('finished')
  })

  it('Tabata : alternance travail / repos, pas de repos final', () => {
    const f: WodFormat = { type: 'intervals', workSec: 20, restSec: 10, cycles: 8 }
    expect(wodDuration(f)).toBe(230)
    expect(timerState(f, T0, at(5)).phase).toBe('work')
    expect(timerState(f, T0, at(25)).phase).toBe('rest')
    const s = timerState(f, T0, at(31))
    expect(s.phase).toBe('work')
    expect(s.round).toBe(2)
    expect(timerState(f, T0, at(230)).phase).toBe('finished')
  })
})

describe('timerCue', () => {
  const f: WodFormat = { type: 'intervals', workSec: 20, restSec: 10, cycles: 2 }
  const cueBetween = (a: number, b: number) => timerCue(timerState(f, T0, at(a)), timerState(f, T0, at(b)))

  it('bips de décompte sur les 3 dernières secondes', () => {
    expect(cueBetween(-3.5, -2.5)).toBe('tick')
    expect(cueBetween(16.5, 17.5)).toBe('tick')
    expect(cueBetween(5, 6)).toBeNull()
  })

  it('signal aux changements de phase', () => {
    expect(cueBetween(-0.5, 0.1)).toBe('go')
    expect(cueBetween(19.9, 20.1)).toBe('rest')
    expect(cueBetween(29.9, 30.1)).toBe('go')
    expect(cueBetween(49.9, 50.1)).toBe('end')
  })
})
