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

// ---------------------------------------------------------------------------
// Séance → séance modèle

/** Valeur la plus fréquente (à égalité : la plus grande), ou undefined. */
function mostFrequent(values: number[]): number | undefined {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: number | undefined
  for (const [v, n] of counts) {
    const bestN = best === undefined ? 0 : counts.get(best)!
    if (n > bestN || (n === bestN && v > best!)) best = v
  }
  return best
}

/**
 * Modèle reproduisant une séance faite : pour chaque exercice, le nombre de
 * séries faites, la fourchette de reps réalisée, la charge la plus utilisée
 * et le RPE visé d'origine ; les WOD sont repris avec les charges utilisées.
 */
export function templateFromSession(s: Session, now = Date.now()): Template {
  const blocks: BlockPlan[] = s.blocks.map((b) => {
    if (b.kind === 'wod') {
      return { id: uid(), kind: 'wod', name: b.name, format: structuredClone(b.format), items: b.items.map((it) => ({ ...it, id: uid() })) }
    }
    return {
      id: uid(),
      kind: 'classic',
      exercises: b.exercises.map((ex) => {
        const done = ex.sets.filter((x) => x.done)
        const sets = done.length ? done : ex.sets
        const reps = sets.map((x) => x.reps).filter((r): r is number => r !== undefined && r > 0)
        const repsMin = reps.length ? Math.min(...reps) : (ex.target?.repsMin ?? 8)
        const repsMax = reps.length ? Math.max(...reps) : (ex.target?.repsMax ?? repsMin)
        return {
          id: uid(),
          exerciseId: ex.exerciseId,
          sets: Math.max(1, sets.length),
          repsMin,
          repsMax,
          targetLoad: mostFrequent(sets.map((x) => x.load).filter((l): l is number => l !== undefined)),
          targetRpe: ex.target?.targetRpe,
          restSec: ex.restSec,
          notes: ex.notes,
        }
      }),
    }
  })
  return { id: uid(), updatedAt: now, name: s.name, blocks }
}

// ---------------------------------------------------------------------------
// WOD de l'historique → séances modèles "WOD1", "WOD2"…

const wodSignature = (b: Pick<WodBlockLog, 'format' | 'items'>) =>
  JSON.stringify([b.format, b.items.map((i) => [i.exerciseId, i.quantity])])

/** Empreinte courte et stable (djb2) : même WOD → même id de modèle. */
function shortHash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/**
 * Un modèle par WOD différent fait (format + exercices + quantités), dans
 * l'ordre chronologique, numérotés à la suite des "WODn" existants.
 * Relancer ne crée que les nouveaux WOD : un WOD est ignoré s'il figure déjà
 * tel quel dans un modèle, ou si son modèle a déjà été généré une fois (id
 * stable), même modifié ou supprimé depuis — les retouches ne sont jamais
 * écrasées et un modèle supprimé ne revient pas.
 */
export function wodTemplatesFromHistory(sessions: Session[], templates: Template[], now = Date.now()): Template[] {
  const live = templates.filter((t) => !t.deleted)
  const known = new Set(live.flatMap((t) => t.blocks.filter((b) => b.kind === 'wod').map(wodSignature)))
  const generated = new Set(templates.map((t) => t.id))
  let n = Math.max(0, ...live.map((t) => Number(/^WOD(\d+)$/.exec(t.name)?.[1] ?? 0)))
  const done = sessions
    .filter((s) => s.status === 'done' && !s.deleted)
    .sort((a, b) => (a.completedAt ?? a.startedAt ?? 0) - (b.completedAt ?? b.startedAt ?? 0))
  const out: Template[] = []
  for (const s of done) {
    for (const b of s.blocks) {
      if (b.kind !== 'wod' || b.items.length === 0) continue
      const sig = wodSignature(b)
      const id = `wod-${shortHash(sig)}`
      if (known.has(sig) || generated.has(id)) continue
      known.add(sig)
      n += 1
      out.push({
        id,
        updatedAt: now,
        name: `WOD${n}`,
        blocks: [{ id: uid(), kind: 'wod', name: b.name ?? s.name, format: structuredClone(b.format), items: b.items.map((it) => ({ ...it, id: uid() })) }],
      })
    }
  }
  return out
}
