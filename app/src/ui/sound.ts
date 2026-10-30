// Bips des minuteurs via Web Audio.
//
// Contraintes iOS :
// - l'AudioContext doit être créé / repris pendant un geste utilisateur :
//   unlockAudio() est appelé à chaque toucher (installAudioUnlock) ;
// - iOS le suspend ("suspended" / "interrupted") après une interruption
//   (musique, appel, mise en arrière-plan) : on le reprend avant de jouer ;
// - les minuteurs JS sont bridés : les bips de fin de repos sont donc
//   PROGRAMMÉS à l'avance sur l'horloge audio (scheduleRestBeeps), au lieu
//   d'être déclenchés par un minuteur au bon moment ;
// - aucun son app en arrière-plan / écran verrouillé (SPECS §9) : l'écran
//   est maintenu allumé pendant la séance (useWakeLock).

import type { TimerCue } from '../domain/wodTimer'

let ctx: AudioContext | undefined

/** Crée / reprend l'AudioContext ; résolu quand il tourne (ou jamais sans audio). */
export function unlockAudio(): Promise<void> {
  try {
    ctx ??= new AudioContext()
    if (ctx.state !== 'running') return ctx.resume().catch(() => undefined)
  } catch {
    // Pas d'audio disponible : les minuteurs restent visuels.
  }
  return Promise.resolve()
}

/** Reprend l'audio à chaque toucher et à chaque retour dans l'app. */
export function installAudioUnlock(onUnlocked: () => void): () => void {
  const unlock = () => void unlockAudio().then(onUnlocked)
  const onVisible = () => {
    if (document.visibilityState === 'visible') unlock()
  }
  document.addEventListener('pointerdown', unlock, { passive: true })
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    document.removeEventListener('pointerdown', unlock)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

const running = () => ctx?.state === 'running'

/** Programme un bip à l'instant audio `at` (secondes, horloge de l'AudioContext). */
function toneAt(freq: number, durationMs: number, at: number): OscillatorNode | undefined {
  if (!ctx) return undefined
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = freq
  osc.type = 'sine'
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.5, at + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + durationMs / 1000)
  osc.connect(gain).connect(ctx.destination)
  osc.start(at)
  osc.stop(at + durationMs / 1000 + 0.05)
  return osc
}

const END_TONES: [freq: number, durationMs: number, delayMs: number][] = [
  [1320, 200, 0],
  [1320, 200, 250],
  [1760, 600, 500],
]

function playNow(cue: TimerCue) {
  if (!ctx) return
  const t = ctx.currentTime
  switch (cue) {
    case 'tick':
      toneAt(880, 120, t)
      break
    case 'go':
      toneAt(1320, 450, t)
      break
    case 'rest':
      toneAt(660, 450, t)
      break
    case 'end':
      END_TONES.forEach(([f, d, delay]) => toneAt(f, d, t + delay / 1000))
      break
  }
}

/** Joue un signal tout de suite (minuteurs WOD), en reprenant l'audio si iOS l'a suspendu. */
export function playCue(cue: TimerCue): void {
  if (running()) playNow(cue)
  else if (ctx) void ctx.resume().then(() => running() && playNow(cue), () => undefined)
  if (cue !== 'tick') navigator.vibrate?.(cue === 'end' ? [200, 100, 200] : 200)
}

// ---------------------------------------------------------------------------
// Repos : bips programmés à l'avance

let restNodes: OscillatorNode[] = []
let restScheduledFor: number | undefined

function cancelRestBeeps() {
  for (const o of restNodes) {
    try {
      o.stop()
    } catch {
      // déjà arrêté
    }
    o.disconnect()
  }
  restNodes = []
  restScheduledFor = undefined
}

/**
 * Programme les bips d'un repos qui se termine à `endsAt` (ms) : 3 bips
 * courts sur les 3 dernières secondes puis le signal de fin. Remplace toute
 * programmation précédente ; `undefined` annule. Sans effet si l'audio
 * n'est pas encore débloqué (reprogrammé au prochain toucher).
 */
export function scheduleRestBeeps(endsAt: number | undefined, force = false): void {
  if (!force && endsAt === restScheduledFor && (endsAt === undefined || restNodes.length > 0)) return
  cancelRestBeeps()
  if (endsAt === undefined || !ctx || !running()) return
  const secsLeft = (endsAt - Date.now()) / 1000
  if (secsLeft <= 0) return
  const base = ctx.currentTime + secsLeft
  for (const k of [3, 2, 1]) {
    if (secsLeft - k > 0.05) restNodes.push(toneAt(880, 120, base - k)!)
  }
  for (const [f, d, delay] of END_TONES) restNodes.push(toneAt(f, d, base + delay / 1000)!)
  restScheduledFor = endsAt
}
