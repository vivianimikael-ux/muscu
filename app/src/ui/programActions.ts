import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo } from 'react'
import { db, live, save } from '../db/db'
import { computeSchedule, effectiveMode, overrideFor, sameSchedule, scheduleCache, type Occurrence, type ScheduledOccurrence } from '../domain/program'
import { progressPlan, referenceMax } from '../domain/progression'
import { sessionFromTemplate, uid } from '../domain/session'
import { bodyweightAt, exerciseHistory } from '../domain/stats'
import type { Program, ProgramBlock, Template } from '../domain/types'
import { lastSetsByExercise } from './actions'
import { useSessions } from './hooks'

export const newBlock = (n: number): ProgramBlock => ({
  id: uid(),
  name: `Bloc ${n}`,
  weeks: 4,
  slots: [],
  mode: 'free',
  suggestRule: 'rpe',
  rules: [],
  overrides: [],
})

export const useActiveProgram = (): Program | undefined =>
  useLiveQuery(async () => live(await db.programs.toArray()).find((p) => p.active))

export function useTemplateMap(): Map<string, Template> | undefined {
  return useLiveQuery(async () => new Map((await db.templates.toArray()).map((t) => [t.id, t])))
}

/** Libellé d'une séance de programme : "Jambes · Force S2". */
export function occurrenceTitle(program: Program, occ: Occurrence, templates: Map<string, Template> | undefined): string {
  const block = program.blocks[occ.blockIndex]
  const name = templates?.get(occ.templateId)?.name ?? 'Séance'
  return `${name} · ${block?.name ?? ''} S${occ.week + 1}`
}

/** Planning calculé d'un programme (recalculé quand les séances changent). */
export function useSchedule(program: Program | undefined): ScheduledOccurrence[] | undefined {
  const sessions = useSessions()
  return useMemo(() => (program && sessions ? computeSchedule(program, sessions) : undefined), [program, sessions])
}

/**
 * Tient à jour le planning mis en cache dans le programme actif, lu par la
 * synchro calendrier côté serveur.
 */
export function useScheduleCacheSync(): void {
  const program = useActiveProgram()
  const schedule = useSchedule(program)
  const templates = useTemplateMap()
  useEffect(() => {
    if (!program || !schedule || !templates) return
    const cache = scheduleCache(schedule, (o) => occurrenceTitle(program, o, templates))
    if (!sameSchedule(program.schedule, cache)) void save(db.programs, { ...program, schedule: cache })
  }, [program, schedule, templates])
}

/** Active un programme (un seul actif à la fois). */
export async function activateProgram(id: string, active: boolean): Promise<void> {
  await db.transaction('rw', db.programs, async () => {
    for (const p of live(await db.programs.toArray())) {
      const want = p.id === id ? active : active ? false : p.active
      if (p.active !== want) await save(db.programs, { ...p, active: want })
    }
  })
}

/** Démarre la séance d'une occurrence de programme, cibles calculées par la progression. */
export async function startProgramSession(program: Program, occ: Occurrence): Promise<string> {
  const template = await db.templates.get(occ.templateId)
  if (!template) throw new Error('Modèle introuvable')
  const block = program.blocks[occ.blockIndex]
  const [exercises, sessions, maxTests, bodyweights, last] = await Promise.all([
    db.exercises.toArray(),
    db.sessions.toArray(),
    db.maxTests.toArray(),
    db.bodyweights.toArray(),
    lastSetsByExercise(),
  ])
  const exMap = new Map(exercises.map((e) => [e.id, e]))
  const liveSessions = live(sessions)
  const liveBw = live(bodyweights)
  const bodyweight = bodyweightAt(liveBw, Date.now())
  const deload = overrideFor(block, occ.week)?.deload

  const session = sessionFromTemplate(template, (id) => last.get(id), Date.now(), {
    ref: { programId: program.id, key: occ.key, blockId: block.id, week: occ.week },
    adjust: (plan) => {
      const exercise = exMap.get(plan.exerciseId)
      if (!exercise) return { plan }
      const { mode, suggestRule } = effectiveMode(block, occ.week, plan.id)
      const history = exerciseHistory(exercise, liveSessions, liveBw)
      const rule = block.rules.find((r) => r.planId === plan.id)
      return progressPlan(plan, {
        exercise,
        mode,
        suggestRule,
        percentRow: rule?.percentWeeks[occ.week],
        deload,
        history,
        refMax: mode === 'percent' ? referenceMax(exercise, history, live(maxTests), liveBw) : undefined,
        bodyweight,
      })
    },
  })
  session.name = `${template.name} · ${block.name} S${occ.week + 1}`
  await save(db.sessions, session)
  return session.id
}
