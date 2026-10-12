import { useState } from 'react'
import { db, save, softDelete } from '../db/db'
import { formatDay, localDay, parseDay } from '../domain/dates'
import { formatKg } from '../domain/exercise'
import { uid } from '../domain/session'
import { Button, Card, Label, NumberField, PageHeader, SectionTitle } from '../ui/components'
import { AccountSection } from '../ui/AccountSection'
import { useBodyweights } from '../ui/hooks'

export function SettingsPage() {
  const bodyweights = useBodyweights()
  const [kg, setKg] = useState<number>()
  const sorted = [...(bodyweights ?? [])].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <>
      <PageHeader title="Réglages" />
      <div className="px-4">
        <SectionTitle>Poids de corps</SectionTitle>
        <Card className="space-y-3">
          <p className="text-sm text-muted">Sert au calcul des exercices au poids du corps (tractions, dips…). Chaque pesée est datée.</p>
          <div className="flex items-end gap-2">
            <label className="flex-1">
              <Label>Poids aujourd’hui (kg)</Label>
              <NumberField value={kg} onChange={setKg} placeholder={sorted[0] ? String(sorted[0].kg).replace('.', ',') : '–'} />
            </label>
            <Button
              variant="primary"
              disabled={kg === undefined}
              onClick={async () => {
                if (kg === undefined) return
                const today = localDay()
                // Une pesée par jour : on remplace celle du jour si elle existe.
                const existing = sorted.find((b) => b.date === today)
                await save(db.bodyweights, { id: existing?.id ?? uid(), updatedAt: 0, date: today, kg })
                setKg(undefined)
              }}
            >
              Enregistrer
            </Button>
          </div>
          {sorted.slice(0, 5).map((b) => (
            <div key={b.id} className="flex justify-between text-sm">
              <span className="text-muted">{formatDay(parseDay(b.date))}</span>
              <span className="flex gap-3">
                {formatKg(b.kg)}
                <button type="button" className="text-muted" onClick={() => void softDelete(db.bodyweights, b.id)} aria-label="Supprimer">
                  ✕
                </button>
              </span>
            </div>
          ))}
        </Card>

        <AccountSection />
      </div>
    </>
  )
}
