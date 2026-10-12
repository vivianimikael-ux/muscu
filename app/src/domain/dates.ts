// Dates "jour" au format YYYY-MM-DD, toujours en heure LOCALE (une séance
// faite à 23h30 appartient à ce jour-là, pas au lendemain en UTC).

export function localDay(ts: number = Date.now()): string {
  const d = new Date(ts)
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Minuit local du jour donné. */
export function parseDay(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

const dayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
const longFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export const formatDay = (ts: number) => dayFormatter.format(ts)
export const formatLongDay = (ts: number) => longFormatter.format(ts)
