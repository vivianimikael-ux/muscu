// Construction et manipulation des séances (instances de modèles).

import type {
  BlockLog,
  BlockPlan,
  ClassicExerciseLog,
  ClassicExercisePlan,
  ProgramRef,
  SetLog,
  Session,
  Template,
  WodBlockLog,
} from './types'

export const uid = () => crypto.randomUUID()

/** Dernières séries faites sur un exercice, utilisées pour pré-remplir. */
export type LastSetsLookup = (exerciseId: string) => SetLog[] | undefined

/**
 * Séries pré-remplies : charge cible (sinon celle de la dernière fois), reps
 * cibles (en fourchette : celles de la dernière fois si dans la fourchette),
 * RPE cible. Valider une série conforme = un seul tap.
 */
export function prefillSets(plan: ClassicExercisePlan, last: SetLog[] | undefined): SetLog[] {
  return Array.from({ length: plan.sets }, (_, i) => {
    const prev = last?.[Math.min(i, last.length - 1)]
    let reps = plan.repsMin
    if (plan.repsMax > plan.repsMin && prev?.reps !== undefined) {
      reps = Math.min(Math.max(prev.reps, plan.repsMin), plan.repsMax)
    }
    return {
      id: uid(),
      load: plan.targetLoad ?? prev?.load,
      reps,
      rpe: plan.targetRpe,
      done: false,
    }
  })
}

/** Ajustement des cibles d'un exercice (progression de programme). */
export type PlanAdjuster = (plan: ClassicExercisePlan) => { plan: ClassicExercisePlan; note?: string }

export function exerciseLogFromPlan(plan: ClassicExercisePlan, last: SetLog[] | undefined, note?: string): ClassicExerciseLog {
  return {
    id: uid(),
    exerciseId: plan.exerciseId,
    target: { repsMin: plan.repsMin, repsMax: plan.repsMax, targetLoad: plan.targetLoad, targetRpe: plan.targetRpe },
    restSec: plan.restSec,
    sets: prefillSets(plan, last),
    notes: plan.notes,
    targetNote: note,
  }
}

export function blockLogFromPlan(block: BlockPlan, lastSets: LastSetsLookup, adjust?: PlanAdjuster): BlockLog {
  if (block.kind === 'classic') {
    return {
      id: uid(),
      kind: 'classic',
      exercises: block.exercises.map((p) => {
        const { plan, note } = adjust ? adjust(p) : { plan: p, note: undefined }
        return exerciseLogFromPlan(plan, lastSets(p.exerciseId), note)
      }),
    }
  }
  return {
    id: uid(),
    kind: 'wod',
    name: block.name,
    sourceBlockId: block.id,
    format: structuredClone(block.format),
    items: block.items.map((it) => ({ ...it })),
    done: false,
  }
}

export function sessionFromTemplate(
  t: Template,
  lastSets: LastSetsLookup,
  now = Date.now(),
  program?: { ref: ProgramRef; adjust: PlanAdjuster },
): Session {
  return {
    id: uid(),
    updatedAt: now,
    name: t.name,
    templateId: t.id,
    status: 'in_progress',
    startedAt: now,
    blocks: t.blocks.map((b) => blockLogFromPlan(b, lastSets, program?.adjust)),
    source: 'app',
    programRef: program?.ref,
  }
}

export function emptySession(now = Date.now()): Session {
  return {
    id: uid(),
    updatedAt: now,
    name: 'Séance libre',
    status: 'in_progress',
    startedAt: now,
    blocks: [],
    source: 'app',
  }
}

/** Nouvelle série ajoutée à la volée : copie de la dernière. */
export function nextSet(ex: ClassicExerciseLog): SetLog {
  const last = ex.sets[ex.sets.length - 1]
  return { id: uid(), load: last?.load, reps: last?.reps, rpe: last?.rpe, done: false }
}

export interface SessionProgress {
  doneSets: number
  totalSets: number
  doneWods: number
  totalWods: number
}

export function sessionProgress(s: Session): SessionProgress {
  const p = { doneSets: 0, totalSets: 0, doneWods: 0, totalWods: 0 }
  for (const b of s.blocks) {
    if (b.kind === 'classic') {
      for (const ex of b.exercises) {
        p.totalSets += ex.sets.length
        p.doneSets += ex.sets.filter((x) => x.done).length
      }
    } else {
      p.totalWods += 1
      if (b.done) p.doneWods += 1
    }
  }
  return p
}

export const isWod = (b: BlockLog): b is WodBlockLog => b.kind === 'wod'
