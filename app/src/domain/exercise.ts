import type { Exercise, MeasureType, Muscle } from './types'

export const MUSCLES: { id: Muscle; label: string }[] = [
  { id: 'pectoraux', label: 'Pectoraux' },
  { id: 'dos', label: 'Dos' },
  { id: 'trapezes', label: 'Trapèzes' },
  { id: 'epaules', label: 'Épaules' },
  { id: 'biceps', label: 'Biceps' },
  { id: 'triceps', label: 'Triceps' },
  { id: 'avant-bras', label: 'Avant-bras' },
  { id: 'abdos', label: 'Abdos' },
  { id: 'lombaires', label: 'Lombaires' },
  { id: 'fessiers', label: 'Fessiers' },
  { id: 'quadriceps', label: 'Quadriceps' },
  { id: 'ischios', label: 'Ischios' },
  { id: 'mollets', label: 'Mollets' },
  { id: 'cardio', label: 'Cardio' },
]

export const muscleLabel = (m: Muscle) => MUSCLES.find((x) => x.id === m)?.label ?? m

interface MeasureInfo {
  label: string
  /** La série porte une charge (load). */
  hasLoad: boolean
  /** Libellé du champ charge en saisie. */
  loadLabel?: string
  /** Unité de la quantité (reps par défaut). */
  unit: string
  defaultIncrement: number
}

export const MEASURES: Record<MeasureType, MeasureInfo> = {
  barbell: { label: 'Barre', hasLoad: true, loadLabel: 'kg', unit: 'reps', defaultIncrement: 2.5 },
  machine: { label: 'Machine', hasLoad: true, loadLabel: 'kg', unit: 'reps', defaultIncrement: 5 },
  dumbbell: { label: 'Haltères', hasLoad: true, loadLabel: 'kg/main', unit: 'reps', defaultIncrement: 2 },
  unilateral: { label: 'Unilatéral', hasLoad: true, loadLabel: 'kg/côté', unit: 'reps', defaultIncrement: 2 },
  bodyweight: { label: 'Poids du corps', hasLoad: true, loadLabel: 'lest kg', unit: 'reps', defaultIncrement: 2.5 },
  reps: { label: 'Reps seules', hasLoad: false, unit: 'reps', defaultIncrement: 0 },
  time: { label: 'Temps', hasLoad: false, unit: 's', defaultIncrement: 0 },
  distance: { label: 'Distance', hasLoad: false, unit: 'm', defaultIncrement: 0 },
  calories: { label: 'Calories', hasLoad: false, unit: 'cal', defaultIncrement: 0 },
}

export const MEASURE_TYPES = Object.keys(MEASURES) as MeasureType[]

export const hasLoad = (m: MeasureType) => MEASURES[m].hasLoad

/** Les reps comptent pour le 1RM / les records de charge. */
export const isStrengthMeasure = (m: MeasureType) =>
  m === 'barbell' || m === 'machine' || m === 'dumbbell' || m === 'unilateral' || m === 'bodyweight'

export const incrementOf = (e: Exercise) => e.increment ?? MEASURES[e.measure].defaultIncrement

/**
 * Charge "réelle" soulevée pour une répétition, utilisée pour le 1RM estimé.
 * Haltères et unilatéral restent exprimés par main / par côté (c'est ce qu'on
 * compare d'une séance à l'autre) ; le poids du corps s'ajoute au lest.
 */
export function liftedLoad(measure: MeasureType, load: number | undefined, bodyweight: number | undefined): number | undefined {
  if (!isStrengthMeasure(measure)) return undefined
  if (measure === 'bodyweight') {
    if (bodyweight === undefined) return undefined
    return bodyweight + (load ?? 0)
  }
  return load
}

/**
 * Charge comptée pour le tonnage d'UNE répétition : haltères (deux mains) et
 * unilatéral (deux côtés) comptent double.
 */
export function tonnageLoad(measure: MeasureType, load: number | undefined, bodyweight: number | undefined): number {
  const lifted = liftedLoad(measure, load, bodyweight)
  if (lifted === undefined) return 0
  return measure === 'dumbbell' || measure === 'unilateral' ? lifted * 2 : lifted
}

/** Formate une quantité selon l'unité de la mesure (ex : 90 s → "1:30"). */
export function formatQuantity(measure: MeasureType, qty: number | undefined): string {
  if (qty === undefined) return '–'
  if (measure === 'time') return formatDuration(qty)
  return `${qty} ${MEASURES[measure].unit}`
}

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export function formatNumber(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
}

export function formatKg(kg: number | undefined): string {
  if (kg === undefined) return '–'
  return `${formatNumber(kg)} kg`
}
