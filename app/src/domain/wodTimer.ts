// Moteur des minuteurs WOD. Fonction PURE de (format, départ, maintenant) :
// l'affichage est recalculé à partir des horodatages, jamais en comptant des
// ticks — iOS bride les timers JS en arrière-plan, mais l'heure reste juste.

import type { WodFormat } from './types'

/** Compte à rebours avant le départ (le temps de poser le téléphone). */
export const COUNTDOWN_SEC = 10

export type TimerPhase = 'countdown' | 'work' | 'rest' | 'finished'

export interface TimerState {
  phase: TimerPhase
  /** Secondes écoulées depuis le "Go" (négatif pendant le compte à rebours). */
  elapsed: number
  /** Secondes restantes avant la fin de la phase courante, arrondies au supérieur (absent pour un For Time sans cap). */
  remaining?: number
  /** Valeur principale à afficher, en secondes. */
  display: number
  /** Intervalle / cycle courant, 1-based (EMOM, intervalles). */
  round?: number
  totalRounds?: number
}

/** Durée totale du WOD en secondes, ou undefined si illimitée (For Time sans cap). */
export function wodDuration(f: WodFormat): number | undefined {
  switch (f.type) {
    case 'for_time':
      return f.capSec
    case 'amrap':
      return f.durationSec
    case 'emom':
      return f.intervalSec * f.intervals
    case 'intervals':
      // Pas de repos après le dernier cycle de travail.
      return f.cycles * (f.workSec + f.restSec) - f.restSec
  }
}

export function timerState(f: WodFormat, startedAt: number, now: number, finishedAt?: number): TimerState {
  const t = ((finishedAt ?? now) - startedAt) / 1000 - COUNTDOWN_SEC
  if (t < 0) {
    const remaining = Math.ceil(-t)
    return { phase: 'countdown', elapsed: t, remaining, display: remaining }
  }
  const total = wodDuration(f)
  if (finishedAt !== undefined || (total !== undefined && t >= total)) {
    const elapsed = total !== undefined ? Math.min(t, total) : t
    return { phase: 'finished', elapsed, display: f.type === 'for_time' ? elapsed : 0 }
  }

  switch (f.type) {
    case 'for_time': {
      const remaining = f.capSec !== undefined ? Math.ceil(f.capSec - t) : undefined
      return { phase: 'work', elapsed: t, remaining, display: t }
    }
    case 'amrap': {
      const remaining = Math.ceil(f.durationSec - t)
      return { phase: 'work', elapsed: t, remaining, display: f.durationSec - t }
    }
    case 'emom': {
      const idx = Math.floor(t / f.intervalSec)
      const left = f.intervalSec - (t - idx * f.intervalSec)
      return { phase: 'work', elapsed: t, remaining: Math.ceil(left), display: left, round: idx + 1, totalRounds: f.intervals }
    }
    case 'intervals': {
      const cycle = f.workSec + f.restSec
      const idx = Math.floor(t / cycle)
      const within = t - idx * cycle
      const working = within < f.workSec
      const left = working ? f.workSec - within : cycle - within
      return {
        phase: working ? 'work' : 'rest',
        elapsed: t,
        remaining: Math.ceil(left),
        display: left,
        round: idx + 1,
        totalRounds: f.cycles,
      }
    }
  }
}

export type TimerCue = 'tick' | 'go' | 'rest' | 'end'

/**
 * Signal sonore à jouer en passant de prev à next :
 * - go / rest / end au changement de phase ou d'intervalle,
 * - tick sur les 3 dernières secondes d'une phase.
 */
export function timerCue(prev: TimerState | undefined, next: TimerState): TimerCue | null {
  if (!prev) return null
  if (next.phase === 'finished') return prev.phase === 'finished' ? null : 'end'
  const phaseChanged = prev.phase !== next.phase || prev.round !== next.round
  if (phaseChanged) return next.phase === 'rest' ? 'rest' : 'go'
  if (next.remaining !== undefined && next.remaining !== prev.remaining && next.remaining >= 1 && next.remaining <= 3) {
    return 'tick'
  }
  return null
}
