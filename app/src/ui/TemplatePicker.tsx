import { useLiveQuery } from 'dexie-react-hooks'
import { db, live } from '../db/db'
import { Empty, Sheet } from './components'

export function TemplatePicker({
  open,
  onClose,
  onPick,
  title = 'Choisir une séance modèle',
}: {
  open: boolean
  onClose: () => void
  onPick: (templateId: string) => void
  title?: string
}) {
  const templates = useLiveQuery(async () => live(await db.templates.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'fr')))
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {templates?.length === 0 && <Empty>Aucun modèle : crée d’abord une séance modèle dans l’onglet Plan.</Empty>}
      <ul className="divide-y divide-line">
        {templates?.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className="w-full py-3 text-left"
              onClick={() => {
                onPick(t.id)
                onClose()
              }}
            >
              {t.name}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
