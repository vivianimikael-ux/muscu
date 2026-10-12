// Import de données en masse (fichier JSON produit par
// scripts/notion_convert.py). Idempotent : les ids sont stables, un nouvel
// import met à jour les documents au lieu de les dupliquer.

import type { Table } from 'dexie'
import { db, live } from '../db/db'
import type { Doc, Exercise, MaxTest, Session } from '../domain/types'

interface ImportFile {
  exercises?: Omit<Exercise, 'updatedAt'>[]
  sessions?: Omit<Session, 'updatedAt'>[]
  maxTests?: Omit<MaxTest, 'updatedAt'>[]
}

/** Retire les null (JSON Python) : le modèle de l'app utilise des champs absents. */
function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripNulls) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null).map(([k, v]) => [k, stripNulls(v)])) as T
  }
  return value
}

export interface ImportResult {
  exercises: number
  sessions: number
  maxTests: number
}

export async function importFile(file: File): Promise<ImportResult> {
  let data: ImportFile
  try {
    data = stripNulls(JSON.parse(await file.text()) as ImportFile)
  } catch {
    throw new Error('Fichier illisible (JSON attendu).')
  }
  if (!Array.isArray(data.sessions) && !Array.isArray(data.exercises)) throw new Error('Fichier sans séances ni exercices.')

  const now = Date.now()
  const exercises = (data.exercises ?? []).map((e) => ({ ...e, updatedAt: now }) as Exercise)
  const sessions = (data.sessions ?? []).map((s) => ({ ...s, updatedAt: now }) as Session)
  const maxTests = (data.maxTests ?? []).map((t) => ({ ...t, updatedAt: now }) as MaxTest)

  await db.transaction('rw', db.exercises, db.sessions, db.maxTests, async () => {
    // Un exercice importé déjà présent garde les corrections faites dans l'app.
    const existing = new Set((await db.exercises.bulkGet(exercises.map((e) => e.id))).filter(Boolean).map((e) => e!.id))
    await db.exercises.bulkPut(exercises.filter((e) => !existing.has(e.id)))
    await db.sessions.bulkPut(sessions)
    await db.maxTests.bulkPut(maxTests)
  })
  return { exercises: exercises.length, sessions: sessions.length, maxTests: maxTests.length }
}

/** Annule l'import Notion : suppression logique de tout ce qu'il a créé (propagée par la synchro). */
export async function removeNotionImport(): Promise<number> {
  const softDeleteImported = async <T extends Doc>(table: Table<T, string>) => {
    const docs = live(await table.toArray()).filter((d) => d.id.startsWith('notion-'))
    await table.bulkPut(docs.map((d) => ({ ...d, deleted: true, updatedAt: Date.now() })))
    return docs.length
  }
  return db.transaction('rw', db.exercises, db.sessions, db.maxTests, async () => {
    return (await softDeleteImported(db.exercises)) + (await softDeleteImported(db.sessions)) + (await softDeleteImported(db.maxTests))
  })
}
