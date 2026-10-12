import type { WodFormat, WodFormatType } from '../domain/types'
import { DurationField, Label, NumberField, Select } from './components'
import { WOD_FORMAT_LABELS, defaultWodFormat } from './format'

const TYPES = Object.keys(WOD_FORMAT_LABELS) as WodFormatType[]

/** Paramètres d'un format de WOD (type + durées / tours). */
export function WodFormatEditor({ format, onChange }: { format: WodFormat; onChange: (f: WodFormat) => void }) {
  return (
    <div className="space-y-3">
      <Select
        value={format.type}
        onChange={(t) => onChange(defaultWodFormat(t))}
        options={TYPES.map((t) => ({ value: t, label: WOD_FORMAT_LABELS[t] }))}
      />
      <div className="grid grid-cols-3 gap-2">
        {format.type === 'for_time' && (
          <>
            <label>
              <Label>Tours</Label>
              <NumberField decimal={false} value={format.rounds} onChange={(v) => onChange({ ...format, rounds: v ?? 1 })} />
            </label>
            <label>
              <Label>Time cap</Label>
              <DurationField plainUnit="min" placeholder="aucun" value={format.capSec} onChange={(v) => onChange({ ...format, capSec: v || undefined })} />
            </label>
          </>
        )}
        {format.type === 'amrap' && (
          <label>
            <Label>Durée</Label>
            <DurationField plainUnit="min" value={format.durationSec} onChange={(v) => onChange({ ...format, durationSec: v ?? 60 })} />
          </label>
        )}
        {format.type === 'emom' && (
          <>
            <label>
              <Label>Toutes les</Label>
              <DurationField plainUnit="min" value={format.intervalSec} onChange={(v) => onChange({ ...format, intervalSec: v ?? 60 })} />
            </label>
            <label>
              <Label>Intervalles</Label>
              <NumberField decimal={false} value={format.intervals} onChange={(v) => onChange({ ...format, intervals: v ?? 1 })} />
            </label>
            <label className="flex flex-col">
              <Label>Alterner</Label>
              <input
                type="checkbox"
                checked={format.alternate}
                onChange={(e) => onChange({ ...format, alternate: e.target.checked })}
                className="mt-2 h-6 w-6 accent-accent"
              />
            </label>
          </>
        )}
        {format.type === 'intervals' && (
          <>
            <label>
              <Label>Travail (s)</Label>
              <NumberField decimal={false} value={format.workSec} onChange={(v) => onChange({ ...format, workSec: v ?? 20 })} />
            </label>
            <label>
              <Label>Repos (s)</Label>
              <NumberField decimal={false} value={format.restSec} onChange={(v) => onChange({ ...format, restSec: v ?? 0 })} />
            </label>
            <label>
              <Label>Cycles</Label>
              <NumberField decimal={false} value={format.cycles} onChange={(v) => onChange({ ...format, cycles: v ?? 1 })} />
            </label>
          </>
        )}
      </div>
      {format.type === 'emom' && format.alternate && (
        <p className="text-xs text-muted">Alterné : un exercice par intervalle, à tour de rôle.</p>
      )}
      {format.type === 'intervals' && <p className="text-xs text-muted">Avec plusieurs exercices, ils tournent d'un cycle à l'autre.</p>}
    </div>
  )
}
