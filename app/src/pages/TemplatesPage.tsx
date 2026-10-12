import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router'
import { db, live, save } from '../db/db'
import { uid } from '../domain/session'
import { Button, Card, Empty, PageHeader } from '../ui/components'
import { describeWodFormat } from '../ui/format'
import { useExerciseMap } from '../ui/hooks'

export function TemplatesPage() {
  const navigate = useNavigate()
  const templates = useLiveQuery(async () => live(await db.templates.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'fr')))
  const exercises = useExerciseMap()

  const create = async () => {
    const id = uid()
    await save(db.templates, { id, updatedAt: 0, name: 'Nouvelle séance', blocks: [] })
    navigate(`/modeles/${id}`)
  }

  return (
    <>
      <PageHeader
        title="Séances modèles"
        right={
          <Button variant="primary" className="px-3 py-1.5" onClick={create}>
            + Nouveau
          </Button>
        }
      />
      <div className="space-y-3 px-4">
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
    </>
  )
}
