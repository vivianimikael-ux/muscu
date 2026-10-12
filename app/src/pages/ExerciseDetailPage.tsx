import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db, live, save, softDelete } from '../db/db'
import { formatDay, localDay, parseDay } from '../domain/dates'
import { formatKg, formatMax, formatNumber, formatQuantity, hasLoad, incrementOf, isStrengthMeasure, MEASURES, MEASURE_TYPES, MUSCLES } from '../domain/exercise'
import { uid } from '../domain/session'
import { computeRecords, exerciseHistory } from '../domain/stats'
import type { Exercise, MaxReference, Muscle } from '../domain/types'
import { Button, Card, Empty, Label, NumberField, PageHeader, SectionTitle, Select, TextField } from '../ui/components'
import { useBodyweights, useSessions } from '../ui/hooks'
import { useEditableDoc } from '../ui/useEditableDoc'

const MAX_REFS: { value: MaxReference; label: string }[] = [
  { value: 'estimated', label: '1RM estimé' },
  { value: 'real', label: '1RM réel (testé)' },
  { value: 'training', label: 'Training max' },
]

export function ExerciseDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [ex, mutate] = useEditableDoc(db.exercises, id)
  const sessions = useSessions()
  const bodyweights = useBodyweights()
  const maxTests = useLiveQuery(async () => live(await db.maxTests.where('exerciseId').equals(id ?? '').toArray()), [id])

  const history = useMemo(() => (ex && sessions ? exerciseHistory(ex, sessions, bodyweights ?? []) : []), [ex, sessions, bodyweights])
  const records = useMemo(() => (ex ? computeRecords(ex, history, bodyweights ?? []) : undefined), [ex, history, bodyweights])

  if (ex === undefined) return null
  if (ex === null) return <Empty>Exercice introuvable.</Empty>

  const strength = isStrengthMeasure(ex.measure)
  const chartData = [...history]
    .reverse()
    .map((p) => ({ t: p.time, value: strength ? (p.bestE1rm ?? null) : (p.topQty ?? null) }))
    .filter((d) => d.value !== null)
    .map((d) => ({ ...d, value: Math.round((d.value as number) * 10) / 10 }))
  const realMax = [...(maxTests ?? [])].sort((a, b) => b.load - a.load)[0]

  return (
    <>
      <PageHeader title={ex.name} back />
      <div className="px-4">
        {/* Progression */}
        {chartData.length >= 2 && (
          <Card className="h-56 px-1 pt-3 pb-1">
            <div className="px-3 text-xs text-muted">{strength ? `1RM estimé${ex.measure === 'bodyweight' ? ' en lest' : ''} (meilleure série de chaque séance)` : 'Meilleure série'}</div>
            <ResponsiveContainer width="100%" height="90%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="#263041" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  scale="time"
                  tickFormatter={(t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  stroke="#8a95a8"
                  fontSize={11}
                />
                <YAxis domain={['auto', 'auto']} stroke="#8a95a8" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: '#1c2431', border: 'none', borderRadius: 8 }}
                  labelFormatter={(t) => formatDay(Number(t))}
                  formatter={(v) => [strength ? formatMax(ex.measure, Number(v)) : formatQuantity(ex.measure, Number(v)), '']}
                />
                <Line type="monotone" dataKey="value" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: '#f97316' }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Records */}
        {records && (strength ? records.bestE1rm || records.repMax.size > 0 || realMax : records.bestQty) && (
          <>
            <SectionTitle>Records</SectionTitle>
            <Card>
              {strength ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-muted">1RM estimé</div>
                      <div className="text-2xl font-bold">{formatMax(ex.measure, records.bestE1rm?.value)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">1RM réel</div>
                      <div className="text-2xl font-bold">{formatMax(ex.measure, realMax?.load)}</div>
                    </div>
                  </div>
                  {records.repMax.size > 0 && (
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center text-sm">
                      {[...records.repMax.entries()].map(([reps, r]) => (
                        <div key={reps} className="rounded-lg bg-card-2 py-1.5">
                          <div className="text-xs text-muted">{reps} rep{reps > 1 ? 's' : ''}</div>
                          <div className="font-semibold">{formatNumber(r.value)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-muted">Meilleure charge pour au moins n reps ({MEASURES[ex.measure].loadLabel}). Blocs classiques uniquement.</p>
                </>
              ) : (
                <div className="text-2xl font-bold">{records.bestQty ? formatQuantity(ex.measure, records.bestQty.value) : '–'}</div>
              )}
            </Card>
          </>
        )}

        {strength && <MaxTestsSection exercise={ex} tests={maxTests ?? []} />}

        {/* Historique */}
        <SectionTitle>Historique</SectionTitle>
        {history.length === 0 ? (
          <p className="px-1 text-sm text-muted">Pas encore fait en bloc classique.</p>
        ) : (
          <div className="space-y-2">
            {history.slice(0, 15).map((p) => (
              <Card key={p.sessionId} onClick={() => navigate(`/seance/${p.sessionId}`)} className="py-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">{formatDay(p.time)}</span>
                  {p.bestE1rm !== undefined && <span className="text-muted">1RM est. {formatMax(ex.measure, p.bestE1rm)}</span>}
                </div>
                <div className="text-sm">
                  {p.sets
                    .map((s) =>
                      hasLoad(ex.measure)
                        ? `${s.load !== undefined ? formatNumber(s.load) : '–'}×${s.reps ?? '–'}${s.rpe ? ` @${formatNumber(s.rpe)}` : ''}`
                        : formatQuantity(ex.measure, s.reps),
                    )
                    .join(' · ')}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Réglages de l'exercice */}
        <SectionTitle>Réglages</SectionTitle>
        <Card className="space-y-4">
          <label className="block">
            <Label>Nom</Label>
            <TextField value={ex.name} onChange={(name) => mutate((e) => void (e.name = name))} />
          </label>
          <label className="block">
            <Label>Type de mesure</Label>
            <Select
              value={ex.measure}
              onChange={(m) => mutate((e) => void (e.measure = m))}
              options={MEASURE_TYPES.map((m) => ({ value: m, label: MEASURES[m].label }))}
            />
          </label>
          <div>
            <Label>Muscles (toucher : principal → secondaire → aucun)</Label>
            <MuscleEditor exercise={ex} onChange={(primary, secondary) =>
                mutate((e) => {
                  e.primaryMuscles = primary
                  e.secondaryMuscles = secondary
                })
              }
            />
          </div>
          {hasLoad(ex.measure) && (
            <div className="grid grid-cols-2 gap-3">
              <label>
                <Label>Incrément (kg)</Label>
                <NumberField value={ex.increment} placeholder={String(incrementOf({ ...ex, increment: undefined })).replace('.', ',')} onChange={(v) => mutate((e) => void (e.increment = v))} />
              </label>
              {strength && (
                <label>
                  <Label>Max de référence</Label>
                  <Select value={ex.maxReference} onChange={(v) => mutate((e) => void (e.maxReference = v))} options={MAX_REFS} />
                </label>
              )}
              {strength && ex.maxReference === 'training' && (
                <label>
                  <Label>Training max (%)</Label>
                  <NumberField value={ex.trainingMaxPct} onChange={(v) => mutate((e) => void (e.trainingMaxPct = v ?? 90))} />
                </label>
              )}
            </div>
          )}
          <Button
            variant="danger"
            className="w-full"
            onClick={async () => {
              if (!confirm(`Supprimer « ${ex.name} » de la bibliothèque ? L’historique est conservé.`)) return
              await softDelete(db.exercises, ex.id)
              navigate('/exercices', { replace: true })
            }}
          >
            Supprimer l’exercice
          </Button>
        </Card>
      </div>
    </>
  )
}

function MuscleEditor({ exercise, onChange }: { exercise: Exercise; onChange: (primary: Muscle[], secondary: Muscle[]) => void }) {
  const cycle = (m: Muscle) => {
    const primary = exercise.primaryMuscles.filter((x) => x !== m)
    const secondary = exercise.secondaryMuscles.filter((x) => x !== m)
    if (exercise.primaryMuscles.includes(m)) secondary.push(m)
    else if (!exercise.secondaryMuscles.includes(m)) primary.push(m)
    onChange(primary, secondary)
  }
  return (
    <div className="flex flex-wrap gap-2">
      {MUSCLES.map((m) => {
        const state = exercise.primaryMuscles.includes(m.id) ? 'primary' : exercise.secondaryMuscles.includes(m.id) ? 'secondary' : 'none'
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => cycle(m.id)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              state === 'primary' ? 'bg-accent text-white' : state === 'secondary' ? 'bg-accent/25 text-accent' : 'bg-card-2 text-muted'
            }`}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}

function MaxTestsSection({ exercise, tests }: { exercise: Exercise; tests: { id: string; date: string; load: number }[] }) {
  const [load, setLoad] = useState<number>()
  const [date, setDate] = useState(localDay())
  const sorted = [...tests].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <>
      <SectionTitle>Max réels testés</SectionTitle>
      <Card className="space-y-3">
        <div className="flex items-end gap-2">
          <label className="flex-1">
            <Label>Date</Label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg bg-card-2 px-2 py-2 text-fg outline-none [color-scheme:dark]"
            />
          </label>
          <label className="w-24">
            <Label>{MEASURES[exercise.measure].loadLabel}</Label>
            <NumberField value={load} onChange={setLoad} />
          </label>
          <Button
            variant="primary"
            disabled={load === undefined || !date}
            onClick={async () => {
              if (load === undefined) return
              await save(db.maxTests, { id: uid(), updatedAt: 0, exerciseId: exercise.id, date, load })
              setLoad(undefined)
            }}
          >
            Ajouter
          </Button>
        </div>
        {sorted.map((t) => (
          <div key={t.id} className="flex items-center justify-between text-sm">
            <span className="text-muted">{formatDay(parseDay(t.date))}</span>
            <span className="flex items-center gap-3">
              <span className="font-semibold">{formatKg(t.load)}</span>
              <button type="button" className="text-muted" onClick={() => void softDelete(db.maxTests, t.id)} aria-label="Supprimer">
                ✕
              </button>
            </span>
          </div>
        ))}
      </Card>
    </>
  )
}
