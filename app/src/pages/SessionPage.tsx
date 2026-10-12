import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { db, save, softDelete } from '../db/db'
import { formatLongDay } from '../domain/dates'
import { formatDuration } from '../domain/exercise'
import { exerciseLogFromPlan, sessionProgress, templateFromSession, uid } from '../domain/session'
import { bodyweightAt, computeRecords, exerciseHistory, isPR, setPR, sessionTime } from '../domain/stats'
import type { ClassicBlockLog, ClassicExerciseLog, Exercise, Session, WodBlockLog } from '../domain/types'
import { lastSetsByExercise } from '../ui/actions'
import { ActionSheet, Button, Empty, Sheet, TextField } from '../ui/components'
import { ExercisePicker } from '../ui/ExercisePicker'
import { defaultWodFormat } from '../ui/format'
import { useBodyweights, useExerciseMap, useNow, useSessions } from '../ui/hooks'
import { ExerciseRun, type ExerciseContext } from '../ui/session/ExerciseRun'
import { RestTimer } from '../ui/session/RestTimer'
import { WodBlockCard } from '../ui/session/WodRun'
import { moveItem, useEditableDoc } from '../ui/useEditableDoc'
import { WodFormatEditor } from '../ui/WodFormatEditor'

/** Exercice ciblé par le menu ou le sélecteur (remplacement / ajout). */
type ExerciseRef = { blockId: string; exerciseLogId: string }

export function SessionPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [session, mutate] = useEditableDoc(db.sessions, id)
  const exercises = useExerciseMap()
  const sessions = useSessions()
  const bodyweights = useBodyweights()

  const [menuFor, setMenuFor] = useState<ExerciseRef>()
  const [replaceFor, setReplaceFor] = useState<ExerciseRef>()
  const [adding, setAdding] = useState(false)
  const [newWod, setNewWod] = useState(false)
  const [sessionMenu, setSessionMenu] = useState(false)
  const [summary, setSummary] = useState<{ prs: number } | undefined>()

  const inProgress = session?.status === 'in_progress'
  const now = useNow(inProgress, 1000)

  const bodyweight = useMemo(
    () => (session && bodyweights ? bodyweightAt(bodyweights, sessionTime(session)) : undefined),
    [session, bodyweights],
  )

  // Contexte par exercice (records + dernière perf), calculé à partir des
  // séances antérieures à celle-ci uniquement.
  const refTime = session ? sessionTime(session) : Infinity
  const contextFor = useMemo(() => {
    const cache = new Map<string, ExerciseContext>()
    const others = (sessions ?? []).filter((s) => s.id !== id && sessionTime(s) < refTime)
    return (ex: Exercise): ExerciseContext => {
      let c = cache.get(ex.id)
      if (!c) {
        const history = exerciseHistory(ex, others, bodyweights ?? [])
        c = { records: computeRecords(ex, history, bodyweights ?? []), last: history[0] }
        cache.set(ex.id, c)
      }
      return c
    }
  }, [sessions, bodyweights, id, refTime])

  if (session === undefined || !exercises) return null
  if (session === null) return <Empty>Séance introuvable.</Empty>

  const editExercise = (ref: ExerciseRef, fn: (l: ClassicExerciseLog) => void) =>
    mutate((s) => {
      const b = s.blocks.find((x) => x.id === ref.blockId)
      const l = b?.kind === 'classic' ? b.exercises.find((x) => x.id === ref.exerciseLogId) : undefined
      if (l) fn(l)
    })

  const editWod = (blockId: string, fn: (b: WodBlockLog) => void) =>
    mutate((s) => {
      const b = s.blocks.find((x) => x.id === blockId)
      if (b?.kind === 'wod') fn(b)
    })

  const addExercise = async (exerciseId: string) => {
    const last = (await lastSetsByExercise(session.id)).get(exerciseId)
    const reps = last?.[0]?.reps ?? 8
    const log = exerciseLogFromPlan({ id: uid(), exerciseId, sets: last?.length ?? 3, repsMin: reps, repsMax: reps, restSec: 120 }, last)
    log.target = undefined
    mutate((s) => {
      // Ajouté au dernier bloc classique s'il est en fin de séance, sinon dans un nouveau bloc.
      const lastBlock = s.blocks[s.blocks.length - 1]
      if (lastBlock?.kind === 'classic') lastBlock.exercises.push(log)
      else s.blocks.push({ id: uid(), kind: 'classic', exercises: [log] })
    })
  }

  const finish = () => {
    let prs = 0
    for (const b of session.blocks) {
      if (b.kind !== 'classic') continue
      for (const l of b.exercises) {
        const ex = exercises.get(l.exerciseId)
        if (!ex) continue
        const ctx = contextFor(ex)
        prs += l.sets.filter((s) => isPR(setPR(ex, s, ctx.records, bodyweight))).length
      }
    }
    mutate((s) => {
      s.status = 'done'
      s.completedAt = Date.now()
      s.restEndsAt = undefined
    })
    setSummary({ prs })
  }

  const progress = sessionProgress(session)
  const menuLog = menuFor ? findExercise(session, menuFor) : undefined

  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-32">
      <header className="pt-safe sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-4">
          <button type="button" onClick={() => navigate('/')} className="-ml-2 px-2 text-2xl text-accent" aria-label="Retour">
            ‹
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">{session.name}</div>
            <div className="text-xs text-muted">
              {inProgress && session.startedAt
                ? `${formatDuration((now - session.startedAt) / 1000)} · ${progress.doneSets}/${progress.totalSets} séries`
                : session.status === 'done' && session.completedAt
                  ? `Terminée · ${formatLongDay(session.completedAt)}`
                  : ''}
            </div>
          </div>
          <button type="button" className="px-2 text-xl text-muted" onClick={() => setSessionMenu(true)} aria-label="Actions de la séance">
            ⋯
          </button>
          {inProgress && (
            <Button variant="primary" className="px-3 py-1.5" onClick={finish}>
              Terminer
            </Button>
          )}
        </div>
      </header>

      <div className="space-y-3 px-3 pt-3">
        {session.blocks.length === 0 && <Empty>Séance vide. Ajoute un exercice ou un WOD.</Empty>}
        {session.blocks.map((b) =>
          b.kind === 'classic' ? (
            <ClassicBlockRun
              key={b.id}
              block={b}
              exercises={exercises}
              contextFor={contextFor}
              bodyweight={bodyweight}
              onEdit={(logId, fn) => editExercise({ blockId: b.id, exerciseLogId: logId }, fn)}
              onSetDone={(restSec) => {
                if (inProgress && restSec > 0) mutate((s) => (s.restEndsAt = Date.now() + restSec * 1000))
              }}
              onMenu={(logId) => setMenuFor({ blockId: b.id, exerciseLogId: logId })}
            />
          ) : (
            <WodBlockCard key={b.id} block={b} exercises={exercises} edit={(fn) => editWod(b.id, fn)} />
          ),
        )}

        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button onClick={() => setAdding(true)}>+ Exercice</Button>
          <Button onClick={() => setNewWod(true)}>+ WOD</Button>
        </div>
      </div>

      {inProgress && <RestTimer endsAt={session.restEndsAt} onChange={(t) => mutate((s) => (s.restEndsAt = t))} />}

      <ExercisePicker open={adding} onClose={() => setAdding(false)} onPick={(exId) => void addExercise(exId)} />
      <ExercisePicker
        open={replaceFor !== undefined}
        title="Remplacer par…"
        onClose={() => setReplaceFor(undefined)}
        onPick={(exId) => replaceFor && editExercise(replaceFor, (l) => (l.exerciseId = exId))}
      />
      <NewWodSheet
        open={newWod}
        onClose={() => setNewWod(false)}
        exercises={exercises}
        onCreate={(b) => mutate((s) => void s.blocks.push(b))}
      />

      <ActionSheet
        open={menuFor !== undefined}
        onClose={() => setMenuFor(undefined)}
        title={menuLog ? (exercises.get(menuLog.exerciseId)?.name ?? 'Exercice') : 'Exercice'}
        actions={
          menuFor
            ? [
                { label: 'Remplacer l’exercice', onClick: () => setReplaceFor(menuFor) },
                { label: 'Monter', onClick: () => mutate((s) => moveExercise(s, menuFor, -1)) },
                { label: 'Descendre', onClick: () => mutate((s) => moveExercise(s, menuFor, 1)) },
                {
                  label: 'Supprimer de la séance',
                  danger: true,
                  onClick: () =>
                    mutate((s) => {
                      const b = s.blocks.find((x) => x.id === menuFor.blockId)
                      if (b?.kind !== 'classic') return
                      b.exercises = b.exercises.filter((x) => x.id !== menuFor.exerciseLogId)
                      if (b.exercises.length === 0) s.blocks = s.blocks.filter((x) => x.id !== b.id)
                    }),
                },
              ]
            : []
        }
      />

      <SessionMenu open={sessionMenu} onClose={() => setSessionMenu(false)} session={session} mutate={mutate} />

      <Sheet open={summary !== undefined} onClose={() => navigate('/', { replace: true })} title="Séance terminée 💪">
        <div className="space-y-3 pb-2">
          <p>
            {progress.doneSets} séries
            {progress.totalWods ? ` · ${progress.doneWods} WOD` : ''}
            {session.startedAt && session.completedAt ? ` en ${formatDuration((session.completedAt - session.startedAt) / 1000)}` : ''}.
          </p>
          {summary && summary.prs > 0 && <p className="text-pr">★ {summary.prs} record{summary.prs > 1 ? 's' : ''} battu{summary.prs > 1 ? 's' : ''} !</p>}
          <Button variant="primary" className="w-full" onClick={() => navigate('/', { replace: true })}>
            OK
          </Button>
        </div>
      </Sheet>
    </div>
  )
}

function findExercise(s: Session, ref: ExerciseRef): ClassicExerciseLog | undefined {
  const b = s.blocks.find((x) => x.id === ref.blockId)
  return b?.kind === 'classic' ? b.exercises.find((x) => x.id === ref.exerciseLogId) : undefined
}

function moveExercise(s: Session, ref: ExerciseRef, delta: -1 | 1) {
  const b = s.blocks.find((x) => x.id === ref.blockId)
  if (b?.kind !== 'classic') return
  moveItem(
    b.exercises,
    b.exercises.findIndex((x) => x.id === ref.exerciseLogId),
    delta,
  )
}

function ClassicBlockRun({
  block,
  exercises,
  contextFor,
  bodyweight,
  onEdit,
  onSetDone,
  onMenu,
}: {
  block: ClassicBlockLog
  exercises: Map<string, Exercise>
  contextFor: (ex: Exercise) => ExerciseContext
  bodyweight: number | undefined
  onEdit: (logId: string, fn: (l: ClassicExerciseLog) => void) => void
  onSetDone: (restSec: number) => void
  onMenu: (logId: string) => void
}) {
  return (
    <>
      {block.exercises.map((l) => {
        const ex = exercises.get(l.exerciseId)
        if (!ex) return null
        return (
          <ExerciseRun
            key={l.id}
            log={l}
            exercise={ex}
            context={contextFor(ex)}
            bodyweight={bodyweight}
            edit={(fn) => onEdit(l.id, fn)}
            onSetDone={() => onSetDone(l.restSec)}
            onMenu={() => onMenu(l.id)}
          />
        )
      })}
    </>
  )
}

/** Ajout d'un WOD improvisé pendant la séance. */
function NewWodSheet({
  open,
  onClose,
  exercises,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  exercises: Map<string, Exercise>
  onCreate: (b: WodBlockLog) => void
}) {
  const [block, setBlock] = useState<WodBlockLog>(() => blankWod())
  const [picking, setPicking] = useState(false)

  return (
    <Sheet open={open} onClose={onClose} title="Nouveau WOD">
      <div className="space-y-4">
        <TextField value={block.name ?? ''} onChange={(v) => setBlock({ ...block, name: v || undefined })} placeholder="Nom (optionnel)" />
        <WodFormatEditor format={block.format} onChange={(format) => setBlock({ ...block, format })} />
        <ul className="space-y-1">
          {block.items.map((it, i) => (
            <li key={it.id} className="flex items-center gap-2">
              <span className="flex-1 truncate">{exercises.get(it.exerciseId)?.name}</span>
              <input
                type="text"
                inputMode="numeric"
                aria-label="Quantité"
                value={it.quantity}
                onChange={(e) =>
                  setBlock({ ...block, items: block.items.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) || 0 } : x)) })
                }
                className="w-16 rounded-lg bg-card-2 px-2 py-2 text-center"
              />
              <button type="button" className="px-1 text-muted" onClick={() => setBlock({ ...block, items: block.items.filter((_, j) => j !== i) })}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        <Button variant="ghost" className="w-full border border-dashed border-line" onClick={() => setPicking(true)}>
          + Exercice
        </Button>
        <Button
          variant="primary"
          className="w-full"
          disabled={block.items.length === 0}
          onClick={() => {
            onCreate(block)
            setBlock(blankWod())
            onClose()
          }}
        >
          Ajouter à la séance
        </Button>
      </div>
      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(exerciseId) => setBlock((b) => ({ ...b, items: [...b.items, { id: uid(), exerciseId, quantity: 10 }] }))}
      />
    </Sheet>
  )
}

const blankWod = (): WodBlockLog => ({ id: uid(), kind: 'wod', format: defaultWodFormat('amrap'), items: [], done: false })

function SessionMenu({
  open,
  onClose,
  session,
  mutate,
}: {
  open: boolean
  onClose: () => void
  session: Session
  mutate: (fn: (s: Session) => void) => void
}) {
  const navigate = useNavigate()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(session.name)
  return (
    <>
      <ActionSheet
        open={open}
        onClose={onClose}
        title={session.name}
        actions={[
          {
            label: 'Renommer',
            onClick: () => {
              setName(session.name)
              setRenaming(true)
            },
          },
          {
            label: 'Enregistrer comme séance modèle',
            disabled: session.blocks.length === 0,
            onClick: async () => {
              const template = templateFromSession(session)
              await save(db.templates, template)
              navigate(`/modeles/${template.id}`)
            },
          },
          {
            label: 'Supprimer la séance',
            danger: true,
            onClick: async () => {
              if (!confirm('Supprimer cette séance de l’historique ?')) return
              await softDelete(db.sessions, session.id)
              navigate('/', { replace: true })
            },
          },
        ]}
      />
      <Sheet open={renaming} onClose={() => setRenaming(false)} title="Renommer">
        <div className="space-y-3">
          <TextField value={name} onChange={setName} autoFocus />
          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              mutate((s) => (s.name = name.trim() || s.name))
              setRenaming(false)
            }}
          >
            Enregistrer
          </Button>
        </div>
      </Sheet>
    </>
  )
}
