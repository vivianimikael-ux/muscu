import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { db, softDelete } from '../db/db'
import { formatDay, localDay, parseDay } from '../domain/dates'
import type { ScheduledOccurrence } from '../domain/program'
import { uid } from '../domain/session'
import type { Program } from '../domain/types'
import { ActionSheet, Button, Card, Empty, Label, NumberField, PageHeader, SectionTitle, Sheet, TextField } from '../ui/components'
import { MODE_LABELS } from '../ui/format'
import { activateProgram, newBlock, occurrenceTitle, startProgramSession, useSchedule, useTemplateMap } from '../ui/programActions'
import { moveItem, useEditableDoc } from '../ui/useEditableDoc'

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

const dateInputClass = 'w-full rounded-xl bg-card-2 px-3 py-2.5 text-fg outline-none [color-scheme:dark]'

export function ProgramEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [program, mutate] = useEditableDoc(db.programs, id)
  const templates = useTemplateMap()
  const schedule = useSchedule(program ?? undefined)
  const [menu, setMenu] = useState(false)
  const [blockMenu, setBlockMenu] = useState<number>()
  const [occMenu, setOccMenu] = useState<ScheduledOccurrence>()
  const [moving, setMoving] = useState<ScheduledOccurrence>()
  const [showAll, setShowAll] = useState(false)

  if (program === undefined) return null
  if (program === null) return <Empty>Programme introuvable.</Empty>

  const toggleDay = (d: number) =>
    mutate((p) => {
      p.trainingDays = p.trainingDays.includes(d) ? p.trainingDays.filter((x) => x !== d) : [...p.trainingDays, d].sort()
    })

  const today = localDay()
  const visible = (schedule ?? []).filter((o) => showAll || (o.status !== 'done' && o.status !== 'skipped') || o.date >= today)
  const doneCount = (schedule ?? []).filter((o) => o.status === 'done').length
  const total = (schedule ?? []).filter((o) => o.status !== 'skipped').length

  return (
    <div className="pb-safe mx-auto min-h-dvh max-w-xl">
      <PageHeader
        title="Programme"
        back
        right={
          <button type="button" className="px-2 text-2xl text-muted" onClick={() => setMenu(true)} aria-label="Actions">
            ⋯
          </button>
        }
      />
      <div className="space-y-4 px-4 pb-10">
        <TextField value={program.name} onChange={(name) => mutate((p) => void (p.name = name))} placeholder="Nom du programme" />

        <Card className="flex items-center justify-between">
          <div>
            <div className="font-medium">{program.active ? 'Programme actif' : 'Programme inactif'}</div>
            <div className="text-xs text-muted">
              {program.active ? 'Ses séances sont proposées à l’accueil et envoyées au calendrier.' : 'Un seul programme actif à la fois.'}
            </div>
          </div>
          <Button variant={program.active ? 'secondary' : 'primary'} onClick={() => void activateProgram(program.id, !program.active)}>
            {program.active ? 'Désactiver' : 'Activer'}
          </Button>
        </Card>

        <Card className="space-y-4">
          <label className="block">
            <Label>Date de début</Label>
            <input
              type="date"
              value={program.startDate}
              onChange={(e) => e.target.value && mutate((p) => void (p.startDate = e.target.value))}
              className={dateInputClass}
            />
          </label>
          <div>
            <Label>Jours d’entraînement</Label>
            <div className="flex gap-1.5">
              {DAYS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i + 1)}
                  className={`h-10 flex-1 rounded-lg font-semibold ${program.trainingDays.includes(i + 1) ? 'bg-accent text-white' : 'bg-card-2 text-muted'}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <Label>Heure (calendrier)</Label>
              <input
                type="time"
                value={program.calendarSlot.start}
                onChange={(e) => e.target.value && mutate((p) => void (p.calendarSlot.start = e.target.value))}
                className={dateInputClass}
              />
            </label>
            <label>
              <Label>Durée (min)</Label>
              <NumberField decimal={false} value={program.calendarSlot.durationMin} onChange={(v) => mutate((p) => void (p.calendarSlot.durationMin = v ?? 60))} />
            </label>
          </div>
        </Card>

        <SectionTitle>Blocs</SectionTitle>
        <div className="space-y-2">
          {program.blocks.map((b, i) => (
            <Card key={b.id} className="flex items-center gap-2">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => navigate(`/programmes/${program.id}/blocs/${b.id}`)}>
                <div className="font-semibold">
                  {b.name} <span className="font-normal text-muted">· {b.weeks} sem.</span>
                </div>
                <div className="truncate text-sm text-muted">
                  {MODE_LABELS[b.mode]} · {b.slots.map((s) => templates?.get(s.templateId)?.name ?? '?').join(', ') || 'semaine type vide'}
                </div>
              </button>
              <button type="button" className="px-2 text-xl text-muted" onClick={() => setBlockMenu(i)} aria-label="Actions du bloc">
                ⋯
              </button>
            </Card>
          ))}
          <Button className="w-full" onClick={() => mutate((p) => void p.blocks.push(newBlock(p.blocks.length + 1)))}>
            + Bloc
          </Button>
        </div>

        <SectionTitle
          right={
            doneCount > 0 && (
              <button type="button" className="text-sm text-accent" onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Masquer les passées' : 'Tout afficher'}
              </button>
            )
          }
        >
          Planning · {doneCount}/{total} faites
        </SectionTitle>
        {program.trainingDays.length === 0 && <p className="px-1 text-sm text-danger">Choisis au moins un jour d’entraînement.</p>}
        {program.blocks.some((b) => b.slots.length > 0 && b.slots.length !== program.trainingDays.length) && (
          <p className="px-1 text-xs text-muted">
            ⚠︎ Un bloc a un nombre de séances par semaine différent du nombre de jours d’entraînement ({program.trainingDays.length}) : les
            séances s’enchaînent dans l’ordre, donc les semaines du programme ne tomberont pas pile sur les semaines du calendrier.
          </p>
        )}
        <div className="space-y-1.5">
          {visible.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setOccMenu(o)}
              className={`flex w-full items-center gap-3 rounded-xl bg-card px-3 py-2.5 text-left ${o.status === 'skipped' ? 'opacity-40' : ''}`}
            >
              <span className={`w-24 shrink-0 text-sm ${o.date === today ? 'font-semibold text-accent' : 'text-muted'}`}>
                {o.status === 'skipped' ? 'Sautée' : o.date === today ? 'Aujourd’hui' : formatDay(parseDay(o.date))}
              </span>
              <span className="min-w-0 flex-1 truncate">{occurrenceTitle(program, o, templates)}</span>
              <span className="shrink-0 text-sm">{o.status === 'done' ? '✓' : o.status === 'in_progress' ? '▶' : o.moved ? '📌' : ''}</span>
            </button>
          ))}
        </div>
      </div>

      <ActionSheet
        open={menu}
        onClose={() => setMenu(false)}
        title={program.name}
        actions={[
          {
            label: 'Dupliquer le programme',
            onClick: async () => {
              const copy: Program = { ...structuredClone(program), id: uid(), name: `${program.name} (copie)`, active: false, moves: {}, skipped: [], schedule: undefined, updatedAt: Date.now() }
              await db.programs.put(copy)
              navigate(`/programmes/${copy.id}`, { replace: true })
            },
          },
          {
            label: 'Supprimer le programme',
            danger: true,
            onClick: async () => {
              if (!confirm(`Supprimer « ${program.name} » ? Les séances déjà faites restent dans l’historique.`)) return
              await softDelete(db.programs, program.id)
              navigate('/modeles', { replace: true })
            },
          },
        ]}
      />

      <ActionSheet
        open={blockMenu !== undefined}
        onClose={() => setBlockMenu(undefined)}
        title={blockMenu !== undefined ? program.blocks[blockMenu]?.name ?? 'Bloc' : 'Bloc'}
        actions={
          blockMenu === undefined
            ? []
            : [
                { label: 'Monter', disabled: blockMenu === 0, onClick: () => mutate((p) => moveItem(p.blocks, blockMenu, -1)) },
                { label: 'Descendre', disabled: blockMenu === program.blocks.length - 1, onClick: () => mutate((p) => moveItem(p.blocks, blockMenu, 1)) },
                {
                  label: 'Dupliquer',
                  onClick: () =>
                    mutate((p) => {
                      const copy = structuredClone(p.blocks[blockMenu])
                      copy.id = uid()
                      copy.name = `${copy.name} (copie)`
                      p.blocks.splice(blockMenu + 1, 0, copy)
                    }),
                },
                {
                  label: 'Supprimer le bloc',
                  danger: true,
                  onClick: () => {
                    if (confirm('Supprimer ce bloc ?')) mutate((p) => void p.blocks.splice(blockMenu, 1))
                  },
                },
              ]
        }
      />

      <ActionSheet
        open={occMenu !== undefined}
        onClose={() => setOccMenu(undefined)}
        title={occMenu ? occurrenceTitle(program, occMenu, templates) : ''}
        actions={occMenu ? occurrenceActions(occMenu) : []}
      />

      <MoveSheet
        occ={moving}
        onClose={() => setMoving(undefined)}
        onMove={(key, date) => mutate((p) => void (p.moves[key] = date))}
      />
    </div>
  )

  function occurrenceActions(o: ScheduledOccurrence) {
    if (o.status === 'done' || o.status === 'in_progress') {
      return [{ label: 'Ouvrir la séance', onClick: () => o.sessionId && navigate(`/seance/${o.sessionId}`) }]
    }
    if (o.status === 'skipped') {
      return [{ label: 'Rétablir la séance', onClick: () => mutate((p) => void (p.skipped = p.skipped.filter((k) => k !== o.key))) }]
    }
    return [
      {
        label: 'Démarrer maintenant',
        onClick: async () => navigate(`/seance/${await startProgramSession(program!, o)}`),
      },
      { label: 'Déplacer à une date…', onClick: () => setMoving(o) },
      ...(o.moved ? [{ label: 'Remettre dans le flux', onClick: () => mutate((p) => void delete p.moves[o.key]) }] : []),
      { label: 'Sauter cette séance', danger: true, onClick: () => mutate((p) => void p.skipped.push(o.key)) },
    ]
  }
}

function MoveSheet({ occ, onClose, onMove }: { occ: ScheduledOccurrence | undefined; onClose: () => void; onMove: (key: string, date: string) => void }) {
  const [date, setDate] = useState('')
  return (
    <Sheet open={occ !== undefined} onClose={onClose} title="Déplacer la séance">
      <div className="space-y-3">
        <input type="date" value={date || occ?.date || ''} onChange={(e) => setDate(e.target.value)} className={dateInputClass} />
        <p className="text-xs text-muted">La séance garde cette date ; les autres continuent sur les jours d’entraînement.</p>
        <Button
          variant="primary"
          className="w-full"
          onClick={() => {
            if (occ) onMove(occ.key, date || occ.date)
            setDate('')
            onClose()
          }}
        >
          Déplacer
        </Button>
      </div>
    </Sheet>
  )
}
