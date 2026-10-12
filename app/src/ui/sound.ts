// Bips des minuteurs via Web Audio. Sur iOS, l'AudioContext doit être
// créé/repris pendant un geste utilisateur : appeler unlockAudio() dans le
// gestionnaire du bouton qui démarre un minuteur ou valide une série.
// Limite connue (SPECS §9) : aucun son app en arrière-plan / écran verrouillé.

import type { TimerCue } from '../domain/wodTimer'

let ctx: AudioContext | undefined

export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    // Pas d'audio disponible : les minuteurs restent visuels.
  }
}

function tone(freq: number, durationMs: number, delayMs = 0): void {
  if (!ctx || ctx.state !== 'running') return
  const start = ctx.currentTime + delayMs / 1000
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = freq
  osc.type = 'sine'
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(0.5, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000)
  osc.connect(gain).connect(ctx.destination)
  osc.start(start)
  osc.stop(start + durationMs / 1000 + 0.05)
}

export function playCue(cue: TimerCue): void {
  switch (cue) {
    case 'tick':
      tone(880, 120)
      break
    case 'go':
      tone(1320, 450)
      break
    case 'rest':
      tone(660, 450)
      break
    case 'end':
      tone(1320, 200)
      tone(1320, 200, 250)
      tone(1760, 600, 500)
      break
  }
  if (cue !== 'tick') navigator.vibrate?.(cue === 'end' ? [200, 100, 200] : 200)
}
