import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { db, softDelete } from '../db/db'
import { MEASURES, hasLoad } from '../domain/exercise'
import { uid } from '../domain/session'
import type { BlockPlan, ClassicBlockPlan, Exercise, Template, WodBlockPlan } from '../domain/types'
import { ActionSheet, Button, Card, DurationField, Empty, Label, NumberField, PageHeader, TextField } from '../ui/components'
import { ExercisePicker } from '../ui/ExercisePicker'
import { defaultWodFormat } from '../ui/format'
import { useExerciseMap } from '../ui/hooks'
import { moveItem, useEditableDoc } from '../ui/useEditableDoc'
import { WodFormatEditor } from '../ui/WodFormatEditor'
import { startSession } from '../ui/actions'

type Mutate = (fn: (t: Template) => void) => void

/** Cible du sélecteur d'exercice : ajout dans un bloc, ou remplacement. */
type PickTarget = { blockId: string; replaceId?: string }

export function TemplateEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tpl, mutate] = useEditableDoc(db.templates, id)
  const exercises = useExerciseMap()
  const [pick, setPick] = useState<PickTarget>()
  const [menu, setMenu] = useState(false)

  if (tpl === undefined || !exercises) return null
  if (tpl === null) return <Empty>Modèle introuvable.</Empty>

  const onPick = (exerciseId: string) => {
    if (!pick) return
    mutate((t) => {
      const b = t.blocks.find((x) => x.id === pick.blockId)
      if (!b) return
      if (b.kind === 'classic') {
        if (pick.replaceId) {
          const p = b.exercises.find((x) => x.id === pick.replaceId)
          if (p) p.exerciseId = exerciseId
        } else {
          b.exercises.push({ id: uid(), exerciseId, sets: 3, repsMin: 8, repsMax: 8, restSec: 120 })
        }
      } else if (pick.replaceId) {
        const it = b.items.find((x) => x.id === pick.replaceId)
        if (it) it.exerciseId = exerciseId
      } else {
        b.items.push({ id: uid(), exerciseId, quantity: 10 })
      }
    })
  }

  const addBlock = (kind: BlockPlan['kind']) =>
    mutate((t) => {
      t.blocks.push(
        kind === 'classic'
          ? { id: uid(), kind: 'classic', exercises: [] }
          : { id: uid(), kind: 'wod', format: defaultWodFormat('amrap'), items: [] },
      )
    })

  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-safe">
      <PageHeader
        title="Modèle"
        back
        right={
          <button type="button" className="px-2 text-2xl text-muted" onClick={() => setMenu(true)} aria-label="Actions">
            ⋯
          </button>
        }
      />
      <div className="space-y-4 px-4 pb-10">
        <TextField value={tpl.name} onChange={(name) => mutate((t) => void (t.name = name))} placeholder="Nom de la séance" />

        {tpl.blocks.map((b, i) => (
          <BlockCard key={b.id} index={i} count={tpl.blocks.length} block={b} mutate={mutate}>
            {b.kind === 'classic' ? (
              <ClassicBlockEditor block={b} exercises={exercises} mutate={mutate} onPick={setPick} />
            ) : (
              <WodBlockEditor block={b} exercises={exercises} mutate={mutate} onPick={setPick} />
            )}
          </BlockCard>
        ))}

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => addBlock('classic')}>+ Bloc classique</Button>
          <Button onClick={() => addBlock('wod')}>+ Bloc WOD</Button>
        </div>

        {tpl.blocks.length > 0 && (
          <Button
            variant="primary"
            className="w-full py-3.5 text-lg"
            onClick={async () => navigate(`/seance/${await startSession(tpl.id)}`, { replace: true })}
          >
            Démarrer cette séance
          </Button>
        )}
      </div>

      <ExercisePicker open={pick !== undefined} onClose={() => setPick(undefined)} onPick={onPick} />
      <ActionSheet
        open={menu}
        onClose={() => setMenu(false)}
        title={tpl.name}
        actions={[
          {
            label: 'Dupliquer le modèle',
            onClick: async () => {
              const copy = { ...structuredClone(tpl), id: uid(), name: `${tpl.name} (copie)`, updatedAt: Date.now() }
              await db.templates.put(copy)
              navigate(`/modeles/${copy.id}`, { replace: true })
            },
          },
          {
            label: 'Supprimer le modèle',
            danger: true,
            onClick: async () => {
              if (!confirm(`Supprimer « ${tpl.name} » ?`)) return
              await softDelete(db.templates, tpl.id)
              navigate('/modeles', { replace: true })
            },
          },
        ]}
      />
    </div>
  )
}

function BlockCard({
  block,
  index,
  count,
  mutate,
  children,
}: {
  block: BlockPlan
  index: number
  count: number
  mutate: Mutate
  children: React.ReactNode
}) {
  const [menu, setMenu] = useState(false)
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <span className={`text-sm font-semibold uppercase ${block.kind === 'wod' ? 'text-accent' : 'text-muted'}`}>
          Bloc {index + 1} · {block.kind === 'classic' ? 'Classique' : 'WOD'}
        </span>
        <button type="button" className="px-2 text-xl text-muted" onClick={() => setMenu(true)} aria-label="Actions du bloc">
          ⋯
        </button>
      </div>
      {children}
      <ActionSheet
        open={menu}
        onClose={() => setMenu(false)}
        title={`Bloc ${index + 1}`}
        actions={[
          { label: 'Monter', disabled: index === 0, onClick: () => mutate((t) => moveItem(t.blocks, index, -1)) },
          { label: 'Descendre', disabled: index === count - 1, onClick: () => mutate((t) => moveItem(t.blocks, index, 1)) },
          {
            label: 'Dupliquer',
            onClick: () =>
              mutate((t) => {
                const copy = structuredClone(t.blocks[index])
                copy.id = uid()
                if (copy.kind === 'classic') copy.exercises.forEach((e) => (e.id = uid()))
                else copy.items.forEach((it) => (it.id = uid()))
                t.blocks.splice(index + 1, 0, copy)
              }),
          },
          { label: 'Supprimer le bloc', danger: true, onClick: () => mutate((t) => void t.blocks.splice(index, 1)) },
        ]}
      />
    </Card>
  )
}

function ClassicBlockEditor({
  block,
  exercises,
  mutate,
  onPick,
}: {
  block: ClassicBlockPlan
  exercises: Map<string, Exercise>
  mutate: Mutate
  onPick: (t: PickTarget) => void
}) {
  const edit = (planId: string, fn: (p: ClassicBlockPlan['exercises'][number]) => void) =>
    mutate((t) => {
      const b = t.blocks.find((x) => x.id === block.id)
      const p = b?.kind === 'classic' ? b.exercises.find((x) => x.id === planId) : undefined
      if (p) fn(p)
    })
  const [menuFor, setMenuFor] = useState<number>()

  return (
    <div className="space-y-4">
      {block.exercises.map((p, i) => {
        const ex = exercises.get(p.exerciseId)
        const measure = ex?.measure ?? 'barbell'
        const unit = MEASURES[measure].unit
        return (
          <div key={p.id} className="rounded-xl bg-card-2/50 p-3">
            <div className="mb-2 flex items-center gap-2">
              <button type="button" className="flex-1 truncate text-left font-medium" onClick={() => onPick({ blockId: block.id, replaceId: p.id })}>
                {ex?.name ?? 'Exercice inconnu'}
              </button>
              <button type="button" className="px-2 text-muted" onClick={() => setMenuFor(i)} aria-label="Actions de l'exercice">
                ⋯
              </button>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <label>
                <Label>Séries</Label>
                <NumberField decimal={false} value={p.sets} onChange={(v) => edit(p.id, (x) => (x.sets = Math.max(1, v ?? 1)))} />
              </label>
              <label className="col-span-2">
                <Label>{unit === 'reps' ? 'Reps' : unit} (min–max)</Label>
                <div className="flex items-center gap-1">
                  <NumberField
                    decimal={false}
                    value={p.repsMin}
                    onChange={(v) =>
                      edit(p.id, (x) => {
                        x.repsMin = v ?? 1
                        if (x.repsMax < x.repsMin) x.repsMax = x.repsMin
                      })
                    }
                  />
                  <span className="text-muted">–</span>
                  <NumberField decimal={false} value={p.repsMax} onChange={(v) => edit(p.id, (x) => (x.repsMax = v ?? x.repsMin))} />
                </div>
              </label>
              <label>
                <Label>{hasLoad(measure) ? MEASURES[measure].loadLabel : '—'}</Label>
                <NumberField
                  value={p.targetLoad}
                  placeholder="–"
                  onChange={(v) => edit(p.id, (x) => (x.targetLoad = v))}
                  className={hasLoad(measure) ? '' : 'invisible'}
                />
              </label>
              <label>
                <Label>RPE</Label>
                <NumberField value={p.targetRpe} placeholder="–" onChange={(v) => edit(p.id, (x) => (x.targetRpe = v))} />
              </label>
            </div>
            <label className="mt-2 flex items-center gap-2">
              <span className="text-xs text-muted">Repos</span>
              <div className="w-20">
                <DurationField plainUnit="s" value={p.restSec} onChange={(v) => edit(p.id, (x) => (x.restSec = v ?? 0))} />
              </div>
            </label>
          </div>
        )
      })}
      <Button variant="ghost" className="w-full border border-dashed border-line" onClick={() => onPick({ blockId: block.id })}>
        + Exercice
      </Button>
      <ActionSheet
        open={menuFor !== undefined}
        onClose={() => setMenuFor(undefined)}
        title="Exercice"
        actions={
          menuFor === undefined
            ? []
            : [
                { label: 'Monter', disabled: menuFor === 0, onClick: () => mutate((t) => moveInBlock(t, block.id, menuFor, -1)) },
                {
                  label: 'Descendre',
                  disabled: menuFor === block.exercises.length - 1,
                  onClick: () => mutate((t) => moveInBlock(t, block.id, menuFor, 1)),
                },
                {
                  label: 'Retirer',
                  danger: true,
                  onClick: () =>
                    mutate((t) => {
                      const b = t.blocks.find((x) => x.id === block.id)
                      if (b?.kind === 'classic') b.exercises.splice(menuFor, 1)
                    }),
                },
              ]
        }
      />
    </div>
  )
}

function moveInBlock(t: Template, blockId: string, index: number, delta: -1 | 1) {
  const b = t.blocks.find((x) => x.id === blockId)
  if (!b) return
  if (b.kind === 'classic') moveItem(b.exercises, index, delta)
  else moveItem(b.items, index, delta)
}

function WodBlockEditor({
  block,
  exercises,
  mutate,
  onPick,
}: {
  block: WodBlockPlan
  exercises: Map<string, Exercise>
  mutate: Mutate
  onPick: (t: PickTarget) => void
}) {
  const editBlock = (fn: (b: WodBlockPlan) => void) =>
    mutate((t) => {
      const b = t.blocks.find((x) => x.id === block.id)
      if (b?.kind === 'wod') fn(b)
    })

  return (
    <div className="space-y-4">
      <TextField value={block.name ?? ''} onChange={(v) => editBlock((b) => (b.name = v || undefined))} placeholder="Nom du WOD (optionnel)" />
      <WodFormatEditor format={block.format} onChange={(f) => editBlock((b) => (b.format = f))} />
      <div className="space-y-2">
        <Label>Exercices{block.format.type === 'emom' && !block.format.alternate ? ' (chaque intervalle)' : ' (par tour)'}</Label>
        {block.items.map((it, i) => {
          const ex = exercises.get(it.exerciseId)
          const measure = ex?.measure ?? 'reps'
          return (
            <div key={it.id} className="flex items-center gap-2">
              <button type="button" className="flex-1 truncate text-left" onClick={() => onPick({ blockId: block.id, replaceId: it.id })}>
                {ex?.name ?? '?'}
              </button>
              <div className="w-20">
                <NumberField
                  ariaLabel="Quantité"
                  value={it.quantity}
                  onChange={(v) => editBlock((b) => (b.items[i].quantity = v ?? 0))}
                />
              </div>
              <span className="w-7 text-xs text-muted">{MEASURES[measure].unit}</span>
              {hasLoad(measure) ? (
                <div className="w-16">
                  <NumberField ariaLabel="Charge" placeholder="kg" value={it.load} onChange={(v) => editBlock((b) => (b.items[i].load = v))} />
                </div>
              ) : (
                <div className="w-16" />
              )}
              <button type="button" className="px-1 text-muted" onClick={() => editBlock((b) => void b.items.splice(i, 1))} aria-label="Retirer">
                ✕
              </button>
            </div>
          )
        })}
        <Button variant="ghost" className="w-full border border-dashed border-line" onClick={() => onPick({ blockId: block.id })}>
          + Exercice
        </Button>
      </div>
    </div>
  )
}
