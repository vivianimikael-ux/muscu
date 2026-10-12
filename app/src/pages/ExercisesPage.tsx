import { useNavigate } from 'react-router'
import { db, save } from '../db/db'
import { MEASURES, muscleLabel } from '../domain/exercise'
import { uid } from '../domain/session'
import { Button, PageHeader, TextField } from '../ui/components'
import { MuscleChips, useExerciseFilter } from '../ui/ExercisePicker'

export function ExercisesPage() {
  const navigate = useNavigate()
  const { filtered, query, setQuery, muscle, setMuscle } = useExerciseFilter()

  const create = async () => {
    const id = uid()
    await save(db.exercises, {
      id,
      updatedAt: 0,
      name: query.trim() || 'Nouvel exercice',
      measure: 'barbell',
      primaryMuscles: muscle ? [muscle] : [],
      secondaryMuscles: [],
      maxReference: 'estimated',
      trainingMaxPct: 90,
    })
    navigate(`/exercices/${id}`)
  }

  return (
    <>
      <PageHeader
        title="Exercices"
        right={
          <Button variant="primary" className="px-3 py-1.5" onClick={create}>
            + Nouveau
          </Button>
        }
      />
      <div className="sticky top-14 z-10 space-y-2 bg-bg px-4 pb-2">
        <TextField value={query} onChange={setQuery} placeholder="Rechercher…" />
        <MuscleChips muscle={muscle} setMuscle={setMuscle} />
      </div>
      <ul className="divide-y divide-line px-4">
        {filtered.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => navigate(`/exercices/${e.id}`)} className="flex w-full items-baseline justify-between gap-2 py-3 text-left">
              <span>{e.name}</span>
              <span className="shrink-0 text-xs text-muted">
                {MEASURES[e.measure].label}
                {e.primaryMuscles.length ? ` · ${e.primaryMuscles.map(muscleLabel).join(', ')}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
