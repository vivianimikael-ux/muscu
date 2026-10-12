import { db, live, save } from '../db/db'
import { isDone, sessionTime } from '../domain/stats'
import { emptySession, sessionFromTemplate } from '../domain/session'
import type { Session, SetLog } from '../domain/types'

/** Séries faites lors de la dernière séance terminée contenant chaque exercice. */
export async function lastSetsByExercise(excludeSessionId?: string): Promise<Map<string, SetLog[]>> {
  const sessions = live(await db.sessions.toArray())
    .filter((s) => isDone(s) && s.id !== excludeSessionId)
    .sort((a, b) => sessionTime(b) - sessionTime(a))
  const out = new Map<string, SetLog[]>()
  for (const s of sessions) {
    const inSession = new Map<string, SetLog[]>()
    for (const b of s.blocks) {
      if (b.kind !== 'classic') continue
      for (const ex of b.exercises) {
        // Séries sans reps (isométrie importée) : pas de base de pré-remplissage.
        const done = ex.sets.filter((x) => x.done && x.reps)
        if (done.length) inSession.set(ex.exerciseId, [...(inSession.get(ex.exerciseId) ?? []), ...done])
      }
    }
    for (const [id, sets] of inSession) if (!out.has(id)) out.set(id, sets)
  }
  return out
}

export async function inProgressSession(): Promise<Session | undefined> {
  return live(await db.sessions.where('status').equals('in_progress').toArray())[0]
}

/** Démarre une séance (depuis un modèle ou libre) et renvoie son id. */
export async function startSession(templateId?: string): Promise<string> {
  let session: Session
  if (templateId) {
    const t = await db.templates.get(templateId)
    if (!t) throw new Error('Modèle introuvable')
    const last = await lastSetsByExercise()
    session = sessionFromTemplate(t, (id) => last.get(id))
  } else {
    session = emptySession()
  }
  await save(db.sessions, session)
  return session.id
}
