// 1RM estimé (cf. SPECS.md §7.1) : formule d'Epley. Le RPE n'est pas
// utilisé (retiré de l'app le 2026-11-13). Les séries de plus de 10 reps
// sont ignorées : l'estimation devient trop imprécise.

export const MAX_REPS_FOR_ESTIMATE = 10

export function epley(load: number, reps: number): number {
  return reps === 1 ? load : load * (1 + reps / 30)
}

/**
 * 1RM estimé d'une série, ou undefined si la série n'est pas exploitable.
 * `load` est la charge réellement soulevée (cf. liftedLoad).
 */
export function estimate1RM(load: number | undefined, reps: number | undefined): number | undefined {
  if (load === undefined || reps === undefined) return undefined
  if (load <= 0 || reps < 1 || reps > MAX_REPS_FOR_ESTIMATE) return undefined
  return epley(load, reps)
}

/** Arrondit au pas de charge disponible (ex : 2,5 kg). */
export function roundToIncrement(kg: number, increment: number): number {
  if (increment <= 0) return Math.round(kg * 10) / 10
  return Math.round(kg / increment) * increment
}
