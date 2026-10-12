import { formatKg, formatNumber, formatQuantity, hasLoad, isStrengthMeasure, MEASURES } from '../../domain/exercise'
import { nextSet } from '../../domain/session'
import { isPR, setPR, type ExercisePerformance, type ExerciseRecords } from '../../domain/stats'
import type { ClassicExerciseLog, Exercise, SetLog } from '../../domain/types'
import { NumberField } from '../components'
import { unlockAudio } from '../sound'

export interface ExerciseContext {
  /** Records établis AVANT cette séance. */
  records: ExerciseRecords
  last?: ExercisePerformance
}

function describeTarget(log: ClassicExerciseLog, ex: Exercise): string {
  const t = log.target
  if (!t) return ''
  const unit = MEASURES[ex.measure].unit
  const reps = t.repsMin === t.repsMax ? `${t.repsMin}` : `${t.repsMin}–${t.repsMax}`
  const parts = [`${log.sets.length} × ${reps}${unit === 'reps' ? '' : ` ${unit}`}`]
  if (t.targetLoad !== undefined) parts.push(formatKg(t.targetLoad))
  if (t.targetRpe !== undefined) parts.push(`RPE ${formatNumber(t.targetRpe)}`)
  return parts.join(' · ')
}

function describeSet(ex: Exercise, s: SetLog): string {
  if (hasLoad(ex.measure)) return `${s.load !== undefined ? formatNumber(s.load) : '–'}×${s.reps ?? '–'}${s.rpe ? `@${formatNumber(s.rpe)}` : ''}`
  return formatQuantity(ex.measure, s.reps)
}

export function ExerciseRun({
  log,
  exercise,
  context,
  bodyweight,
  edit,
  onSetDone,
  onMenu,
}: {
  log: ClassicExerciseLog
  exercise: Exercise
  context: ExerciseContext
  bodyweight: number | undefined
  edit: (fn: (log: ClassicExerciseLog) => void) => void
  onSetDone: () => void
  onMenu: () => void
}) {
  const loaded = hasLoad(exercise.measure)
  const unit = MEASURES[exercise.measure].unit
  const best = context.records.bestE1rm?.value

  const toggle = (i: number) => {
    unlockAudio()
    const wasDone = log.sets[i].done
    edit((l) => {
      l.sets[i].done = !wasDone
      l.sets[i].doneAt = wasDone ? undefined : Date.now()
    })
    if (!wasDone) onSetDone()
  }

  return (
    <div className="rounded-2xl bg-card p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold">{exercise.name}</div>
          <div className="text-sm text-accent">{describeTarget(log, exercise)}</div>
          {log.targetNote && <div className="text-xs text-accent/80">{log.targetNote}</div>}
        </div>
        <button type="button" className="-mr-1 px-2 text-xl text-muted" onClick={onMenu} aria-label="Actions de l'exercice">
          ⋯
        </button>
      </div>

      {(context.last || best !== undefined) && (
        <div className="mt-1 space-y-0.5 text-xs text-muted">
          {context.last && <div className="truncate">Dernière fois : {context.last.sets.map((s) => describeSet(exercise, s)).join(', ')}</div>}
          {best !== undefined && <div>Record 1RM estimé : {formatKg(Math.round(best * 10) / 10)}</div>}
          {!isStrengthMeasure(exercise.measure) && context.records.bestQty && (
            <div>Record : {formatQuantity(exercise.measure, context.records.bestQty.value)}</div>
          )}
        </div>
      )}

      <div className="mt-3 grid grid-cols-[1.75rem_1fr_1fr_1fr_3rem] items-center gap-x-2 gap-y-1.5 text-center">
        <span className="text-xs text-muted">#</span>
        <span className="text-xs text-muted">{loaded ? MEASURES[exercise.measure].loadLabel : ''}</span>
        <span className="text-xs text-muted">{unit}</span>
        <span className="text-xs text-muted">RPE</span>
        <span />
        {log.sets.map((s, i) => {
          const pr = s.done && isPR(setPR(exercise, s, context.records, bodyweight))
          return (
            <SetRow key={s.id} index={i} set={s} pr={pr} loaded={loaded} edit={(fn) => edit((l) => fn(l.sets[i]))} onToggle={() => toggle(i)} />
          )
        })}
      </div>

      <div className="mt-2 flex gap-2">
        <button type="button" className="flex-1 rounded-lg py-2 text-sm text-muted active:bg-card-2" onClick={() => edit((l) => void l.sets.push(nextSet(l)))}>
          + Série
        </button>
        {log.sets.length > 0 && (
          <button type="button" className="flex-1 rounded-lg py-2 text-sm text-muted active:bg-card-2" onClick={() => edit((l) => void l.sets.pop())}>
            − Série
          </button>
        )}
      </div>
    </div>
  )
}

function SetRow({
  index,
  set,
  pr,
  loaded,
  edit,
  onToggle,
}: {
  index: number
  set: SetLog
  pr: boolean
  loaded: boolean
  edit: (fn: (s: SetLog) => void) => void
  onToggle: () => void
}) {
  const doneBg = set.done ? 'bg-ok/20' : ''
  return (
    <>
      <span className={`text-sm font-semibold ${pr ? 'text-pr' : 'text-muted'}`}>{pr ? '★' : index + 1}</span>
      {loaded ? (
        <NumberField ariaLabel={`Charge série ${index + 1}`} value={set.load} onChange={(v) => edit((s) => (s.load = v))} className={doneBg} />
      ) : (
        <span />
      )}
      <NumberField ariaLabel={`Reps série ${index + 1}`} decimal={false} value={set.reps} onChange={(v) => edit((s) => (s.reps = v))} className={doneBg} />
      <NumberField ariaLabel={`RPE série ${index + 1}`} value={set.rpe} placeholder="–" onChange={(v) => edit((s) => (s.rpe = v))} className={doneBg} />
      <button
        type="button"
        onClick={onToggle}
        aria-label={set.done ? `Annuler la série ${index + 1}` : `Valider la série ${index + 1}`}
        className={`h-10 rounded-lg text-xl font-bold ${set.done ? 'bg-ok text-white' : 'bg-card-2 text-muted'}`}
      >
        ✓
      </button>
    </>
  )
}
