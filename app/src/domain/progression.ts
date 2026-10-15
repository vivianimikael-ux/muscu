// Calcul des cibles d'un exercice selon le mode de progression
// (SPECS.md §5). Ne s'applique qu'aux blocs classiques.

import { parseDay } from './dates'
import { roundToIncrement } from './e1rm'
import { formatKg, formatNumber, incrementOf, isStrengthMeasure } from './exercise'
import type { ExercisePerformance } from './stats'
import { bodyweightAt } from './stats'
import type { BodyweightEntry, ClassicExercisePlan, Deload, Exercise, MaxTest, PercentWeek, ProgressionMode, SuggestRule } from './types'

export const DEFAULT_TARGET_RPE = 8
/** Baisse de charge après deux échecs de suite (double progression). */
export const FAILURE_DROP = 0.1
/** Fenêtre de recherche du 1RM estimé de référence. */
const ESTIMATE_WINDOW_DAYS = 180

export type MaxSource = 'real' | 'estimated' | 'training'

export interface ReferenceMaxValue {
  /** D'où vient la valeur réellement retenue (repli possible réel ↔ estimé). */
  source: MaxSource
  /** Dans la convention de saisie : lest pour le poids du corps. */
  value: number
}

/**
 * Max de référence choisi pour l'exercice (réel, estimé ou training max),
 * dans la convention de saisie. Utilisé à la fois pour l'affichage en séance
 * et pour les charges des programmes en %, qui voient donc la même valeur.
 * Repli : sans max testé on prend l'estimé, et inversement.
 */
export function referenceMaxValue(
  exercise: Exercise,
  history: ExercisePerformance[],
  maxTests: MaxTest[],
  now = Date.now(),
): ReferenceMaxValue | undefined {
  // Seuls les tests déjà faits à la date considérée (séance passée : max connu à ce moment-là).
  const real = maxTests
    .filter((t) => !t.deleted && t.exerciseId === exercise.id && parseDay(t.date) <= now)
    .map((t) => t.load)
    .reduce<number | undefined>((best, v) => (best === undefined || v > best ? v : best), undefined)

  const bestE1rm = (perfs: ExercisePerformance[]) =>
    perfs.reduce<number | undefined>((best, p) => (p.bestE1rm !== undefined && (best === undefined || p.bestE1rm > best) ? p.bestE1rm : best), undefined)
  const recent = history.filter((p) => now - p.time <= ESTIMATE_WINDOW_DAYS * 86_400_000)
  const estimated = bestE1rm(recent) ?? bestE1rm(history)

  if (exercise.maxReference === 'estimated') {
    if (estimated !== undefined) return { source: 'estimated', value: estimated }
    return real !== undefined ? { source: 'real', value: real } : undefined
  }
  const base: ReferenceMaxValue | undefined =
    real !== undefined ? { source: 'real', value: real } : estimated !== undefined ? { source: 'estimated', value: estimated } : undefined
  if (!base || exercise.maxReference === 'real') return base
  return { source: 'training', value: (base.value * exercise.trainingMaxPct) / 100 }
}

/**
 * Max de référence en charge réellement soulevée (poids de corps actuel
 * ajouté pour les exercices au poids du corps), pour le mode % du 1RM.
 */
export function referenceMax(
  exercise: Exercise,
  history: ExercisePerformance[],
  maxTests: MaxTest[],
  bodyweights: BodyweightEntry[],
  now = Date.now(),
): number | undefined {
  const ref = referenceMaxValue(exercise, history, maxTests, now)
  if (!ref) return undefined
  if (exercise.measure !== 'bodyweight') return ref.value
  // Training max d'un exercice au poids du corps : % appliqué à la charge totale.
  const bw = bodyweightAt(bodyweights, now) ?? 0
  if (ref.source === 'training') return ((ref.value / exercise.trainingMaxPct) * 100 + bw) * (exercise.trainingMaxPct / 100)
  return ref.value + bw
}

export interface ProgressionInput {
  exercise: Exercise
  mode: ProgressionMode
  suggestRule: SuggestRule
  /** Ligne du tableau % pour la semaine en cours (mode percent). */
  percentRow?: PercentWeek
  deload?: Deload
  /** Historique de l'exercice, plus récent d'abord. */
  history: ExercisePerformance[]
  refMax?: number
  bodyweight?: number
}

export interface ProgressionResult {
  plan: ClassicExercisePlan
  note?: string
}

/** Charge principale d'une séance passée : la plus lourde des séries faites. */
const topLoadOf = (p: ExercisePerformance | undefined) => p?.topLoad

/** Cible ajustée d'un exercice de modèle pour une séance de programme. */
export function progressPlan(base: ClassicExercisePlan, input: ProgressionInput): ProgressionResult {
  const { exercise, history } = input
  const plan: ClassicExercisePlan = { ...base }
  const notes: string[] = []
  const inc = incrementOf(exercise)
  const round = (kg: number) => roundToIncrement(kg, inc)

  if (isStrengthMeasure(exercise.measure)) {
    if (input.mode === 'percent') {
      const row = input.percentRow
      if (row?.reps !== undefined) {
        plan.repsMin = row.reps
        plan.repsMax = row.reps
      }
      if (row?.sets !== undefined) plan.sets = row.sets
      if (row?.pct !== undefined) {
        if (input.refMax === undefined) {
          notes.push(`${formatNumber(row.pct)} % : max inconnu`)
        } else {
          const lifted = (row.pct / 100) * input.refMax
          // Poids du corps : on saisit le lest, pas la charge totale.
          const load = exercise.measure === 'bodyweight' ? lifted - (input.bodyweight ?? 0) : lifted
          plan.targetLoad = round(load)
          notes.push(`${formatNumber(row.pct)} % de ${formatKg(Math.round(input.refMax * 10) / 10)}`)
        }
      }
    } else if (input.mode === 'suggest') {
      const last = history[0]
      const lastLoad = topLoadOf(last)
      if (last && lastLoad !== undefined) {
        if (input.suggestRule === 'rpe') {
          const target = plan.targetRpe ?? DEFAULT_TARGET_RPE
          const rpes = last.sets.filter((s) => s.load === lastLoad && s.rpe !== undefined).map((s) => s.rpe!)
          plan.targetRpe = target
          if (rpes.length === 0) {
            plan.targetLoad = lastLoad
            notes.push('Charge reconduite (pas de RPE la dernière fois)')
          } else {
            const avg = rpes.reduce((a, b) => a + b, 0) / rpes.length
            if (avg <= target - 1) {
              plan.targetLoad = lastLoad + inc
              notes.push(`+${formatKg(inc)} : RPE ${formatNumber(Math.round(avg * 10) / 10)} < ${formatNumber(target)} visé`)
            } else if (avg >= target + 1) {
              plan.targetLoad = Math.max(0, lastLoad - inc)
              notes.push(`−${formatKg(inc)} : RPE ${formatNumber(Math.round(avg * 10) / 10)} > ${formatNumber(target)} visé`)
            } else {
              plan.targetLoad = lastLoad
              notes.push(`Charge reconduite : RPE ${formatNumber(Math.round(avg * 10) / 10)} ≈ ${formatNumber(target)}`)
            }
          }
        } else {
          const allTop = last.sets.length >= plan.sets && last.sets.every((s) => (s.reps ?? 0) >= plan.repsMax)
          const failed = (p: ExercisePerformance | undefined) => !!p && p.sets.some((s) => (s.reps ?? 0) < plan.repsMin)
          if (allTop) {
            plan.targetLoad = lastLoad + inc
            notes.push(`+${formatKg(inc)} : ${plan.repsMax} reps atteintes partout`)
          } else if (failed(history[0]) && failed(history[1])) {
            plan.targetLoad = round(lastLoad * (1 - FAILURE_DROP))
            notes.push(`−${FAILURE_DROP * 100} % : deux séances sous ${plan.repsMin} reps`)
          } else {
            plan.targetLoad = lastLoad
            notes.push(`Charge reconduite : viser ${plan.repsMax} reps sur chaque série`)
          }
        }
      }
    }
  }

  if (input.deload) {
    if (plan.targetLoad !== undefined && isStrengthMeasure(exercise.measure)) {
      plan.targetLoad = round((plan.targetLoad * input.deload.loadPct) / 100)
    }
    plan.sets = Math.max(1, plan.sets + input.deload.setsDelta)
    notes.push(`Deload ${formatNumber(input.deload.loadPct)} %`)
  }

  return { plan, note: notes.length ? notes.join(' · ') : undefined }
}
