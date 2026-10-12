import { Component, type ReactNode } from 'react'

/**
 * Filet de sécurité : une erreur d'affichage montre un message et un bouton
 * de rechargement au lieu d'un écran noir. Les données (IndexedDB) ne sont
 * pas touchées.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="pt-safe mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-4xl">😵</div>
        <h1 className="text-xl font-bold">Oups, un problème d’affichage</h1>
        <p className="text-sm text-muted">Tes données ne sont pas perdues. Recharger l’app règle le problème dans la plupart des cas.</p>
        <button
          type="button"
          className="rounded-xl bg-accent px-6 py-3 font-semibold text-white"
          onClick={() => {
            location.hash = '#/'
            location.reload()
          }}
        >
          Recharger
        </button>
        <p className="max-w-full truncate text-xs text-muted/60">{this.state.error.message}</p>
      </div>
    )
  }
}
