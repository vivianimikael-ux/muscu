import { useMemo, useState } from 'react'
import { db, save } from '../db/db'
import { MEASURES, MEASURE_TYPES, MUSCLES, muscleLabel } from '../domain/exercise'
import { uid } from '../domain/session'
import type { MeasureType, Muscle } from '../domain/types'
import { Button, Chip, Select, Sheet, TextField } from './components'
import { useExercises } from './hooks'

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Liste filtrable d'exercices, réutilisée par le sélecteur et la bibliothèque. */
export function useExerciseFilter() {
  const exercises = useExercises()
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<Muscle | undefined>()
  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    return (exercises ?? []).filter(
      (e) =>
        (!q || normalize(e.name).includes(q)) &&
        (!muscle || e.primaryMuscles.includes(muscle) || e.secondaryMuscles.includes(muscle)),
    )
  }, [exercises, query, muscle])
  return { exercises, filtered, query, setQuery, muscle, setMuscle }
}

export function MuscleChips({ muscle, setMuscle }: { muscle: Muscle | undefined; setMuscle: (m: Muscle | undefined) => void }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      <Chip active={!muscle} onClick={() => setMuscle(undefined)}>
        Tous
      </Chip>
      {MUSCLES.map((m) => (
        <Chip key={m.id} active={muscle === m.id} onClick={() => setMuscle(muscle === m.id ? undefined : m.id)}>
          {m.label}
        </Chip>
      ))}
    </div>
  )
}

export function ExercisePicker({
  open,
  onClose,
  onPick,
  title = 'Choisir un exercice',
}: {
  open: boolean
  onClose: () => void
  onPick: (exerciseId: string) => void
  title?: string
}) {
  const { exercises, filtered, query, setQuery, muscle, setMuscle } = useExerciseFilter()
  const exactMatch = (exercises ?? []).some((e) => normalize(e.name) === normalize(query.trim()))
  const [newMeasure, setNewMeasure] = useState<MeasureType>('barbell')

  const pick = (id: string) => {
    onPick(id)
    setQuery('')
    onClose()
  }

  const create = async () => {
    const id = uid()
    await save(db.exercises, {
      id,
      updatedAt: 0,
      name: query.trim(),
      measure: newMeasure,
      primaryMuscles: muscle ? [muscle] : [],
      secondaryMuscles: [],
      maxReference: 'estimated',
      trainingMaxPct: 90,
    })
    pick(id)
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="sticky top-0 z-10 -mx-4 space-y-2 bg-card px-4 pb-2">
        <TextField value={query} onChange={setQuery} placeholder="Rechercher…" />
        <MuscleChips muscle={muscle} setMuscle={setMuscle} />
      </div>
      <ul className="divide-y divide-line">
        {filtered.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => pick(e.id)} className="flex w-full items-baseline justify-between gap-2 py-3 text-left">
              <span>{e.name}</span>
              <span className="shrink-0 text-xs text-muted">
                {MEASURES[e.measure].label}
                {e.primaryMuscles[0] ? ` · ${muscleLabel(e.primaryMuscles[0])}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {query.trim() && !exactMatch && (
        <div className="mt-3 space-y-2 rounded-xl bg-card-2 p-3">
          <p className="text-sm">Créer « {query.trim()} »</p>
          <div className="flex gap-2">
            <Select
              value={newMeasure}
              onChange={setNewMeasure}
              options={MEASURE_TYPES.map((m) => ({ value: m, label: MEASURES[m].label }))}
              className="bg-card"
            />
            <Button variant="primary" onClick={create}>
              Créer
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
