// Statistiques calculées à partir des séances (jamais stockées, SPECS.md §7).
// Règle clé : les blocs WOD comptent pour le VOLUME uniquement, jamais pour
// les 1RM ni les records.

import { localDay, parseDay } from './dates'
import { estimate1RM } from './e1rm'
import { isStrengthMeasure, liftedLoad, tonnageLoad } from './exercise'
import type { BodyweightEntry, Exercise, Muscle, Session, SetLog, WodBlockLog } from './types'

export const sessionTime = (s: Session): number =>
  s.completedAt ?? s.startedAt ?? (s.plannedDate ? parseDay(s.plannedDate) : s.updatedAt)

export const isDone = (s: Session) => s.status === 'done' && !s.deleted

/** Poids de corps en vigueur à une date : dernière pesée ≤ date, sinon la plus ancienne. */
export function bodyweightAt(entries: BodyweightEntry[], ts: number): number | undefined {
  const live = entries.filter((e) => !e.deleted).sort((a, b) => a.date.localeCompare(b.date))
  if (live.length === 0) return undefined
  const day = localDay(ts)
  let found = live[0]
  for (const e of live) if (e.date <= day) found = e
  return found.kg
}

// ---------------------------------------------------------------------------
// Historique par exercice (blocs classiques)

export interface ExercisePerformance {
  sessionId: string
  time: number
  sets: SetLog[]
  /** Meilleur 1RM estimé de la séance. */
  bestE1rm?: number
  /** Charge max saisie (convention par main / par côté / lest). */
  topLoad?: number
  /** Quantité max (mesures sans charge). */
  topQty?: number
  tonnage: number
}

/** Séances terminées contenant l'exercice dans un bloc classique, de la plus récente à la plus ancienne. */
export function exerciseHistory(
  exercise: Exercise,
  sessions: Session[],
  bodyweights: BodyweightEntry[],
): ExercisePerformance[] {
  const out: ExercisePerformance[] = []
  for (const s of sessions) {
    if (!isDone(s)) continue
    const time = sessionTime(s)
    const bw = bodyweightAt(bodyweights, time)
    const sets: SetLog[] = []
    for (const b of s.blocks) {
      if (b.kind !== 'classic') continue
      for (const ex of b.exercises) if (ex.exerciseId === exercise.id) sets.push(...ex.sets.filter((x) => x.done))
    }
    if (sets.length === 0) continue
    let bestE1rm: number | undefined
    let topLoad: number | undefined
    let topQty: number | undefined
    let tonnage = 0
    for (const set of sets) {
      const e = estimate1RM(liftedLoad(exercise.measure, set.load, bw), set.reps, set.rpe)
      if (e !== undefined && (bestE1rm === undefined || e > bestE1rm)) bestE1rm = e
      // Séries sans reps (isométrie importée) : hors charge principale.
      if (set.load !== undefined && set.reps && (topLoad === undefined || set.load > topLoad)) topLoad = set.load
      if (set.reps !== undefined && (topQty === undefined || set.reps > topQty)) topQty = set.reps
      tonnage += tonnageLoad(exercise.measure, set.load, bw) * (set.reps ?? 0)
    }
    out.push({ sessionId: s.id, time, sets, bestE1rm, topLoad, topQty, tonnage })
  }
  return out.sort((a, b) => b.time - a.time)
}

// ---------------------------------------------------------------------------
// Records

export interface RecordEntry {
  value: number
  time: number
  sessionId: string
}

export interface ExerciseRecords {
  bestE1rm?: RecordEntry
  /**
   * Meilleure charge pour AU MOINS n reps (index = n). Une série de 8 reps à
   * 80 kg vaut donc record à 80 kg pour 1 à 8 reps.
   */
  repMax: Map<number, RecordEntry>
  /** Meilleure quantité en une série (mesures sans charge). */
  bestQty?: RecordEntry
}

export const MAX_TRACKED_REPS = 12

export function computeRecords(
  exercise: Exercise,
  history: ExercisePerformance[],
  bodyweights: BodyweightEntry[],
): ExerciseRecords {
  const rec: ExerciseRecords = { repMax: new Map() }
  // Parcours chronologique : à égalité, le premier à l'avoir fait garde le record.
  for (const perf of [...history].sort((a, b) => a.time - b.time)) {
    const bw = bodyweightAt(bodyweights, perf.time)
    for (const set of perf.sets) applySet(exercise, rec, set, perf.sessionId, perf.time, bw)
  }
  return rec
}

function applySet(
  exercise: Exercise,
  rec: ExerciseRecords,
  set: SetLog,
  sessionId: string,
  time: number,
  bw: number | undefined,
) {
  const entry = (value: number): RecordEntry => ({ value, time, sessionId })
  if (!isStrengthMeasure(exercise.measure)) {
    if (set.reps !== undefined && (!rec.bestQty || set.reps > rec.bestQty.value)) rec.bestQty = entry(set.reps)
    return
  }
  const e = estimate1RM(liftedLoad(exercise.measure, set.load, bw), set.reps, set.rpe)
  if (e !== undefined && (!rec.bestE1rm || e > rec.bestE1rm.value)) rec.bestE1rm = entry(e)
  if (set.load !== undefined && set.reps !== undefined && set.reps >= 1) {
    for (let n = 1; n <= Math.min(set.reps, MAX_TRACKED_REPS); n++) {
      const cur = rec.repMax.get(n)
      if (!cur || set.load > cur.value) rec.repMax.set(n, entry(set.load))
    }
  }
}

export interface SetPR {
  e1rm: boolean
  repMax: boolean
  qty: boolean
}

/**
 * La série bat-elle un record établi AVANT elle ? Sans aucun historique,
 * rien n'est un record (sinon toute première séance serait couverte d'étoiles).
 */
export function setPR(exercise: Exercise, set: SetLog, prior: ExerciseRecords, bw: number | undefined): SetPR {
  const none = { e1rm: false, repMax: false, qty: false }
  const hasHistory = prior.bestE1rm !== undefined || prior.repMax.size > 0 || prior.bestQty !== undefined
  if (!set.done || !hasHistory) return none
  if (!isStrengthMeasure(exercise.measure)) {
    return { ...none, qty: set.reps !== undefined && (!prior.bestQty || set.reps > prior.bestQty.value) }
  }
  const e = estimate1RM(liftedLoad(exercise.measure, set.load, bw), set.reps, set.rpe)
  const repsKey = Math.min(set.reps ?? 0, MAX_TRACKED_REPS)
  const priorAtReps = prior.repMax.get(repsKey)
  return {
    e1rm: e !== undefined && (!prior.bestE1rm || e > prior.bestE1rm.value + 1e-9),
    repMax: set.load !== undefined && repsKey >= 1 && (!priorAtReps || set.load > priorAtReps.value),
    qty: false,
  }
}

export const isPR = (p: SetPR) => p.e1rm || p.repMax || p.qty

// ---------------------------------------------------------------------------
// WOD : répartition des reps par exercice

export interface WodItemTotal {
  itemId: string
  exerciseId: string
  /** Nombre de passages sur l'exercice (comptés comme séries pour le volume). */
  sets: number
  /** Quantité totale réalisée. */
  quantity: number
  load?: number
}

/**
 * Déduit du score ce qui a été réalisé sur chaque exercice du WOD.
 * Les reps partielles (tour incomplet) sont attribuées dans l'ordre des exercices.
 */
export function wodItemTotals(block: WodBlockLog): WodItemTotal[] {
  const totals = block.items.map((it) => ({ itemId: it.id, exerciseId: it.exerciseId, sets: 0, quantity: 0, load: it.load }))
  const n = block.items.length
  if (n === 0 || !block.score) return totals
  const f = block.format
  const s = block.score

  const addRounds = (rounds: number, partialReps: number) => {
    totals.forEach((t, i) => {
      t.sets += rounds
      t.quantity += rounds * block.items[i].quantity
    })
    let left = partialReps
    for (let i = 0; i < n && left > 0; i++) {
      const done = Math.min(left, block.items[i].quantity)
      totals[i].sets += 1
      totals[i].quantity += done
      left -= done
    }
  }

  if (f.type === 'for_time') {
    if (s.type === 'time') addRounds(f.rounds, 0)
    else if (s.type === 'rounds') addRounds(s.rounds, s.reps)
  } else if (f.type === 'amrap') {
    if (s.type === 'rounds') addRounds(s.rounds, s.reps)
  } else if (f.type === 'emom') {
    if (s.type === 'intervals') {
      if (f.alternate) {
        // Intervalles tenus répartis en rotation sur les exercices.
        for (let k = 0; k < s.held; k++) {
          const i = k % n
          totals[i].sets += 1
          totals[i].quantity += block.items[i].quantity
        }
      } else {
        addRounds(s.held, 0)
      }
    }
  } else if (f.type === 'intervals') {
    if (s.type === 'reps') {
      s.perInterval.forEach((reps, k) => {
        const i = k % n
        totals[i].sets += 1
        totals[i].quantity += reps
      })
    }
  }
  return totals
}

// ---------------------------------------------------------------------------
// Volume par groupe musculaire

export interface MuscleVolume {
  /** Muscle principal = 1 série, secondaire = 0,5. */
  sets: number
  tonnage: number
}

export const SECONDARY_MUSCLE_WEIGHT = 0.5

/** Volume par muscle sur un ensemble de séances (blocs classiques + WOD). */
export function muscleVolume(
  sessions: Session[],
  exercises: Map<string, Exercise>,
  bodyweights: BodyweightEntry[],
): Map<Muscle, MuscleVolume> {
  const vol = new Map<Muscle, MuscleVolume>()
  const add = (ex: Exercise, sets: number, tonnage: number) => {
    const bump = (m: Muscle, w: number) => {
      const cur = vol.get(m) ?? { sets: 0, tonnage: 0 }
      cur.sets += sets * w
      cur.tonnage += tonnage * w
      vol.set(m, cur)
    }
    ex.primaryMuscles.forEach((m) => bump(m, 1))
    ex.secondaryMuscles.forEach((m) => bump(m, SECONDARY_MUSCLE_WEIGHT))
  }

  for (const s of sessions) {
    if (!isDone(s)) continue
    const bw = bodyweightAt(bodyweights, sessionTime(s))
    for (const b of s.blocks) {
      if (b.kind === 'classic') {
        for (const exLog of b.exercises) {
          const ex = exercises.get(exLog.exerciseId)
          if (!ex) continue
          const done = exLog.sets.filter((x) => x.done)
          const tonnage = done.reduce((acc, x) => acc + tonnageLoad(ex.measure, x.load, bw) * (x.reps ?? 0), 0)
          add(ex, done.length, tonnage)
        }
      } else if (b.done) {
        for (const t of wodItemTotals(b)) {
          const ex = exercises.get(t.exerciseId)
          if (!ex) continue
          const tonnage = isStrengthMeasure(ex.measure) ? tonnageLoad(ex.measure, t.load, bw) * t.quantity : 0
          add(ex, t.sets, tonnage)
        }
      }
    }
  }
  return vol
}

/** Lundi 00:00 (heure locale) de la semaine contenant ts. */
export function weekStart(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}
