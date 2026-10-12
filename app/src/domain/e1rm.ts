// 1RM estimé (cf. SPECS.md §7.1).
//
// Avec RPE : table de type RTS. Un RPE donne des reps en réserve
// (RIR = 10 − RPE) ; une série de r reps à RPE x équivaut à une série à
// l'échec de (r + RIR) reps, dont on lit le % du 1RM dans la table.
// Sans RPE (ou RPE < 6, peu fiable) : formule d'Epley.
// Les séries de plus de 10 reps sont ignorées : l'estimation devient trop
// imprécise.

/** % du 1RM pour n reps à l'échec (RPE 10), index = n. */
const PCT_AT_FAILURE = [
  NaN, 1.0, 0.955, 0.922, 0.892, 0.863, 0.837, 0.811, 0.786, 0.762, 0.739, 0.717, 0.694, 0.672, 0.65,
]

export const MAX_REPS_FOR_ESTIMATE = 10
export const MIN_RELIABLE_RPE = 6

function pctAtFailure(reps: number): number {
  const lo = Math.floor(reps)
  const hi = Math.ceil(reps)
  if (lo === hi) return PCT_AT_FAILURE[lo]
  const t = reps - lo
  return PCT_AT_FAILURE[lo] * (1 - t) + PCT_AT_FAILURE[hi] * t
}

export function epley(load: number, reps: number): number {
  return reps === 1 ? load : load * (1 + reps / 30)
}

/**
 * 1RM estimé d'une série, ou undefined si la série n'est pas exploitable.
 * `load` est la charge réellement soulevée (cf. liftedLoad).
 */
export function estimate1RM(load: number | undefined, reps: number | undefined, rpe?: number): number | undefined {
  if (load === undefined || reps === undefined) return undefined
  if (load <= 0 || reps < 1 || reps > MAX_REPS_FOR_ESTIMATE) return undefined
  if (rpe !== undefined && rpe >= MIN_RELIABLE_RPE && rpe <= 10) {
    return load / pctAtFailure(reps + (10 - rpe))
  }
  return epley(load, reps)
}

/** Arrondit au pas de charge disponible (ex : 2,5 kg). */
export function roundToIncrement(kg: number, increment: number): number {
  if (increment <= 0) return Math.round(kg * 10) / 10
  return Math.round(kg / increment) * increment
}
