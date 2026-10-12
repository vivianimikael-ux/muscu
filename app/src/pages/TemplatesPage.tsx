import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router'
import { db, live, save } from '../db/db'
import { localDay } from '../domain/dates'
import { uid } from '../domain/session'
import { Button, Card, Empty, PageHeader, SectionTitle } from '../ui/components'
import { describeWodFormat } from '../ui/format'
import { useExerciseMap } from '../ui/hooks'
import { newBlock } from '../ui/programActions'

/** Onglet "Plan" : programmes puis séances modèles. */
export function TemplatesPage() {
  const navigate = useNavigate()
  const templates = useLiveQuery(async () => live(await db.templates.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'fr')))
  const programs = useLiveQuery(async () =>
    live(await db.programs.toArray()).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'fr')),
  )
  const exercises = useExerciseMap()

  const createTemplate = async () => {
    const id = uid()
    await save(db.templates, { id, updatedAt: 0, name: 'Nouvelle séance', blocks: [] })
    navigate(`/modeles/${id}`)
  }

  const createProgram = async () => {
    const id = uid()
    await save(db.programs, {
      id,
      updatedAt: 0,
      name: 'Nouveau programme',
      startDate: localDay(),
      trainingDays: [1, 3, 5],
      active: false,
      blocks: [newBlock(1)],
      moves: {},
      skipped: [],
      calendarSlot: { start: '08:00', durationMin: 60 },
    })
    navigate(`/programmes/${id}`)
  }

  return (
    <>
      <PageHeader title="Plan" />
      <div className="px-4">
        <SectionTitle
          right={
            <Button variant="ghost" className="px-2 py-1 text-accent" onClick={createProgram}>
              + Programme
            </Button>
          }
        >
          Programmes
        </SectionTitle>
        <div className="space-y-2">
          {programs?.length === 0 && <p className="px-1 text-sm text-muted">Aucun programme. Un programme enchaîne des blocs de semaines types.</p>}
          {programs?.map((p) => (
            <Card key={p.id} onClick={() => navigate(`/programmes/${p.id}`)} className={p.active ? 'border border-accent/50' : ''}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{p.name}</span>
                {p.active && <span className="shrink-0 rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent">Actif</span>}
              </div>
              <div className="mt-1 truncate text-sm text-muted">
                {p.blocks.map((b) => `${b.name} (${b.weeks} sem.)`).join(' → ') || 'Aucun bloc'}
              </div>
            </Card>
          ))}
        </div>

        <SectionTitle
          right={
            <Button variant="ghost" className="px-2 py-1 text-accent" onClick={createTemplate}>
              + Modèle
            </Button>
          }
        >
          Séances modèles
        </SectionTitle>
        <div className="space-y-3">
          {templates?.length === 0 && <Empty>Aucun modèle. Crée ta première séance type.</Empty>}
          {templates?.map((t) => (
            <Card key={t.id} onClick={() => navigate(`/modeles/${t.id}`)}>
              <div className="font-semibold">{t.name}</div>
              <div className="mt-1 space-y-0.5 text-sm text-muted">
                {t.blocks.map((b) => (
                  <div key={b.id} className="truncate">
                    {b.kind === 'classic'
                      ? b.exercises.map((e) => exercises?.get(e.exerciseId)?.name ?? '?').join(' · ') || 'Bloc vide'
                      : `WOD ${b.name ? `« ${b.name} » ` : ''}— ${describeWodFormat(b.format)}`}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  )
}
