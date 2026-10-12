import { describe, expect, it } from 'vitest'
import { prefillSets, sessionFromTemplate, templateFromSession } from './session'
import type { ClassicExercisePlan, Template } from './types'

const plan = (p: Partial<ClassicExercisePlan>): ClassicExercisePlan => ({
  id: 'p',
  exerciseId: 'squat',
  sets: 3,
  repsMin: 5,
  repsMax: 5,
  restSec: 120,
  ...p,
})

describe('prefillSets', () => {
  it('reprend la cible', () => {
    const sets = prefillSets(plan({ targetLoad: 100, targetRpe: 8 }), undefined)
    expect(sets).toHaveLength(3)
    expect(sets[0]).toMatchObject({ load: 100, reps: 5, rpe: 8, done: false })
  })

  it('sans charge cible, reprend la charge de la dernière fois série par série', () => {
    const last = [
      { id: 'a', load: 60, reps: 10, done: true },
      { id: 'b', load: 62.5, reps: 9, done: true },
    ]
    const sets = prefillSets(plan({ repsMin: 8, repsMax: 12 }), last)
    expect(sets.map((s) => s.load)).toEqual([60, 62.5, 62.5])
    expect(sets.map((s) => s.reps)).toEqual([10, 9, 9])
  })

  it('reps de la dernière fois bornées à la fourchette', () => {
    const sets = prefillSets(plan({ repsMin: 8, repsMax: 12, sets: 1 }), [{ id: 'a', load: 60, reps: 15, done: true }])
    expect(sets[0].reps).toBe(12)
  })
})

describe('sessionFromTemplate', () => {
  it('instancie blocs classiques et WOD sans partager les objets du modèle', () => {
    const t: Template = {
      id: 't',
      updatedAt: 0,
      name: 'Jambes',
      blocks: [
        { id: 'b1', kind: 'classic', exercises: [plan({ targetLoad: 100 })] },
        { id: 'b2', kind: 'wod', format: { type: 'amrap', durationSec: 600 }, items: [{ id: 'i', exerciseId: 'burpee', quantity: 10 }] },
      ],
    }
    const s = sessionFromTemplate(t, () => undefined, 42)
    expect(s).toMatchObject({ name: 'Jambes', templateId: 't', status: 'in_progress', startedAt: 42 })
    expect(s.blocks[0].kind).toBe('classic')
    const wod = s.blocks[1]
    expect(wod.kind === 'wod' && wod.sourceBlockId).toBe('b2')
    if (wod.kind === 'wod') wod.items[0].quantity = 99
    const tplWod = t.blocks[1]
    expect(tplWod.kind === 'wod' && tplWod.items[0].quantity).toBe(10)
  })
})

describe('templateFromSession', () => {
  it('reprend séries faites, fourchette de reps, charge la plus utilisée et WOD', () => {
    const s = sessionFromTemplate(
      {
        id: 't',
        updatedAt: 0,
        name: 'Jambes',
        blocks: [
          { id: 'b1', kind: 'classic', exercises: [plan({ sets: 4, targetLoad: 100, targetRpe: 8 })] },
          { id: 'b2', kind: 'wod', format: { type: 'amrap', durationSec: 600 }, items: [{ id: 'i', exerciseId: 'burpee', quantity: 10 }] },
        ],
      },
      () => undefined,
    )
    const ex = s.blocks[0].kind === 'classic' ? s.blocks[0].exercises[0] : undefined
    ex!.sets = [
      { id: 'a', load: 100, reps: 5, done: true },
      { id: 'b', load: 105, reps: 4, done: true },
      { id: 'c', load: 100, reps: 6, done: true },
      { id: 'd', load: 110, reps: 3, done: false },
    ]
    const t = templateFromSession(s)
    expect(t.name).toBe('Jambes')
    expect(t.id).not.toBe('t')
    const p = t.blocks[0].kind === 'classic' ? t.blocks[0].exercises[0] : undefined
    expect(p).toMatchObject({ exerciseId: 'squat', sets: 3, repsMin: 4, repsMax: 6, targetLoad: 100, targetRpe: 8 })
    expect(t.blocks[1]).toMatchObject({ kind: 'wod', format: { type: 'amrap', durationSec: 600 } })
  })
})
