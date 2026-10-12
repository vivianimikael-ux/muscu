// Synchronisation Dexie ⇄ Supabase (SPECS.md §10.1).
//
// Principe : l'app lit/écrit toujours en local ; la synchro tourne en tâche
// de fond, en deux temps par collection :
//   1. PULL : récupère les lignes modifiées côté serveur depuis le dernier
//      curseur (server_updated_at) et garde, document par document, la
//      version la plus récente (last-write-wins sur updatedAt).
//   2. PUSH : envoie les documents locaux modifiés depuis la dernière synchro.
// Faire le pull avant le push évite d'écraser une version plus récente
// venue d'un autre appareil. Mono-utilisateur : pas de fusion plus fine.

import type { Table } from 'dexie'
import { db } from '../db/db'
import type { Doc } from '../domain/types'
import { supabase } from './supabase'

const COLLECTIONS: { local: Table<Doc, string>; remote: string }[] = [
  { local: db.exercises as unknown as Table<Doc, string>, remote: 'exercises' },
  { local: db.templates as unknown as Table<Doc, string>, remote: 'templates' },
  { local: db.sessions as unknown as Table<Doc, string>, remote: 'sessions' },
  { local: db.maxTests as unknown as Table<Doc, string>, remote: 'max_tests' },
  { local: db.bodyweights as unknown as Table<Doc, string>, remote: 'bodyweights' },
  { local: db.programs as unknown as Table<Doc, string>, remote: 'programs' },
]

// Un upsert pose le même server_updated_at sur toutes ses lignes : avec des
// lots plus petits qu'une page, un groupe de même horodatage tient toujours
// dans une page, ce qui garantit que la pagination (>=) progresse.
const PUSH_BATCH = 500
const PULL_PAGE = 1000

const META_LAST_PUSH = 'sync:lastPush'
const metaLastPull = (table: string) => `sync:lastPull:${table}`

// ---------------------------------------------------------------------------
// État observable (affiché dans les réglages)

export type SyncStatus = 'signed_out' | 'idle' | 'syncing' | 'error' | 'offline'

export interface SyncState {
  status: SyncStatus
  email?: string
  lastSyncAt?: number
  error?: string
}

let state: SyncState = { status: 'signed_out' }
const listeners = new Set<() => void>()

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export const syncStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  },
  get: () => state,
}

// ---------------------------------------------------------------------------
// Moteur

async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

const setMeta = (key: string, value: unknown) => db.meta.put({ key, value })

interface RemoteRow {
  id: string
  updated_at: number
  deleted: boolean
  data: Doc
  server_updated_at: string
}

/** Écritures locales issues du serveur : ne doivent pas redéclencher une synchro. */
let applyingRemote = false

async function pull(c: (typeof COLLECTIONS)[number]): Promise<Map<string, number>> {
  const key = metaLastPull(c.remote)
  let cursor = (await getMeta<string>(key)) ?? '1970-01-01T00:00:00Z'
  const pulled = new Map<string, number>()
  for (;;) {
    const { data, error } = await supabase
      .from(c.remote)
      .select('id, updated_at, deleted, data, server_updated_at')
      .gte('server_updated_at', cursor)
      .order('server_updated_at')
      .limit(PULL_PAGE)
    if (error) throw error
    const rows = data as RemoteRow[]
    if (rows.length === 0) break
    applyingRemote = true
    try {
      await db.transaction('rw', c.local, async () => {
        for (const row of rows) {
          const local = await c.local.get(row.id)
          if (!local || row.updated_at > local.updatedAt) {
            await c.local.put({ ...row.data, id: row.id, updatedAt: row.updated_at, deleted: row.deleted || undefined })
            pulled.set(row.id, row.updated_at)
          }
        }
      })
    } finally {
      applyingRemote = false
    }
    cursor = rows[rows.length - 1].server_updated_at
    await setMeta(key, cursor)
    if (rows.length < PULL_PAGE) break
  }
  return pulled
}

async function push(c: (typeof COLLECTIONS)[number], since: number, justPulled: Map<string, number>): Promise<void> {
  const docs = await c.local.where('updatedAt').above(since).toArray()
  const rows = docs
    // Inutile de renvoyer ce qu'on vient de recevoir.
    .filter((d) => justPulled.get(d.id) !== d.updatedAt)
    .map((d) => ({ id: d.id, updated_at: d.updatedAt, deleted: d.deleted ?? false, data: d }))
  for (let i = 0; i < rows.length; i += PUSH_BATCH) {
    const { error } = await supabase.from(c.remote).upsert(rows.slice(i, i + PUSH_BATCH), { onConflict: 'user_id,id' })
    if (error) throw error
  }
}

async function syncOnce(): Promise<void> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) {
    setState({ status: 'signed_out', email: undefined })
    return
  }
  if (!navigator.onLine) {
    setState({ status: 'offline' })
    return
  }
  setState({ status: 'syncing', error: undefined })
  try {
    // Les documents modifiés pendant la synchro auront un updatedAt ≥ start
    // et partiront à la suivante.
    const start = Date.now()
    const lastPush = (await getMeta<number>(META_LAST_PUSH)) ?? 0
    for (const c of COLLECTIONS) {
      const pulled = await pull(c)
      await push(c, lastPush, pulled)
    }
    await setMeta(META_LAST_PUSH, start - 1)
    setState({ status: 'idle', lastSyncAt: Date.now() })
  } catch (e) {
    setState({ status: 'error', error: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) })
  }
}

let running: Promise<void> | undefined
let rerun = false
let timer: ReturnType<typeof setTimeout> | undefined

/** Lance une synchro ; si une est déjà en cours, en enchaîne une autre ensuite. */
export function syncNow(): Promise<void> {
  if (running) {
    rerun = true
    return running
  }
  running = (async () => {
    try {
      do {
        rerun = false
        await syncOnce()
      } while (rerun)
    } finally {
      running = undefined
    }
  })()
  return running
}

/** Synchro différée : regroupe les modifications rapprochées (saisie en séance). */
export function scheduleSync(delayMs = 3000): void {
  if (state.status === 'signed_out') return
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), delayMs)
}

/** Oublie les curseurs : la prochaine connexion refera un échange complet. */
export async function resetSyncCursors(): Promise<void> {
  await db.meta.where('key').startsWith('sync:').delete()
}

let initialized = false

export function initSync(): void {
  if (initialized) return
  initialized = true

  for (const c of COLLECTIONS) {
    c.local.hook('creating', () => {
      if (!applyingRemote) scheduleSync()
    })
    c.local.hook('updating', () => {
      if (!applyingRemote) scheduleSync()
    })
  }

  // Pas d'appel Supabase directement dans ce callback (risque d'interblocage
  // documenté) : scheduleSync passe par un setTimeout.
  supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      setState({ status: 'signed_out', email: undefined })
      return
    }
    const wasSignedOut = state.status === 'signed_out'
    setState({ email: session.user.email, ...(wasSignedOut ? { status: 'idle' } : {}) })
    if (wasSignedOut) scheduleSync(0)
  })

  window.addEventListener('online', () => scheduleSync(0))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(0)
  })
  setInterval(() => scheduleSync(0), 5 * 60_000)
}
