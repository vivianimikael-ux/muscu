import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router'
import { db, live } from '../db/db'
import { formatDay } from '../domain/dates'
import { formatDuration } from '../domain/exercise'
import { sessionProgress } from '../domain/session'
import { isDone, sessionTime } from '../domain/stats'
import { inProgressSession, startSession } from '../ui/actions'
import { Button, Card, Empty, PageHeader, SectionTitle } from '../ui/components'
import { useSyncState } from '../ui/AccountSection'
import { useSessions } from '../ui/hooks'

export function HomePage() {
  const navigate = useNavigate()
  const sessions = useSessions()
  const templates = useLiveQuery(async () => live(await db.templates.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'fr')))

  const sync = useSyncState()
  const current = sessions?.find((s) => s.status === 'in_progress')
  const recent = (sessions ?? [])
    .filter(isDone)
    .sort((a, b) => sessionTime(b) - sessionTime(a))
    .slice(0, 5)

  const start = async (templateId?: string) => {
    const existing = await inProgressSession()
    if (existing && !confirm(`« ${existing.name} » est encore en cours. En démarrer une autre quand même ?`)) {
      navigate(`/seance/${existing.id}`)
      return
    }
    navigate(`/seance/${await startSession(templateId)}`)
  }

  return (
    <>
      <PageHeader title="Muscu" />
      <div className="px-4">
        {sync.status === 'signed_out' && (
          <button
            type="button"
            onClick={() => navigate('/reglages')}
            className="mb-3 w-full rounded-xl bg-card-2 px-3 py-2 text-left text-sm text-muted"
          >
            Données uniquement sur cet appareil. <span className="text-accent">Se connecter pour les sauvegarder ›</span>
          </button>
        )}
        {current && (
          <Card onClick={() => navigate(`/seance/${current.id}`)} className="border border-accent/50 bg-accent/10">
            <div className="text-xs font-semibold text-accent uppercase">En cours</div>
            <div className="text-lg font-bold">{current.name}</div>
            <div className="text-sm text-muted">
              {sessionProgress(current).doneSets}/{sessionProgress(current).totalSets} séries · Reprendre ›
            </div>
          </Card>
        )}

        <SectionTitle>Démarrer une séance</SectionTitle>
        <div className="space-y-2">
          {templates?.map((t) => (
            <Card key={t.id} onClick={() => void start(t.id)} className="flex items-center justify-between">
              <span className="font-medium">{t.name}</span>
              <span className="text-accent">▶</span>
            </Card>
          ))}
          {templates?.length === 0 && (
            <p className="px-1 text-sm text-muted">
              Aucun modèle pour l’instant :{' '}
              <button type="button" className="text-accent underline" onClick={() => navigate('/modeles')}>
                crée ta première séance type
              </button>
              .
            </p>
          )}
          <Button className="w-full" onClick={() => void start()}>
            Séance libre
          </Button>
        </div>

        <SectionTitle>Dernières séances</SectionTitle>
        {recent.length === 0 ? (
          <Empty>Pas encore de séance terminée.</Empty>
        ) : (
          <div className="space-y-2">
            {recent.map((s) => (
              <Card key={s.id} onClick={() => navigate(`/seance/${s.id}`)}>
                <div className="flex justify-between gap-2">
                  <span className="truncate font-medium">{s.name}</span>
                  <span className="shrink-0 text-sm text-muted">{formatDay(sessionTime(s))}</span>
                </div>
                <div className="text-sm text-muted">
                  {sessionProgress(s).doneSets} séries
                  {s.startedAt && s.completedAt ? ` · ${formatDuration((s.completedAt - s.startedAt) / 1000)}` : ''}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
