import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { formatDay } from '../domain/dates'
import { muscleLabel } from '../domain/exercise'
import { sessionProgress } from '../domain/session'
import { isDone, muscleVolume, sessionTime, weekStart } from '../domain/stats'
import type { Muscle } from '../domain/types'
import { Card, Empty, PageHeader, SectionTitle } from '../ui/components'
import { describeScore } from '../ui/format'
import { useBodyweights, useExerciseMap, useSessions } from '../ui/hooks'

const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })

export function HistoryPage() {
  const navigate = useNavigate()
  const sessions = useSessions()
  const exercises = useExerciseMap()
  const bodyweights = useBodyweights()

  const done = useMemo(() => (sessions ?? []).filter(isDone).sort((a, b) => sessionTime(b) - sessionTime(a)), [sessions])

  const thisWeek = useMemo(() => {
    if (!exercises) return []
    const start = weekStart(Date.now())
    const vol = muscleVolume(
      done.filter((s) => sessionTime(s) >= start),
      exercises,
      bodyweights ?? [],
    )
    return [...vol.entries()].filter(([, v]) => v.sets > 0).sort((a, b) => b[1].sets - a[1].sets) as [Muscle, { sets: number; tonnage: number }][]
  }, [done, exercises, bodyweights])

  const byMonth = useMemo(() => {
    const groups: { label: string; items: typeof done }[] = []
    for (const s of done) {
      const label = monthFormatter.format(sessionTime(s))
      if (groups[groups.length - 1]?.label !== label) groups.push({ label, items: [] })
      groups[groups.length - 1].items.push(s)
    }
    return groups
  }, [done])

  const maxSets = Math.max(1, ...thisWeek.map(([, v]) => v.sets))

  return (
    <>
      <PageHeader title="Historique" />
      <div className="px-4">
        <SectionTitle>Volume cette semaine (séries)</SectionTitle>
        {thisWeek.length === 0 ? (
          <p className="px-1 text-sm text-muted">Rien cette semaine pour l’instant.</p>
        ) : (
          <Card className="space-y-1.5">
            {thisWeek.map(([m, v]) => (
              <div key={m} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 text-sm">
                <span className="truncate">{muscleLabel(m)}</span>
                <div className="h-2.5 rounded-full bg-card-2">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(v.sets / maxSets) * 100}%` }} />
                </div>
                <span className="text-right tabular-nums">{Math.round(v.sets * 10) / 10}</span>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted">Muscle principal = 1 série, secondaire = ½. WOD inclus.</p>
          </Card>
        )}

        {done.length === 0 && <Empty>Aucune séance terminée.</Empty>}
        {byMonth.map((g) => (
          <div key={g.label}>
            <SectionTitle>{g.label}</SectionTitle>
            <div className="space-y-2">
              {g.items.map((s) => (
                <Card key={s.id} onClick={() => navigate(`/seance/${s.id}`)}>
                  <div className="flex justify-between gap-2">
                    <span className="truncate font-medium">{s.name}</span>
                    <span className="shrink-0 text-sm text-muted">{formatDay(sessionTime(s))}</span>
                  </div>
                  <div className="truncate text-sm text-muted">
                    {s.blocks
                      .map((b) =>
                        b.kind === 'classic'
                          ? b.exercises.map((e) => exercises?.get(e.exerciseId)?.name).join(', ')
                          : `WOD ${describeScore(b.score)}`,
                      )
                      .join(' · ') || `${sessionProgress(s).doneSets} séries`}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
