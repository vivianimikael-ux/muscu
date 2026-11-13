import { db, live, save } from '../db/db'
import { emptySession, lastPerformances, sessionFromTemplate, type LastPerformance } from '../domain/session'
import type { Session } from '../domain/types'

/** Dernière performance (séries de travail + échauffements) de chaque exercice. */
export async function lastSetsByExercise(excludeSessionId?: string): Promise<Map<string, LastPerformance>> {
  return lastPerformances(live(await db.sessions.toArray()), excludeSessionId)
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
