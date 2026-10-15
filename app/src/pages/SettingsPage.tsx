import { useState } from 'react'
import { db, save, softDelete } from '../db/db'
import { formatDay, localDay, parseDay } from '../domain/dates'
import { formatKg } from '../domain/exercise'
import { uid } from '../domain/session'
import { Button, Card, Label, NumberField, PageHeader, SectionTitle } from '../ui/components'
import { AccountSection } from '../ui/AccountSection'
import { importFile, removeNotionImport } from '../ui/importData'
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

        <SectionTitle>Données</SectionTitle>
        <ImportCard />
      </div>
    </>
  )
}

function ImportCard() {
  const [message, setMessage] = useState<{ text: string; error?: boolean }>()
  const [busy, setBusy] = useState(false)
  return (
    <Card className="space-y-3">
      <p className="text-sm text-muted">Importer un fichier de séances (ex : export Notion). Relancer un import met à jour sans dupliquer.</p>
      <label className={`block w-full cursor-pointer rounded-xl bg-card-2 px-4 py-2.5 text-center font-medium ${busy ? 'opacity-40' : ''}`}>
        Importer des données…
        <input
          type="file"
          accept="application/json,.json"
          className="hidden"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            setBusy(true)
            setMessage(undefined)
            try {
              const r = await importFile(file)
              setMessage({ text: `Importé : ${r.sessions} séances, ${r.exercises} exercices, ${r.maxTests} max testés.` })
            } catch (err) {
              setMessage({ text: err instanceof Error ? err.message : String(err), error: true })
            } finally {
              setBusy(false)
            }
          }}
        />
      </label>
      <button
        type="button"
        className="text-sm text-muted underline"
        disabled={busy}
        onClick={async () => {
          if (!confirm('Retirer toutes les séances, exercices et max importés depuis Notion ?')) return
          const n = await removeNotionImport()
          setMessage({ text: `${n} éléments importés retirés.` })
        }}
      >
        Annuler l’import Notion
      </button>
      {message && <p className={`text-sm ${message.error ? 'text-danger' : 'text-ok'}`}>{message.text}</p>}
    </Card>
  )
}
