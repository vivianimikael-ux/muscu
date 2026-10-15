import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
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
import { describeWodFormat } from '../ui/format'
import type { Template } from '../domain/types'
import { nextOccurrence } from '../domain/program'
import { localDay, parseDay } from '../domain/dates'
import { occurrenceTitle, startProgramSession, useActiveProgram, useSchedule, useTemplateMap } from '../ui/programActions'

export function HomePage() {
  const navigate = useNavigate()
  const sessions = useSessions()
  const templates = useLiveQuery(async () =>
    live(await db.templates.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true })),
  )
  const [showWods, setShowWods] = useState(false)
  // Séances "WOD" : modèles ne contenant que des blocs WOD, regroupés dans une case repliable.
  const wodTemplates = templates?.filter(isWodOnly) ?? []
  const otherTemplates = templates?.filter((t) => !isWodOnly(t)) ?? []

  const sync = useSyncState()
  const program = useActiveProgram()
  const schedule = useSchedule(program)
  const templateMap = useTemplateMap()
  const next = schedule ? nextOccurrence(schedule) : undefined
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

  const startNext = async () => {
    if (!program || !next) return
    const existing = await inProgressSession()
    if (existing && !confirm(`« ${existing.name} » est encore en cours. En démarrer une autre quand même ?`)) {
      navigate(`/seance/${existing.id}`)
      return
    }
    navigate(`/seance/${await startProgramSession(program, next)}`)
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

        {program && next && next.status === 'planned' && (
          <>
            <SectionTitle>Prochaine séance · {program.name}</SectionTitle>
            <Card className="space-y-3">
              <div>
                <div className="text-lg font-bold">{occurrenceTitle(program, next, templateMap)}</div>
                <div className="text-sm text-muted">{describeDay(next.date)}</div>
              </div>
              <Button variant="primary" className="w-full py-3" onClick={() => void startNext()}>
                Démarrer
              </Button>
            </Card>
          </>
        )}
        {program && schedule && !next && <p className="mt-4 px-1 text-sm text-muted">Programme « {program.name} » terminé 🎉</p>}

        <SectionTitle>{program ? 'Autre séance' : 'Démarrer une séance'}</SectionTitle>
        <div className="space-y-2">
          {otherTemplates.map((t) => (
            <Card key={t.id} onClick={() => void start(t.id)} className="flex items-center justify-between">
              <span className="font-medium">{t.name}</span>
              <span className="text-accent">▶</span>
            </Card>
          ))}
          {wodTemplates.length > 0 && (
            <Card className="p-0">
              <button
                type="button"
                onClick={() => setShowWods(!showWods)}
                aria-expanded={showWods}
                className="flex w-full items-center justify-between rounded-2xl p-4 text-left active:bg-card-2"
              >
                <span className="font-medium">
                  WOD <span className="text-muted">· {wodTemplates.length}</span>
                </span>
                <span className="text-muted">{showWods ? '▴' : '▾'}</span>
              </button>
              {showWods && (
                <ul className="divide-y divide-line border-t border-line">
                  {wodTemplates.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => void start(t.id)}
                        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left active:bg-card-2"
                      >
                        <span className="min-w-0">
                          <span className="font-medium">{t.name}</span>
                          <span className="block truncate text-xs text-muted">
                            {t.blocks.map((b) => (b.kind === 'wod' ? describeWodFormat(b.format) : '')).join(' + ')}
                          </span>
                        </span>
                        <span className="text-accent">▶</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
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

function describeDay(day: string): string {
  const today = localDay()
  if (day === today) return 'Aujourd’hui'
  const tomorrow = localDay(parseDay(today) + 36 * 3600_000)
  if (day === tomorrow) return 'Demain'
  return formatDay(parseDay(day))
}

const isWodOnly = (t: Template) => t.blocks.length > 0 && t.blocks.every((b) => b.kind === 'wod')
