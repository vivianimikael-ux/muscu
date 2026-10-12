import type { Table } from 'dexie'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Doc } from '../domain/types'

/**
 * Document chargé une fois puis édité localement, chaque modification étant
 * enregistrée immédiatement (rien à perdre si l'app est fermée en pleine
 * séance). `mutate` applique une fonction sur une copie : plusieurs appels
 * dans le même tick se composent correctement grâce à la ref.
 *
 * doc vaut undefined pendant le chargement, null si introuvable.
 */
export function useEditableDoc<T extends Doc>(table: Table<T, string>, id: string | undefined) {
  const [doc, setDoc] = useState<T | null | undefined>(undefined)
  const ref = useRef<T | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    if (!id) return
    void table.get(id).then((d) => {
      if (!active) return
      const found = d && !d.deleted ? d : null
      ref.current = found
      setDoc(found)
    })
    return () => {
      active = false
    }
  }, [table, id])

  const mutate = useCallback(
    (fn: (draft: T) => void) => {
      const cur = ref.current
      if (!cur) return
      const next = structuredClone(cur)
      fn(next)
      next.updatedAt = Date.now()
      ref.current = next
      setDoc(next)
      void table.put(next)
    },
    [table],
  )

  return [doc, mutate] as const
}

/** Déplace un élément d'un cran dans un tableau (en place). */
export function moveItem<T>(arr: T[], index: number, delta: -1 | 1): void {
  const j = index + delta
  if (j < 0 || j >= arr.length) return
  ;[arr[index], arr[j]] = [arr[j], arr[index]]
}
