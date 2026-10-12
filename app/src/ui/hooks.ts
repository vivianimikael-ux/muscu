import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db, live } from '../db/db'
import type { BodyweightEntry, Exercise, Session } from '../domain/types'

/** Exercices actifs, triés par nom. */
export function useExercises(): Exercise[] | undefined {
  return useLiveQuery(async () => live(await db.exercises.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'fr')))
}

export function useExerciseMap(): Map<string, Exercise> | undefined {
  // Inclut les exercices supprimés : une ancienne séance doit toujours afficher leur nom.
  return useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e])))
}

export function useSessions(): Session[] | undefined {
  return useLiveQuery(async () => live(await db.sessions.toArray()))
}

export function useBodyweights(): BodyweightEntry[] | undefined {
  return useLiveQuery(async () => live(await db.bodyweights.toArray()))
}

/** Re-rend le composant toutes les `ms` tant que `active` est vrai. */
export function useNow(active: boolean, ms = 250): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [active, ms])
  return now
}

/** Garde l'écran allumé tant que `active` (WOD, séance en cours). */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | undefined
    let cancelled = false
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
        if (cancelled) void lock.release()
      } catch {
        // Refusé (batterie faible…) : on continue sans.
      }
    }
    // Le verrou saute quand l'app passe en arrière-plan : on le reprend au retour.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [active])
}
