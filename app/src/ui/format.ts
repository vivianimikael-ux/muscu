import { formatDuration } from '../domain/exercise'
import type { ProgressionMode, SuggestRule, WodFormat, WodFormatType, WodScore } from '../domain/types'

export const WOD_FORMAT_LABELS: Record<WodFormatType, string> = {
  for_time: 'Rounds / For Time',
  amrap: 'AMRAP',
  emom: 'EMOM',
  intervals: 'Intervalles / Tabata',
}

export function defaultWodFormat(type: WodFormatType): WodFormat {
  switch (type) {
    case 'for_time':
      return { type, rounds: 5 }
    case 'amrap':
      return { type, durationSec: 12 * 60 }
    case 'emom':
      return { type, intervalSec: 60, intervals: 10, alternate: false }
    case 'intervals':
      return { type, workSec: 20, restSec: 10, cycles: 8 }
  }
}

export function emomName(intervalSec: number): string {
  if (intervalSec === 60) return 'EMOM'
  if (intervalSec % 60 === 0) return `E${intervalSec / 60}MOM`
  return `Toutes les ${formatDuration(intervalSec)}`
}

export function describeWodFormat(f: WodFormat): string {
  switch (f.type) {
    case 'for_time':
      return `For Time · ${f.rounds} tour${f.rounds > 1 ? 's' : ''}${f.capSec ? ` · cap ${formatDuration(f.capSec)}` : ''}`
    case 'amrap':
      return `AMRAP ${formatDuration(f.durationSec)}`
    case 'emom':
      return `${emomName(f.intervalSec)} × ${f.intervals}${f.alternate ? ' · alterné' : ''}`
    case 'intervals':
      return `${f.cycles} × ${f.workSec} s / ${f.restSec} s`
  }
}

export function describeScore(s: WodScore | undefined): string {
  if (!s) return '—'
  switch (s.type) {
    case 'time':
      return formatDuration(s.sec)
    case 'rounds':
      return `${s.rounds} tour${s.rounds > 1 ? 's' : ''}${s.reps ? ` + ${s.reps}` : ''}`
    case 'intervals':
      return `${s.held}/${s.total} intervalles`
    case 'reps': {
      const total = s.perInterval.reduce((a, b) => a + b, 0)
      return `${total} reps (min ${Math.min(...s.perInterval)})`
    }
  }
}

/** Analyse "12:30" → 750 s ; un nombre seul est exprimé dans `plainUnit`. */
export function parseDuration(text: string, plainUnit: 'min' | 's'): number | undefined {
  const t = text.trim().replace(',', '.')
  if (!t) return undefined
  if (t.includes(':')) {
    const [m, s] = t.split(':')
    const mm = Number(m || 0)
    const ss = Number(s || 0)
    if (!Number.isFinite(mm) || !Number.isFinite(ss)) return undefined
    return Math.round(mm * 60 + ss)
  }
  const n = Number(t)
  if (!Number.isFinite(n)) return undefined
  return Math.round(plainUnit === 'min' ? n * 60 : n)
}

export const MODE_LABELS: Record<ProgressionMode, string> = {
  free: 'Libre',
  suggest: 'Suggestion',
  percent: '% du 1RM',
}

export const SUGGEST_LABELS: Record<SuggestRule, string> = {
  rpe: 'selon le RPE',
  double: 'double progression',
}
