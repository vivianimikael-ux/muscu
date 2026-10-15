import { describe, expect, it } from 'vitest'
import { progressPlan, referenceMax, referenceMaxValue } from './progression'
import type { ExercisePerformance } from './stats'
import type { ClassicExercisePlan, Exercise, SetLog } from './types'

const squat: Exercise = {
  id: 'squat',
  updatedAt: 0,
  name: 'Squat',
  measure: 'barbell',
  primaryMuscles: ['quadriceps'],
  secondaryMuscles: [],
  maxReference: 'estimated',
  trainingMaxPct: 90,
}

const plan: ClassicExercisePlan = { id: 'p', exerciseId: 'squat', sets: 3, repsMin: 5, repsMax: 5, restSec: 180, targetRpe: 8 }

const perf = (sets: [number, number, number?][], daysAgo = 3, bestE1rm?: number): ExercisePerformance => {
  const s: SetLog[] = sets.map(([load, reps, rpe], i) => ({ id: `${i}`, load, reps, rpe, done: true }))
  return { sessionId: 'x', time: Date.now() - daysAgo * 86_400_000, sets: s, topLoad: Math.max(...sets.map((x) => x[0])), bestE1rm, tonnage: 0 }
}

const base = { exercise: squat, suggestRule: 'rpe' as const, history: [] as ExercisePerformance[] }

describe('mode % du 1RM', () => {
  it('charge = % du max de référence, arrondie à l’incrément, reps et séries de la semaine', () => {
    const r = progressPlan(plan, { ...base, mode: 'percent', percentRow: { pct: 75, reps: 6, sets: 4 }, refMax: 141 })
    expect(r.plan).toMatchObject({ targetLoad: 105, repsMin: 6, repsMax: 6, sets: 4 })
    expect(r.note).toContain('75 %')
  })

  it('poids du corps : la cible est un lest', () => {
    const traction = { ...squat, measure: 'bodyweight' as const }
    const r = progressPlan(plan, { ...base, exercise: traction, mode: 'percent', percentRow: { pct: 90 }, refMax: 100, bodyweight: 80 })
    expect(r.plan.targetLoad).toBe(10)
  })

  it('sans max connu : pas de charge imposée', () => {
    const r = progressPlan(plan, { ...base, mode: 'percent', percentRow: { pct: 75 } })
    expect(r.plan.targetLoad).toBeUndefined()
    expect(r.note).toContain('max inconnu')
  })
})

describe('mode suggestion RPE', () => {
  const run = (rpe: number) => progressPlan(plan, { ...base, mode: 'suggest', history: [perf([[100, 5, rpe], [100, 5, rpe]])] })
  it('RPE bas → +1 incrément', () => expect(run(7).plan.targetLoad).toBe(102.5))
  it('RPE haut → −1 incrément', () => expect(run(9).plan.targetLoad).toBe(97.5))
  it('RPE conforme → charge reconduite', () => expect(run(8.5).plan.targetLoad).toBe(100))
  it('sans historique → cible du modèle', () => {
    expect(progressPlan({ ...plan, targetLoad: 80 }, { ...base, mode: 'suggest' }).plan.targetLoad).toBe(80)
  })
})

describe('mode double progression', () => {
  const p = { ...plan, repsMin: 8, repsMax: 12 }
  const run = (history: ExercisePerformance[]) => progressPlan(p, { ...base, mode: 'suggest', suggestRule: 'double', history })
  it('haut de fourchette partout → +1 incrément', () => {
    expect(run([perf([[60, 12], [60, 12], [60, 12]])]).plan.targetLoad).toBe(62.5)
  })
  it('deux échecs de suite → −10 %', () => {
    expect(run([perf([[60, 7], [60, 6], [60, 6]]), perf([[60, 7], [60, 8], [60, 8]], 7)]).plan.targetLoad).toBe(55)
  })
  it('sinon charge reconduite', () => {
    expect(run([perf([[60, 12], [60, 10], [60, 9]])]).plan.targetLoad).toBe(60)
  })
})

describe('deload', () => {
  it('réduit charges et séries, après le calcul du mode', () => {
    const r = progressPlan(plan, { ...base, mode: 'percent', percentRow: { pct: 80 }, refMax: 150, deload: { loadPct: 80, setsDelta: -1 } })
    expect(r.plan.targetLoad).toBe(95) // 120 × 0,8 = 96 → arrondi 2,5 = 95
    expect(r.plan.sets).toBe(2)
  })
})

describe('referenceMax', () => {
  const history = [perf([[100, 5]], 10, 120), perf([[100, 5]], 400, 130)]
  const test = { id: 't', updatedAt: 0, exerciseId: 'squat', date: '2026-09-01', load: 125 }
  it('estimé : meilleur 1RM estimé récent (6 mois), sinon de tout l’historique', () => {
    expect(referenceMax(squat, history, [], [])).toBe(120)
    expect(referenceMax(squat, [history[1]], [], [])).toBe(130)
  })
  it('réel : meilleur max testé', () => {
    expect(referenceMax({ ...squat, maxReference: 'real' }, history, [test], [])).toBe(125)
  })
  it('poids du corps : max en lest ramené en charge totale avec le poids de corps actuel', () => {
    const traction = { ...squat, id: 'traction', measure: 'bodyweight' as const, maxReference: 'real' as const }
    const t = { ...test, exerciseId: 'traction', load: 30 }
    expect(referenceMax(traction, [], [t], [{ id: 'w', updatedAt: 0, date: '2026-01-01', kg: 80 }])).toBe(110)
  })

  it('training max : % du réel', () => {
    expect(referenceMax({ ...squat, maxReference: 'training' }, history, [test], [])).toBe(112.5)
  })
})

describe('referenceMaxValue', () => {
  const history = [perf([[100, 5]], 10, 120)]
  const test = { id: 't', updatedAt: 0, exerciseId: 'squat', date: '2026-09-01', load: 110 }
  const after = Date.parse('2026-10-01')

  it('max réel choisi : le max testé, sinon repli sur l’estimé', () => {
    const real = { ...squat, maxReference: 'real' as const }
    expect(referenceMaxValue(real, history, [test], after)).toEqual({ source: 'real', value: 110 })
    expect(referenceMaxValue(real, [perf([[100, 5]], 10, 120)], [], Date.now())).toEqual({ source: 'estimated', value: 120 })
  })

  it('ignore les tests postérieurs à la date considérée', () => {
    const real = { ...squat, maxReference: 'real' as const }
    expect(referenceMaxValue(real, [], [test], Date.parse('2026-08-01'))).toBeUndefined()
  })

  it('training max : % du réel', () => {
    expect(referenceMaxValue({ ...squat, maxReference: 'training' }, history, [test], after)).toEqual({ source: 'training', value: 99 })
  })
})
