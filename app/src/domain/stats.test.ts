import { describe, expect, it } from 'vitest'
import { estimate1RM } from './e1rm'
import { computeRecords, exerciseHistory, muscleVolume, setPR, wodItemTotals } from './stats'
import type { BodyweightEntry, Exercise, Session, SetLog, WodBlockLog } from './types'

const squat: Exercise = {
  id: 'squat',
  updatedAt: 0,
  name: 'Squat',
  measure: 'barbell',
  primaryMuscles: ['quadriceps'],
  secondaryMuscles: ['fessiers'],
  maxReference: 'estimated',
  trainingMaxPct: 90,
}
const traction: Exercise = { ...squat, id: 'traction', name: 'Traction', measure: 'bodyweight', primaryMuscles: ['dos'], secondaryMuscles: ['biceps'] }
const fente: Exercise = { ...squat, id: 'fente', name: 'Fente', measure: 'unilateral' }
const burpee: Exercise = { ...squat, id: 'burpee', name: 'Burpee', measure: 'reps', primaryMuscles: ['cardio'], secondaryMuscles: [] }

let n = 0
const set = (load: number | undefined, reps: number, rpe?: number, done = true): SetLog => ({ id: `s${n++}`, load, reps, rpe, done })

function session(id: string, day: number, exerciseId: string, sets: SetLog[], extra: Partial<Session> = {}): Session {
  return {
    id,
    updatedAt: 0,
    name: id,
    status: 'done',
    completedAt: Date.UTC(2026, 0, day, 12),
    source: 'app',
    blocks: [{ id: 'b', kind: 'classic', exercises: [{ id: 'e', exerciseId, restSec: 120, sets }] }],
    ...extra,
  }
}

const bw: BodyweightEntry[] = [
  { id: 'w1', updatedAt: 0, date: '2026-01-01', kg: 80 },
  { id: 'w2', updatedAt: 0, date: '2026-01-15', kg: 82 },
]

describe('exerciseHistory', () => {
  it('ne garde que les séries faites des séances terminées, plus récente d’abord', () => {
    const sessions = [
      session('a', 2, 'squat', [set(100, 5), set(110, 3, undefined, false)]),
      session('b', 5, 'squat', [set(105, 5)]),
      session('c', 6, 'squat', [set(200, 1)], { status: 'in_progress' }),
    ]
    const h = exerciseHistory(squat, sessions, [])
    expect(h.map((p) => p.sessionId)).toEqual(['b', 'a'])
    expect(h[1].sets).toHaveLength(1)
    expect(h[1].tonnage).toBe(500)
  })

  it('séries sans reps (isométrie) : hors charge principale, 1RM et tonnage', () => {
    const h = exerciseHistory(squat, [session('a', 2, 'squat', [set(150, undefined as unknown as number), set(100, 5)])], [])
    expect(h[0].topLoad).toBe(100)
    expect(h[0].tonnage).toBe(500)
    expect(h[0].bestE1rm).toBeCloseTo(estimate1RM(100, 5)!)
  })

  it('unilatéral : tonnage compté pour les deux côtés', () => {
    const h = exerciseHistory(fente, [session('a', 2, 'fente', [set(20, 10)])], [])
    expect(h[0].tonnage).toBe(400)
  })

  it('poids du corps : 1RM estimé sur poids de corps du jour + lest, exprimé en lest', () => {
    const h = exerciseHistory(traction, [session('a', 20, 'traction', [set(10, 5, 10)])], bw)
    expect(h[0].bestE1rm).toBeCloseTo(estimate1RM(92, 5, 10)! - 82)
  })
})

describe('records', () => {
  const sessions = [session('a', 2, 'squat', [set(100, 8)]), session('b', 9, 'squat', [set(120, 3)])]
  const rec = computeRecords(squat, exerciseHistory(squat, sessions, []), [])

  it('meilleure charge pour au moins n reps', () => {
    expect(rec.repMax.get(1)?.value).toBe(120)
    expect(rec.repMax.get(3)?.value).toBe(120)
    expect(rec.repMax.get(4)?.value).toBe(100)
    expect(rec.repMax.get(8)?.value).toBe(100)
    expect(rec.repMax.get(9)).toBeUndefined()
  })

  it('détecte une série record', () => {
    expect(setPR(squat, set(105, 6), rec, undefined).repMax).toBe(true)
    expect(setPR(squat, set(100, 6), rec, undefined).repMax).toBe(false)
    expect(setPR(squat, set(100, 9), rec, undefined).repMax).toBe(true)
    expect(setPR(squat, set(150, 1, 10), rec, undefined).e1rm).toBe(true)
  })

  it('pas de record sans historique', () => {
    expect(setPR(squat, set(150, 1, 10), { repMax: new Map() }, undefined)).toEqual({ e1rm: false, repMax: false, qty: false })
  })

  it('les WOD ne comptent pas pour les records', () => {
    const wodSession: Session = {
      ...session('w', 10, 'squat', []),
      blocks: [wodBlock({ type: 'amrap', durationSec: 600 }, { type: 'rounds', rounds: 5, reps: 0 }, [{ ex: 'squat', qty: 10, load: 200 }])],
    }
    const r = computeRecords(squat, exerciseHistory(squat, [...sessions, wodSession], []), [])
    expect(r.repMax.get(1)?.value).toBe(120)
  })
})

function wodBlock(format: WodBlockLog['format'], score: WodBlockLog['score'], items: { ex: string; qty: number; load?: number }[]): WodBlockLog {
  return {
    id: 'wod',
    kind: 'wod',
    format,
    score,
    done: true,
    items: items.map((it, i) => ({ id: `i${i}`, exerciseId: it.ex, quantity: it.qty, load: it.load })),
  }
}

describe('wodItemTotals', () => {
  it('AMRAP : tours complets + reps partielles attribuées dans l’ordre', () => {
    const b = wodBlock({ type: 'amrap', durationSec: 720 }, { type: 'rounds', rounds: 4, reps: 13 }, [
      { ex: 'squat', qty: 10 },
      { ex: 'burpee', qty: 5 },
    ])
    const t = wodItemTotals(b)
    expect(t[0]).toMatchObject({ sets: 5, quantity: 50 })
    expect(t[1]).toMatchObject({ sets: 5, quantity: 23 })
  })

  it('For Time terminé : tous les tours', () => {
    const b = wodBlock({ type: 'for_time', rounds: 3 }, { type: 'time', sec: 400 }, [{ ex: 'burpee', qty: 15 }])
    expect(wodItemTotals(b)[0]).toMatchObject({ sets: 3, quantity: 45 })
  })

  it('EMOM alterné : intervalles répartis en rotation', () => {
    const b = wodBlock({ type: 'emom', intervalSec: 60, intervals: 10, alternate: true }, { type: 'intervals', held: 9, total: 10 }, [
      { ex: 'squat', qty: 10 },
      { ex: 'burpee', qty: 12 },
    ])
    const t = wodItemTotals(b)
    expect(t[0]).toMatchObject({ sets: 5, quantity: 50 })
    expect(t[1]).toMatchObject({ sets: 4, quantity: 48 })
  })

  it('Intervalles : reps par intervalle attribuées en rotation', () => {
    const b = wodBlock({ type: 'intervals', workSec: 20, restSec: 10, cycles: 4 }, { type: 'reps', perInterval: [12, 10, 11, 9] }, [
      { ex: 'squat', qty: 0 },
      { ex: 'burpee', qty: 0 },
    ])
    const t = wodItemTotals(b)
    expect(t[0]).toMatchObject({ sets: 2, quantity: 23 })
    expect(t[1]).toMatchObject({ sets: 2, quantity: 19 })
  })
})

describe('muscleVolume', () => {
  it('compte classique + WOD, secondaire à 0,5', () => {
    const exercises = new Map([squat, burpee].map((e) => [e.id, e]))
    const s = session('a', 2, 'squat', [set(100, 5), set(100, 5)])
    s.blocks.push(wodBlock({ type: 'for_time', rounds: 3 }, { type: 'time', sec: 300 }, [{ ex: 'squat', qty: 10, load: 40 }]))
    const v = muscleVolume([s], exercises, [])
    expect(v.get('quadriceps')).toEqual({ sets: 5, tonnage: 1000 + 1200 })
    expect(v.get('fessiers')).toEqual({ sets: 2.5, tonnage: 1100 })
  })
})
