import { useState } from 'react'
import { useParams } from 'react-router'
import { db } from '../db/db'
import { formatKg, formatNumber } from '../domain/exercise'
import { overrideFor } from '../domain/program'
import { uid } from '../domain/session'
import type { Exercise, ExerciseRule, Program, ProgramBlock, ProgressionMode, SuggestRule, Template, WeekOverride } from '../domain/types'
import { ActionSheet, Button, Card, Empty, Label, NumberField, PageHeader, SectionTitle, Select, TextField } from '../ui/components'
import { MODE_LABELS, SUGGEST_LABELS } from '../ui/format'
import { useExerciseMap } from '../ui/hooks'
import { useTemplateMap } from '../ui/programActions'
import { TemplatePicker } from '../ui/TemplatePicker'
import { moveItem, useEditableDoc } from '../ui/useEditableDoc'

type BlockMutate = (fn: (b: ProgramBlock) => void) => void

/** Choix combiné mode + règle de suggestion, pour un seul menu déroulant. */
type ModeChoice = 'free' | 'suggest-rpe' | 'suggest-double' | 'percent'
const MODE_CHOICES: { value: ModeChoice; label: string }[] = [
  { value: 'free', label: 'Libre' },
  { value: 'suggest-rpe', label: 'Suggestion selon le RPE' },
  { value: 'suggest-double', label: 'Suggestion double progression' },
  { value: 'percent', label: '% du 1RM' },
]
const toChoice = (mode: ProgressionMode, rule: SuggestRule): ModeChoice =>
  mode === 'suggest' ? (rule === 'rpe' ? 'suggest-rpe' : 'suggest-double') : mode
const fromChoice = (c: ModeChoice): { mode: ProgressionMode; suggestRule?: SuggestRule } =>
  c === 'suggest-rpe' ? { mode: 'suggest', suggestRule: 'rpe' } : c === 'suggest-double' ? { mode: 'suggest', suggestRule: 'double' } : { mode: c }

/** Exceptions d'une semaine, créées à la volée. */
function ensureOverride(b: ProgramBlock, week: number): WeekOverride {
  let ov = overrideFor(b, week)
  if (!ov) {
    ov = { week, replace: [], skip: [], extra: [] }
    b.overrides.push(ov)
  }
  return ov
}

/** Retire les exceptions vides pour garder le document propre. */
function pruneOverrides(b: ProgramBlock) {
  b.overrides = b.overrides.filter(
    (o) => o.week < b.weeks && (o.deload || o.mode || o.replace.length || o.skip.length || o.extra.length),
  )
}

export function BlockEditorPage() {
  const { id, blockId } = useParams()
  const [program, mutate] = useEditableDoc(db.programs, id)
  const templates = useTemplateMap()
  const exercises = useExerciseMap()
  const [picker, setPicker] = useState<{ onPick: (templateId: string) => void }>()
  const [slotMenu, setSlotMenu] = useState<number>()

  if (program === undefined || !templates || !exercises) return null
  const block = program?.blocks.find((b) => b.id === blockId)
  if (!program || !block) return <Empty>Bloc introuvable.</Empty>

  const mutateBlock: BlockMutate = (fn) =>
    mutate((p: Program) => {
      const b = p.blocks.find((x) => x.id === blockId)
      if (b) {
        fn(b)
        pruneOverrides(b)
      }
    })

  const pickTemplate = (onPick: (templateId: string) => void) => setPicker({ onPick })

  // Modèles distincts de la semaine type (un même modèle peut revenir deux fois).
  const slotTemplates = [...new Set(block.slots.map((s) => s.templateId))].map((tid) => templates.get(tid)).filter((t): t is Template => !!t)

  return (
    <div className="pb-safe mx-auto min-h-dvh max-w-xl">
      <PageHeader title={block.name || 'Bloc'} back />
      <div className="space-y-4 px-4 pb-10">
        <Card className="space-y-3">
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <label>
              <Label>Nom du bloc</Label>
              <TextField value={block.name} onChange={(v) => mutateBlock((b) => void (b.name = v))} />
            </label>
            <label>
              <Label>Semaines</Label>
              <NumberField decimal={false} value={block.weeks} onChange={(v) => mutateBlock((b) => void (b.weeks = Math.max(1, Math.min(v ?? 1, 52))))} />
            </label>
          </div>
          <label className="block">
            <Label>Progression par défaut</Label>
            <Select
              value={toChoice(block.mode, block.suggestRule)}
              options={MODE_CHOICES}
              onChange={(c) =>
                mutateBlock((b) => {
                  const { mode, suggestRule } = fromChoice(c)
                  b.mode = mode
                  if (suggestRule) b.suggestRule = suggestRule
                })
              }
            />
          </label>
        </Card>

        <SectionTitle>Semaine type</SectionTitle>
        <div className="space-y-2">
          {block.slots.length === 0 && <p className="px-1 text-sm text-muted">Ajoute les séances de la semaine, dans l’ordre.</p>}
          {block.slots.map((s, i) => (
            <Card key={s.id} className="flex items-center gap-3 py-3">
              <span className="w-6 text-sm text-muted">{i + 1}</span>
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left font-medium"
                onClick={() => pickTemplate((tid) => mutateBlock((b) => void (b.slots[i].templateId = tid)))}
              >
                {templates.get(s.templateId)?.name ?? 'Modèle supprimé'}
              </button>
              <button type="button" className="px-2 text-xl text-muted" onClick={() => setSlotMenu(i)} aria-label="Actions">
                ⋯
              </button>
            </Card>
          ))}
          <Button className="w-full" onClick={() => pickTemplate((tid) => mutateBlock((b) => void b.slots.push({ id: uid(), templateId: tid })))}>
            + Séance
          </Button>
        </div>

        {slotTemplates.length > 0 && (
          <>
            <SectionTitle>Progression par exercice</SectionTitle>
            {slotTemplates.map((t) => (
              <TemplateRules key={t.id} template={t} block={block} exercises={exercises} mutateBlock={mutateBlock} />
            ))}
          </>
        )}

        <SectionTitle>Exceptions par semaine</SectionTitle>
        <div className="space-y-2">
          {Array.from({ length: block.weeks }, (_, w) => (
            <WeekExceptions key={w} week={w} block={block} templates={templates} mutateBlock={mutateBlock} pickTemplate={pickTemplate} />
          ))}
        </div>
      </div>

      <TemplatePicker open={picker !== undefined} onClose={() => setPicker(undefined)} onPick={(tid) => picker?.onPick(tid)} />
      <ActionSheet
        open={slotMenu !== undefined}
        onClose={() => setSlotMenu(undefined)}
        title="Séance de la semaine type"
        actions={
          slotMenu === undefined
            ? []
            : [
                { label: 'Monter', disabled: slotMenu === 0, onClick: () => mutateBlock((b) => moveItem(b.slots, slotMenu, -1)) },
                { label: 'Descendre', disabled: slotMenu === block.slots.length - 1, onClick: () => mutateBlock((b) => moveItem(b.slots, slotMenu, 1)) },
                { label: 'Retirer', danger: true, onClick: () => mutateBlock((b) => void b.slots.splice(slotMenu, 1)) },
              ]
        }
      />
    </div>
  )
}

/** Mode de chaque exercice d'un modèle, et tableau % par semaine si besoin. */
function TemplateRules({
  template,
  block,
  exercises,
  mutateBlock,
}: {
  template: Template
  block: ProgramBlock
  exercises: Map<string, Exercise>
  mutateBlock: BlockMutate
}) {
  const plans = template.blocks.flatMap((b) => (b.kind === 'classic' ? b.exercises : []))
  if (plans.length === 0) return null

  const editRule = (planId: string, fn: (r: ExerciseRule) => void) =>
    mutateBlock((b) => {
      let r = b.rules.find((x) => x.planId === planId)
      if (!r) {
        r = { planId, percentWeeks: [] }
        b.rules.push(r)
      }
      fn(r)
    })

  return (
    <Card className="space-y-4">
      <div className="text-sm font-semibold text-muted uppercase">{template.name}</div>
      {plans.map((p) => {
        const ex = exercises.get(p.exerciseId)
        const rule = block.rules.find((r) => r.planId === p.id)
        const mode = rule?.mode ?? block.mode
        const choiceValue = rule?.mode ? toChoice(rule.mode, rule.suggestRule ?? block.suggestRule) : 'inherit'
        return (
          <div key={p.id} className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{ex?.name ?? '?'}</span>
              <span className="shrink-0 text-xs text-muted">
                {p.sets}×{p.repsMin === p.repsMax ? p.repsMin : `${p.repsMin}–${p.repsMax}`}
                {p.targetLoad !== undefined ? ` · ${formatKg(p.targetLoad)}` : ''}
                {p.targetRpe !== undefined ? ` · RPE ${formatNumber(p.targetRpe)}` : ''}
              </span>
            </div>
            <Select<ModeChoice | 'inherit'>
              value={choiceValue}
              options={[
                {
                  value: 'inherit',
                  label: `Comme le bloc (${MODE_LABELS[block.mode]}${block.mode === 'suggest' ? ` ${SUGGEST_LABELS[block.suggestRule]}` : ''})`,
                },
                ...MODE_CHOICES,
              ]}
              onChange={(c) =>
                editRule(p.id, (r) => {
                  if (c === 'inherit') {
                    r.mode = undefined
                    r.suggestRule = undefined
                  } else {
                    const { mode: m, suggestRule } = fromChoice(c)
                    r.mode = m
                    r.suggestRule = suggestRule
                  }
                })
              }
            />
            {mode === 'suggest' && (rule?.suggestRule ?? block.suggestRule) === 'rpe' && p.targetRpe === undefined && (
              <p className="text-xs text-muted">RPE visé non défini dans le modèle : 8 par défaut.</p>
            )}
            {mode === 'percent' && (
              <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr] items-center gap-x-2 gap-y-1.5 text-center">
                <span />
                <span className="text-xs text-muted">% 1RM</span>
                <span className="text-xs text-muted">Reps</span>
                <span className="text-xs text-muted">Séries</span>
                {Array.from({ length: block.weeks }, (_, w) => {
                  const row = rule?.percentWeeks[w] ?? {}
                  const set = (k: 'pct' | 'reps' | 'sets', v: number | undefined) =>
                    editRule(p.id, (r) => {
                      while (r.percentWeeks.length <= w) r.percentWeeks.push({})
                      r.percentWeeks[w] = { ...r.percentWeeks[w], [k]: v }
                    })
                  return (
                    <PercentRow key={w} week={w} pct={row.pct} reps={row.reps} sets={row.sets} defaultSets={p.sets} onChange={set} />
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </Card>
  )
}

function PercentRow({
  week,
  pct,
  reps,
  sets,
  defaultSets,
  onChange,
}: {
  week: number
  pct?: number
  reps?: number
  sets?: number
  defaultSets: number
  onChange: (k: 'pct' | 'reps' | 'sets', v: number | undefined) => void
}) {
  return (
    <>
      <span className="text-sm text-muted">S{week + 1}</span>
      <NumberField ariaLabel={`% semaine ${week + 1}`} value={pct} placeholder="–" onChange={(v) => onChange('pct', v)} />
      <NumberField ariaLabel={`Reps semaine ${week + 1}`} decimal={false} value={reps} placeholder="–" onChange={(v) => onChange('reps', v)} />
      <NumberField
        ariaLabel={`Séries semaine ${week + 1}`}
        decimal={false}
        value={sets}
        placeholder={String(defaultSets)}
        onChange={(v) => onChange('sets', v)}
      />
    </>
  )
}

function WeekExceptions({
  week,
  block,
  templates,
  mutateBlock,
  pickTemplate,
}: {
  week: number
  block: ProgramBlock
  templates: Map<string, Template>
  mutateBlock: BlockMutate
  pickTemplate: (onPick: (templateId: string) => void) => void
}) {
  const [open, setOpen] = useState(false)
  const ov = overrideFor(block, week)
  const summary = [
    ov?.deload && `Deload ${formatNumber(ov.deload.loadPct)} %`,
    ov?.mode && MODE_LABELS[ov.mode],
    ov?.replace.length && `${ov.replace.length} remplacée${ov.replace.length > 1 ? 's' : ''}`,
    ov?.skip.length && `${ov.skip.length} sautée${ov.skip.length > 1 ? 's' : ''}`,
    ov?.extra.length && `+${ov.extra.length} séance${ov.extra.length > 1 ? 's' : ''}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const edit = (fn: (o: WeekOverride) => void) => mutateBlock((b) => fn(ensureOverride(b, week)))

  return (
    <Card className="py-3">
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen(!open)}>
        <span className="font-medium">Semaine {week + 1}</span>
        <span className="truncate text-sm text-accent">{summary || <span className="text-muted">Semaine type</span>}</span>
        <span className="text-muted">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-4 border-t border-line pt-3">
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-5 w-5 accent-accent"
                checked={!!ov?.deload}
                onChange={(e) => edit((o) => (o.deload = e.target.checked ? { loadPct: 80, setsDelta: -1 } : undefined))}
              />
              <span>Deload</span>
            </label>
            {ov?.deload && (
              <div className="grid grid-cols-2 gap-2">
                <label>
                  <Label>Charges (%)</Label>
                  <NumberField value={ov.deload.loadPct} onChange={(v) => edit((o) => o.deload && (o.deload.loadPct = v ?? 100))} />
                </label>
                <label>
                  <Label>Séries (±)</Label>
                  <NumberField decimal={false} value={ov.deload.setsDelta} onChange={(v) => edit((o) => o.deload && (o.deload.setsDelta = v ?? 0))} />
                </label>
              </div>
            )}
          </div>

          <label className="block">
            <Label>Progression cette semaine</Label>
            <Select<ProgressionMode | 'inherit'>
              value={ov?.mode ?? 'inherit'}
              options={[
                { value: 'inherit', label: 'Comme d’habitude' },
                { value: 'free', label: 'Libre pour tout' },
                { value: 'suggest', label: 'Suggestion pour tout' },
                { value: 'percent', label: '% du 1RM pour tout' },
              ]}
              onChange={(m) => edit((o) => (o.mode = m === 'inherit' ? undefined : m))}
            />
          </label>

          <div className="space-y-2">
            <Label>Séances</Label>
            {block.slots.map((s) => {
              const replaced = ov?.replace.find((r) => r.slotId === s.id)
              const skipped = ov?.skip.includes(s.id)
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <span className={`min-w-0 flex-1 truncate ${skipped ? 'text-muted line-through' : ''}`}>
                    {templates.get(replaced?.templateId ?? s.templateId)?.name ?? '?'}
                    {replaced && <span className="text-xs text-accent"> (remplace {templates.get(s.templateId)?.name})</span>}
                  </span>
                  {replaced ? (
                    <Button variant="ghost" className="px-2 py-1 text-sm" onClick={() => edit((o) => (o.replace = o.replace.filter((r) => r.slotId !== s.id)))}>
                      Annuler
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-sm"
                      disabled={skipped}
                      onClick={() => pickTemplate((tid) => edit((o) => void o.replace.push({ slotId: s.id, templateId: tid })))}
                    >
                      Remplacer
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-sm"
                    onClick={() => edit((o) => (o.skip = skipped ? o.skip.filter((x) => x !== s.id) : [...o.skip, s.id]))}
                  >
                    {skipped ? 'Rétablir' : 'Sauter'}
                  </Button>
                </div>
              )
            })}
            {ov?.extra.map((x) => (
              <div key={x.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-accent">+ </span>
                  {templates.get(x.templateId)?.name ?? '?'}
                </span>
                <Button variant="ghost" className="px-2 py-1 text-sm" onClick={() => edit((o) => (o.extra = o.extra.filter((e) => e.id !== x.id)))}>
                  Retirer
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              className="w-full border border-dashed border-line text-sm"
              onClick={() => pickTemplate((tid) => edit((o) => void o.extra.push({ id: uid(), templateId: tid })))}
            >
              + Séance en plus
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
