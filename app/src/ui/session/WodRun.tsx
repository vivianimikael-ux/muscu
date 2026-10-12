import { useEffect, useRef, useState } from 'react'
import { formatDuration, formatNumber, hasLoad, MEASURES } from '../../domain/exercise'
import type { Exercise, WodBlockLog, WodScore } from '../../domain/types'
import { timerCue, timerState, type TimerState } from '../../domain/wodTimer'
import { Button, DurationField, Label, NumberField, Sheet } from '../components'
import { describeScore, describeWodFormat } from '../format'
import { useNow, useWakeLock } from '../hooks'
import { playCue, unlockAudio } from '../sound'

type EditBlock = (fn: (b: WodBlockLog) => void) => void

function ItemsList({ block, exercises, highlight }: { block: WodBlockLog; exercises: Map<string, Exercise>; highlight?: number }) {
  return (
    <ul className="space-y-1">
      {block.items.map((it, i) => {
        const ex = exercises.get(it.exerciseId)
        const measure = ex?.measure ?? 'reps'
        return (
          <li key={it.id} className={`flex justify-between gap-2 rounded-lg px-2 py-1 ${highlight === i ? 'bg-accent/25 text-fg' : ''}`}>
            <span className="truncate">
              <span className="font-semibold tabular-nums">{it.quantity}</span>
              {MEASURES[measure].unit !== 'reps' && ` ${MEASURES[measure].unit}`} {ex?.name ?? '?'}
            </span>
            {it.load !== undefined && <span className="shrink-0 text-muted">{formatNumber(it.load)} kg</span>}
          </li>
        )
      })}
    </ul>
  )
}

/** Carte d'un bloc WOD dans la séance. */
export function WodBlockCard({ block, exercises, edit }: { block: WodBlockLog; exercises: Map<string, Exercise>; edit: EditBlock }) {
  const [scoreOpen, setScoreOpen] = useState(false)
  const running = block.startedAt !== undefined && !block.done

  return (
    <div className="rounded-2xl border border-accent/40 bg-card p-3">
      <div className="text-xs font-semibold text-accent uppercase">WOD{block.name ? ` · ${block.name}` : ''}</div>
      <div className="mb-2 text-lg font-semibold">{describeWodFormat(block.format)}</div>
      <ItemsList block={block} exercises={exercises} />

      {block.done ? (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-ok/15 px-3 py-2">
          <div>
            <div className="text-xs text-muted">Score</div>
            <div className="text-xl font-bold">{describeScore(block.score)}</div>
            {block.rpe !== undefined && <div className="text-xs text-muted">RPE {formatNumber(block.rpe)}</div>}
          </div>
          <Button variant="ghost" onClick={() => setScoreOpen(true)}>
            Modifier
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button
            variant="primary"
            className="flex-1 py-3"
            onClick={() => {
              unlockAudio()
              edit((b) => {
                b.startedAt = Date.now()
                b.finishedAt = undefined
              })
            }}
          >
            Démarrer le WOD
          </Button>
          <Button onClick={() => setScoreOpen(true)}>Saisir le score</Button>
        </div>
      )}

      {running && <WodRunner block={block} exercises={exercises} edit={edit} />}
      <Sheet open={scoreOpen} onClose={() => setScoreOpen(false)} title="Score du WOD">
        <ScoreForm block={block} exercises={exercises} edit={edit} onSaved={() => setScoreOpen(false)} />
      </Sheet>
    </div>
  )
}

/** Minuteur plein écran. Reprend tout seul après un rechargement (startedAt est enregistré). */
function WodRunner({ block, exercises, edit }: { block: WodBlockLog; exercises: Map<string, Exercise>; edit: EditBlock }) {
  const startedAt = block.startedAt!
  const [stoppedAt, setStoppedAt] = useState<number | undefined>(block.finishedAt)
  const [rounds, setRounds] = useState(0)
  const now = useNow(stoppedAt === undefined, 200)
  const state = timerState(block.format, startedAt, now, stoppedAt)
  const finished = state.phase === 'finished'
  useWakeLock(!finished)

  const prev = useRef<TimerState | undefined>(undefined)
  useEffect(() => {
    const cue = timerCue(prev.current, state)
    prev.current = state
    if (cue) playCue(cue)
  })

  const f = block.format
  let highlight: number | undefined
  if (state.round !== undefined && block.items.length > 1) {
    if ((f.type === 'emom' && f.alternate) || f.type === 'intervals') highlight = (state.round - 1) % block.items.length
  }
  const countsRounds = f.type === 'amrap' || f.type === 'for_time'

  const phaseLabel =
    state.phase === 'countdown' ? 'Prêt' : state.phase === 'rest' ? 'Repos' : state.phase === 'finished' ? 'Terminé' : 'Go'
  const phaseColor = state.phase === 'rest' ? 'text-sky-400' : state.phase === 'countdown' ? 'text-pr' : 'text-accent'

  return (
    <div className="pt-safe pb-safe fixed inset-0 z-50 flex flex-col bg-bg">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm text-muted">{describeWodFormat(f)}</span>
        {!finished && (
          <button
            type="button"
            className="text-sm text-muted"
            onClick={() => {
              if (confirm('Abandonner ce WOD ? Le minuteur sera réinitialisé.')) edit((b) => (b.startedAt = undefined))
            }}
          >
            Abandonner
          </button>
        )}
      </div>

      {finished ? (
        <div className="flex-1 overflow-y-auto px-4">
          <div className="mb-4 text-center">
            <div className="text-sm text-muted uppercase">Terminé</div>
            {f.type === 'for_time' && <div className="text-5xl font-bold tabular-nums">{formatDuration(state.elapsed)}</div>}
          </div>
          <ScoreForm block={block} exercises={exercises} edit={edit} timer={state} countedRounds={rounds} />
        </div>
      ) : (
        <>
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <div className={`text-2xl font-bold uppercase ${phaseColor}`}>{phaseLabel}</div>
            <div className="text-[28vw] leading-none font-bold tabular-nums sm:text-[9rem]">
              {state.phase === 'countdown'
                ? state.display
                : formatDuration(f.type === 'for_time' ? Math.floor(state.display) : Math.ceil(state.display))}
            </div>
            {state.round !== undefined && (
              <div className="text-xl text-muted">
                {f.type === 'intervals' ? 'Cycle' : 'Intervalle'} {state.round}/{state.totalRounds}
              </div>
            )}
            {countsRounds && state.phase !== 'countdown' && <div className="mt-2 text-xl">Tours : {rounds}</div>}
            <div className="mt-6 w-full max-w-md">
              <ItemsList block={block} exercises={exercises} highlight={highlight} />
            </div>
          </div>
          <div className="flex gap-2 px-4 pb-4">
            {countsRounds && (
              <Button variant="secondary" className="flex-1 py-5 text-xl" onClick={() => setRounds((r) => r + 1)} disabled={state.phase === 'countdown'}>
                +1 tour
              </Button>
            )}
            <Button
              variant="primary"
              className="flex-1 py-5 text-xl"
              onClick={() => {
                const t = Date.now()
                setStoppedAt(t)
                edit((b) => (b.finishedAt = t))
              }}
            >
              {f.type === 'for_time' ? 'Terminé !' : 'Arrêter'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

/** Score pré-rempli à partir du minuteur quand il y en a un. */
function initialScore(block: WodBlockLog, timer: TimerState | undefined, countedRounds: number): WodScore {
  if (block.score) return block.score
  const f = block.format
  switch (f.type) {
    case 'for_time': {
      const capped = f.capSec !== undefined && timer !== undefined && timer.elapsed >= f.capSec
      if (capped) return { type: 'rounds', rounds: countedRounds, reps: 0 }
      return { type: 'time', sec: Math.round(timer?.elapsed ?? 0) }
    }
    case 'amrap':
      return { type: 'rounds', rounds: countedRounds, reps: 0 }
    case 'emom':
      return { type: 'intervals', held: f.intervals, total: f.intervals }
    case 'intervals':
      return { type: 'reps', perInterval: Array.from({ length: f.cycles }, () => 0) }
  }
}

function ScoreForm({
  block,
  exercises,
  edit,
  timer,
  countedRounds = 0,
  onSaved,
}: {
  block: WodBlockLog
  exercises: Map<string, Exercise>
  edit: EditBlock
  timer?: TimerState
  countedRounds?: number
  onSaved?: () => void
}) {
  const [score, setScore] = useState<WodScore>(() => initialScore(block, timer, countedRounds))
  const [loads, setLoads] = useState(() => block.items.map((it) => it.load))
  const [rpe, setRpe] = useState(block.rpe)
  const f = block.format

  const save = () => {
    edit((b) => {
      b.score = score
      b.rpe = rpe
      b.items.forEach((it, i) => (it.load = loads[i]))
      b.done = true
      b.finishedAt ??= Date.now()
    })
    onSaved?.()
  }

  return (
    <div className="space-y-4">
      {f.type === 'for_time' && (
        <div className="flex gap-2">
          <Button variant={score.type === 'time' ? 'primary' : 'secondary'} className="flex-1" onClick={() => setScore({ type: 'time', sec: timer ? Math.round(timer.elapsed) : 0 })}>
            Fini (temps)
          </Button>
          <Button variant={score.type === 'rounds' ? 'primary' : 'secondary'} className="flex-1" onClick={() => setScore({ type: 'rounds', rounds: countedRounds, reps: 0 })}>
            Time cap (tours)
          </Button>
        </div>
      )}

      {score.type === 'time' && (
        <label className="block">
          <Label>Temps (m:ss)</Label>
          <DurationField plainUnit="min" value={score.sec} onChange={(v) => setScore({ type: 'time', sec: v ?? 0 })} className="text-2xl" />
        </label>
      )}
      {score.type === 'rounds' && (
        <div className="grid grid-cols-2 gap-2">
          <label>
            <Label>Tours complets</Label>
            <NumberField decimal={false} value={score.rounds} onChange={(v) => setScore({ ...score, rounds: v ?? 0 })} className="text-2xl" />
          </label>
          <label>
            <Label>+ reps</Label>
            <NumberField decimal={false} value={score.reps} onChange={(v) => setScore({ ...score, reps: v ?? 0 })} className="text-2xl" />
          </label>
        </div>
      )}
      {score.type === 'intervals' && (
        <label className="block">
          <Label>Intervalles tenus (sur {score.total})</Label>
          <NumberField
            decimal={false}
            value={score.held}
            onChange={(v) => setScore({ ...score, held: Math.min(score.total, Math.max(0, v ?? 0)) })}
            className="text-2xl"
          />
        </label>
      )}
      {score.type === 'reps' && (
        <div>
          <Label>Reps par intervalle</Label>
          <div className="grid grid-cols-4 gap-2">
            {score.perInterval.map((r, i) => (
              <NumberField
                key={i}
                ariaLabel={`Intervalle ${i + 1}`}
                decimal={false}
                value={r}
                onChange={(v) => setScore({ type: 'reps', perInterval: score.perInterval.map((x, j) => (j === i ? (v ?? 0) : x)) })}
              />
            ))}
          </div>
        </div>
      )}

      {block.items.some((it) => hasLoad(exercises.get(it.exerciseId)?.measure ?? 'reps')) && (
        <div>
          <Label>Charges utilisées</Label>
          <div className="space-y-2">
            {block.items.map((it, i) => {
              const ex = exercises.get(it.exerciseId)
              if (!ex || !hasLoad(ex.measure)) return null
              return (
                <div key={it.id} className="flex items-center gap-2">
                  <span className="flex-1 truncate">{ex.name}</span>
                  <div className="w-24">
                    <NumberField value={loads[i]} placeholder="kg" onChange={(v) => setLoads(loads.map((x, j) => (j === i ? v : x)))} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <label className="block">
        <Label>RPE global</Label>
        <NumberField value={rpe} placeholder="–" onChange={setRpe} />
      </label>

      <Button variant="primary" className="w-full py-3.5 text-lg" onClick={save}>
        Enregistrer le score
      </Button>
    </div>
  )
}
