// Programmes : déroulé des séances et placement dans le temps (SPECS.md §2).

import { localDay, parseDay } from './dates'
import { isDone, sessionTime } from './stats'
import type { Program, ProgramBlock, ProgressionMode, ScheduledEntry, Session, SuggestRule, WeekOverride } from './types'

/** Une séance à faire dans le programme : bloc × semaine × emplacement. */
export interface Occurrence {
  key: string
  blockId: string
  blockIndex: number
  week: number
  slotId: string
  templateId: string
  extra: boolean
}

export const occurrenceKey = (blockId: string, week: number, slotId: string) => `${blockId}:${week}:${slotId}`

export const overrideFor = (block: ProgramBlock, week: number): WeekOverride | undefined =>
  block.overrides.find((o) => o.week === week)

/** Toutes les séances du programme, dans l'ordre, exceptions appliquées. */
export function occurrences(program: Program): Occurrence[] {
  const out: Occurrence[] = []
  program.blocks.forEach((block, blockIndex) => {
    for (let week = 0; week < block.weeks; week++) {
      const ov = overrideFor(block, week)
      for (const slot of block.slots) {
        if (ov?.skip.includes(slot.id)) continue
        const templateId = ov?.replace.find((r) => r.slotId === slot.id)?.templateId ?? slot.templateId
        out.push({ key: occurrenceKey(block.id, week, slot.id), blockId: block.id, blockIndex, week, slotId: slot.id, templateId, extra: false })
      }
      for (const slot of ov?.extra ?? []) {
        out.push({ key: occurrenceKey(block.id, week, slot.id), blockId: block.id, blockIndex, week, slotId: slot.id, templateId: slot.templateId, extra: true })
      }
    }
  })
  return out
}

/** Mode et règle de suggestion effectifs pour une occurrence d'exercice. */
export function effectiveMode(block: ProgramBlock, week: number, planId: string): { mode: ProgressionMode; suggestRule: SuggestRule } {
  const rule = block.rules.find((r) => r.planId === planId)
  return {
    mode: overrideFor(block, week)?.mode ?? rule?.mode ?? block.mode,
    suggestRule: rule?.suggestRule ?? block.suggestRule,
  }
}

// ---------------------------------------------------------------------------
// Placement dans le temps

const addDays = (day: string, n: number) => {
  const d = new Date(parseDay(day))
  d.setDate(d.getDate() + n)
  return localDay(d.getTime())
}

/** Jour de la semaine ISO : 1 = lundi … 7 = dimanche. */
const isoWeekday = (day: string) => ((new Date(parseDay(day)).getDay() + 6) % 7) + 1

/** Premier jour d'entraînement ≥ day. */
export function nextTrainingDay(day: string, trainingDays: number[]): string {
  if (trainingDays.length === 0) return day
  let d = day
  for (let i = 0; i < 7; i++) {
    if (trainingDays.includes(isoWeekday(d))) return d
    d = addDays(d, 1)
  }
  return day
}

export type ScheduleStatus = 'done' | 'in_progress' | 'planned' | 'skipped'

export interface ScheduledOccurrence extends Occurrence {
  date: string
  status: ScheduleStatus
  sessionId?: string
  /** Déplacée manuellement à une date fixe. */
  moved: boolean
}

/**
 * Planning du programme :
 * - les séances faites gardent leur date réelle ;
 * - les séances déplacées à la main gardent leur date et ne consomment pas
 *   de jour d'entraînement ;
 * - les autres se placent dans l'ordre sur les jours d'entraînement, jamais
 *   avant aujourd'hui : une séance manquée glisse, et tout le reste avec elle.
 */
export function computeSchedule(program: Program, sessions: Session[], today: string = localDay()): ScheduledOccurrence[] {
  const byKey = new Map<string, Session>()
  for (const s of sessions) {
    if (s.deleted || s.programRef?.programId !== program.id) continue
    if (isDone(s) || s.status === 'in_progress') byKey.set(s.programRef.key, s)
  }

  let cursor = program.startDate
  const out: ScheduledOccurrence[] = []
  for (const occ of occurrences(program)) {
    const session = byKey.get(occ.key)
    if (session && isDone(session)) {
      const date = localDay(sessionTime(session))
      out.push({ ...occ, date, status: 'done', sessionId: session.id, moved: false })
      if (date >= cursor) cursor = addDays(date, 1)
      continue
    }
    if (program.skipped.includes(occ.key)) {
      out.push({ ...occ, date: '', status: 'skipped', moved: false })
      continue
    }
    if (session) {
      // En cours : aujourd'hui.
      out.push({ ...occ, date: today, status: 'in_progress', sessionId: session.id, moved: false })
      if (today >= cursor) cursor = addDays(today, 1)
      continue
    }
    const moved = program.moves[occ.key]
    if (moved) {
      out.push({ ...occ, date: moved, status: 'planned', moved: true })
      continue
    }
    const date = nextTrainingDay(cursor > today ? cursor : today, program.trainingDays)
    out.push({ ...occ, date, status: 'planned', moved: false })
    cursor = addDays(date, 1)
  }
  return out
}

/** Prochaine séance à faire (en cours d'abord, sinon la plus proche). */
export function nextOccurrence(schedule: ScheduledOccurrence[]): ScheduledOccurrence | undefined {
  return (
    schedule.find((o) => o.status === 'in_progress') ??
    schedule.filter((o) => o.status === 'planned').sort((a, b) => a.date.localeCompare(b.date))[0]
  )
}

/** Version compacte du planning, mise en cache dans le programme pour la synchro calendrier. */
export function scheduleCache(schedule: ScheduledOccurrence[], titleOf: (o: ScheduledOccurrence) => string): ScheduledEntry[] {
  return schedule
    .filter((o) => o.status !== 'skipped')
    .map((o) => ({ key: o.key, date: o.date, title: titleOf(o), status: o.status === 'done' ? 'done' : 'planned' }))
}

export const sameSchedule = (a: ScheduledEntry[] | undefined, b: ScheduledEntry[]) => JSON.stringify(a ?? []) === JSON.stringify(b)
