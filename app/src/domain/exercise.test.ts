import { describe, expect, it } from 'vitest'
import { describeSets } from './exercise'

describe('describeSets', () => {
  it('regroupe les séries identiques consécutives, charge en kg', () => {
    const s = { load: 15, reps: 6 }
    expect(describeSets('barbell', [s, s, s, s])).toBe('4 séries 15kg×6')
  })

  it('pyramide : groupes dans l’ordre, RPE et décimales à la française', () => {
    expect(describeSets('barbell', [{ load: 80, reps: 6 }, { load: 102.5, reps: 3, rpe: 8 }, { load: 102.5, reps: 3, rpe: 8 }])).toBe(
      '80kg×6, 2 séries 102,5kg×3 @8',
    )
  })

  it('sans RPE sur demande : séries de RPE différents regroupées', () => {
    expect(describeSets('barbell', [{ load: 100, reps: 5, rpe: 7 }, { load: 100, reps: 5, rpe: 8 }], { rpe: false })).toBe('2 séries 100kg×5')
  })

  it('poids du corps : PDC, avec ou sans lest', () => {
    expect(describeSets('bodyweight', [{ load: 0, reps: 8 }, { load: 10, reps: 5 }])).toBe('PDC×8, PDC+10kg×5')
  })

  it('isométrie importée (charge sans reps) : la charge seule', () => {
    expect(describeSets('barbell', [{ load: 90 }, { load: 90 }])).toBe('2 séries 90kg')
  })

  it('mesures sans charge : quantité dans son unité', () => {
    expect(describeSets('distance', [{ reps: 45 }, { reps: 45 }])).toBe('2 séries 45 m')
  })
})
