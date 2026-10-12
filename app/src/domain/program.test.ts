import { describe, expect, it } from 'vitest'
import { computeSchedule, effectiveMode, nextOccurrence, nextTrainingDay, occurrences } from './program'
import type { Program, ProgramBlock, Session } from './types'

// Le 2026-10-12 est un lundi.
const block = (p: Partial<ProgramBlock> = {}): ProgramBlock => ({
  id: 'b1',
  name: 'Force',
  weeks: 2,
  slots: [
    { id: 's1', templateId: 'jambes' },
    { id: 's2', templateId: 'haut' },
  ],
  mode: 'percent',
  suggestRule: 'rpe',
  rules: [],
  overrides: [],
  ...p,
})

const program = (p: Partial<Program> = {}): Program => ({
  id: 'p',
  updatedAt: 0,
  name: 'Prog',
  startDate: '2026-10-12',
  trainingDays: [1, 3], // lundi, mercredi
  active: true,
  blocks: [block()],
  moves: {},
  skipped: [],
  calendarSlot: { start: '08:00', durationMin: 60 },
  ...p,
})

const doneSession = (key: string, day: string): Session => ({
  id: `sess-${key}`,
  updatedAt: 0,
  name: key,
  status: 'done',
  completedAt: new Date(`${day}T10:00:00`).getTime(),
  blocks: [],
  source: 'app',
  programRef: { programId: 'p', key, blockId: 'b1', week: 0 },
})

describe('occurrences', () => {
  it('répète la semaine type sur toutes les semaines du bloc', () => {
    expect(occurrences(program()).map((o) => o.key)).toEqual(['b1:0:s1', 'b1:0:s2', 'b1:1:s1', 'b1:1:s2'])
  })

  it('applique les exceptions : sauter, remplacer, ajouter', () => {
    const p = program({
      blocks: [
        block({
          overrides: [
            { week: 0, skip: ['s2'], replace: [], extra: [] },
            { week: 1, skip: [], replace: [{ slotId: 's1', templateId: 'test-max' }], extra: [{ id: 'x', templateId: 'cardio' }] },
          ],
        }),
      ],
    })
    const occ = occurrences(p)
    expect(occ.map((o) => o.templateId)).toEqual(['jambes', 'test-max', 'haut', 'cardio'])
    expect(occ[3].extra).toBe(true)
  })
})

describe('effectiveMode', () => {
  it('semaine > exercice > bloc', () => {
    const b = block({
      rules: [{ planId: 'curl', mode: 'suggest', suggestRule: 'double', percentWeeks: [] }],
      overrides: [{ week: 1, mode: 'free', skip: [], replace: [], extra: [] }],
    })
    expect(effectiveMode(b, 0, 'squat')).toEqual({ mode: 'percent', suggestRule: 'rpe' })
    expect(effectiveMode(b, 0, 'curl')).toEqual({ mode: 'suggest', suggestRule: 'double' })
    expect(effectiveMode(b, 1, 'curl').mode).toBe('free')
  })
})

describe('computeSchedule', () => {
  it('place les séances sur les jours d’entraînement, dans l’ordre', () => {
    const s = computeSchedule(program(), [], '2026-10-12')
    expect(s.map((o) => o.date)).toEqual(['2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21'])
  })

  it('séance manquée : tout glisse au prochain jour d’entraînement', () => {
    // Lundi fait, mercredi manqué ; on est jeudi.
    const s = computeSchedule(program(), [doneSession('b1:0:s1', '2026-10-12')], '2026-10-15')
    expect(s.map((o) => [o.status, o.date])).toEqual([
      ['done', '2026-10-12'],
      ['planned', '2026-10-19'],
      ['planned', '2026-10-21'],
      ['planned', '2026-10-26'],
    ])
  })

  it('séance déplacée : date fixe, ne consomme pas de jour', () => {
    const s = computeSchedule(program({ moves: { 'b1:0:s2': '2026-10-17' } }), [], '2026-10-12')
    expect(s.map((o) => o.date)).toEqual(['2026-10-12', '2026-10-17', '2026-10-14', '2026-10-19'])
    expect(nextOccurrence(s)?.key).toBe('b1:0:s1')
  })

  it('séance sautée depuis le planning', () => {
    const s = computeSchedule(program({ skipped: ['b1:0:s1'] }), [], '2026-10-12')
    expect(s[0].status).toBe('skipped')
    expect(s[1].date).toBe('2026-10-12')
  })

  it('programme qui démarre plus tard : pas de placement avant la date de début', () => {
    const s = computeSchedule(program({ startDate: '2026-11-02' }), [], '2026-10-12')
    expect(s[0].date).toBe('2026-11-02')
  })

  it('jours d’entraînement', () => {
    expect(nextTrainingDay('2026-10-13', [1, 3])).toBe('2026-10-14')
    expect(nextTrainingDay('2026-10-15', [1])).toBe('2026-10-19')
  })
})
