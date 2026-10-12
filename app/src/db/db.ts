// Base locale (IndexedDB via Dexie) : source de vérité sur l'appareil.
// L'UI lit et écrit toujours ici ; la synchro Supabase viendra par-dessus
// en poussant les documents dont updatedAt a changé (last-write-wins).

import Dexie, { type Table } from 'dexie'
import type { BodyweightEntry, Doc, Exercise, MaxTest, Session, Template } from '../domain/types'
import { SEED_EXERCISES } from './seed'

export interface Meta {
  key: string
  value: unknown
}

class MuscuDB extends Dexie {
  exercises!: Table<Exercise, string>
  templates!: Table<Template, string>
  sessions!: Table<Session, string>
  maxTests!: Table<MaxTest, string>
  bodyweights!: Table<BodyweightEntry, string>
  meta!: Table<Meta, string>

  constructor() {
    super('muscu')
    this.version(1).stores({
      exercises: 'id, updatedAt, name',
      templates: 'id, updatedAt, name',
      sessions: 'id, updatedAt, status, plannedDate, completedAt, templateId',
      maxTests: 'id, updatedAt, exerciseId, date',
      bodyweights: 'id, updatedAt, date',
      meta: 'key',
    })
  }
}

export const db = new MuscuDB()

/** Enregistre un document en mettant à jour son horodatage de synchro. */
export async function save<T extends Doc>(table: Table<T, string>, doc: T): Promise<T> {
  const stamped = { ...doc, updatedAt: Date.now() }
  await table.put(stamped)
  return stamped
}

/** Suppression logique (nécessaire pour propager la suppression à la synchro). */
export async function softDelete<T extends Doc>(table: Table<T, string>, id: string): Promise<void> {
  const doc = await table.get(id)
  if (doc) await table.put({ ...doc, deleted: true, updatedAt: Date.now() })
}

export const live = <T extends Doc>(docs: T[]) => docs.filter((d) => !d.deleted)

/** Bibliothèque d'exercices de départ, insérée une seule fois. */
export async function ensureSeeded(): Promise<void> {
  await db.transaction('rw', db.exercises, db.meta, async () => {
    if (await db.meta.get('seeded')) return
    const now = Date.now()
    await db.exercises.bulkPut(SEED_EXERCISES.map((e) => ({ ...e, updatedAt: now })))
    await db.meta.put({ key: 'seeded', value: now })
  })
}
