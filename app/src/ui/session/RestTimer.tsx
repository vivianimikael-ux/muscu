import { formatDuration } from '../../domain/exercise'
import { useNow } from '../hooks'

/** Barre de repos collée en bas de l'écran (les bips sont gérés au niveau de l'app : useRestBeeps). */
export function RestTimer({ endsAt, onChange }: { endsAt: number | undefined; onChange: (endsAt: number | undefined) => void }) {
  const active = endsAt !== undefined
  const now = useNow(active, 200)
  const remaining = active ? Math.ceil((endsAt - now) / 1000) : 0

  if (!active) return null
  const over = remaining <= 0
  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-40">
      <div className={`mx-auto flex max-w-xl items-center gap-2 px-4 py-3 ${over ? 'bg-ok/90' : 'bg-card-2'} border-t border-line`}>
        <div className="flex-1">
          <div className="text-xs text-fg/70">{over ? 'Repos terminé' : 'Repos'}</div>
          <div className="text-3xl font-bold tabular-nums">{over ? `+${formatDuration(-remaining)}` : formatDuration(remaining)}</div>
        </div>
        <button type="button" className="rounded-lg bg-black/20 px-3 py-2" onClick={() => onChange(endsAt - 15_000)}>
          −15
        </button>
        <button type="button" className="rounded-lg bg-black/20 px-3 py-2" onClick={() => onChange(endsAt + 15_000)}>
          +15
        </button>
        <button type="button" className="rounded-lg bg-black/30 px-3 py-2 font-semibold" onClick={() => onChange(undefined)}>
          {over ? 'OK' : 'Passer'}
        </button>
      </div>
    </div>
  )
}
