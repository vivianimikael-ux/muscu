import { useEffect, useState, useSyncExternalStore } from 'react'
import { formatDay } from '../domain/dates'
import { appUrl, supabase } from '../sync/supabase'
import { resetSyncCursors, syncNow, syncStore } from '../sync/sync'
import { Button, Card, Label, SectionTitle } from './components'

export const useSyncState = () => useSyncExternalStore(syncStore.subscribe, syncStore.get)

const passkeysSupported = () => typeof window !== 'undefined' && 'PublicKeyCredential' in window

/** Messages d'erreur Supabase les plus courants, en clair. */
function explain(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou mot de passe incorrect.'
  if (m.includes('email not confirmed')) return 'Confirme d’abord ton e-mail via le lien reçu, puis reconnecte-toi.'
  if (m.includes('already registered')) return 'Un compte existe déjà avec cet e-mail : connecte-toi.'
  if (m.includes('password should be')) return 'Mot de passe trop court (8 caractères minimum conseillés).'
  if (m.includes('signups not allowed')) return 'La création de compte est désactivée.'
  if (m.includes('notallowederror') || m.includes('not allowed') || m.includes('aborted')) return 'Opération annulée.'
  return message
}

const inputClass = 'w-full rounded-xl bg-card-2 px-3 py-2.5 outline-none placeholder:text-muted/60 focus:ring-2 focus:ring-accent'

function timeAgo(ts: number): string {
  const min = Math.round((Date.now() - ts) / 60_000)
  if (min < 1) return 'à l’instant'
  if (min < 60) return `il y a ${min} min`
  return formatDay(ts)
}

export function AccountSection() {
  const sync = useSyncState()
  return (
    <>
      <SectionTitle>Compte et synchronisation</SectionTitle>
      {sync.status === 'signed_out' ? <SignInCard /> : <SignedInCard />}
    </>
  )
}

function SignInCard() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean }>()

  const run = async (fn: () => Promise<{ error: { message: string } | null }>, success?: string) => {
    setBusy(true)
    setMessage(undefined)
    const { error } = await fn()
    setBusy(false)
    if (error) setMessage({ text: explain(error.message), error: true })
    else if (success) setMessage({ text: success })
  }

  return (
    <Card className="space-y-3">
      <p className="text-sm text-muted">Connecte-toi pour sauvegarder tes données dans le cloud et les retrouver sur tous tes appareils.</p>
      {passkeysSupported() && (
        <Button variant="primary" className="w-full py-3" disabled={busy} onClick={() => run(() => supabase.auth.signInWithPasskey())}>
          Se connecter avec Face ID
        </Button>
      )}
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          void run(() => supabase.auth.signInWithPassword({ email: email.trim(), password }))
        }}
      >
        <label className="block">
          <Label>E-mail</Label>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <Label>Mot de passe</Label>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </label>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button type="submit" variant="secondary" disabled={busy || !email || !password}>
            Se connecter
          </Button>
          <Button
            disabled={busy || !email || password.length < 8}
            onClick={() =>
              run(
                () => supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: appUrl() } }),
                'Compte créé. Clique sur le lien reçu par mail pour le confirmer, puis connecte-toi ici.',
              )
            }
          >
            Créer le compte
          </Button>
        </div>
      </form>
      <button
        type="button"
        className="text-sm text-muted underline"
        disabled={busy || !email}
        onClick={() =>
          run(
            () => supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl() }),
            'Mail envoyé : ouvre le lien pour choisir un nouveau mot de passe.',
          )
        }
      >
        Mot de passe oublié ?
      </button>
      {message && <p className={`text-sm ${message.error ? 'text-danger' : 'text-ok'}`}>{message.text}</p>}
    </Card>
  )
}

function SignedInCard() {
  const sync = useSyncState()
  const [passkeyCount, setPasskeyCount] = useState<number>()
  const [message, setMessage] = useState<{ text: string; error?: boolean }>()

  const refreshPasskeys = async () => {
    const { data } = await supabase.auth.passkey.list()
    setPasskeyCount(data?.length ?? 0)
  }
  useEffect(() => {
    void refreshPasskeys()
  }, [])

  const statusText: Record<string, string> = {
    idle: sync.lastSyncAt ? `Synchronisé ${timeAgo(sync.lastSyncAt)}` : 'Connecté',
    syncing: 'Synchronisation…',
    offline: 'Hors ligne : synchro au retour du réseau',
    error: `Erreur de synchro : ${sync.error ?? ''}`,
  }

  return (
    <Card className="space-y-3">
      <div>
        <div className="font-medium">{sync.email}</div>
        <div className={`text-sm ${sync.status === 'error' ? 'text-danger' : 'text-muted'}`}>{statusText[sync.status]}</div>
      </div>
      <Button className="w-full" disabled={sync.status === 'syncing'} onClick={() => void syncNow()}>
        Synchroniser maintenant
      </Button>

      {passkeysSupported() && (
        <div className="space-y-2 rounded-xl bg-card-2/60 p-3">
          <div className="text-sm">
            Face ID / Touch ID :{' '}
            {passkeyCount === undefined ? '…' : passkeyCount > 0 ? `activé (${passkeyCount} appareil${passkeyCount > 1 ? 's' : ''})` : 'non activé'}
          </div>
          <Button
            variant={passkeyCount ? 'secondary' : 'primary'}
            className="w-full"
            onClick={async () => {
              setMessage(undefined)
              const { error } = await supabase.auth.registerPasskey()
              if (error) setMessage({ text: explain(error.message), error: true })
              else {
                setMessage({ text: 'Face ID activé : tu pourras te connecter sans mot de passe.' })
                void refreshPasskeys()
              }
            }}
          >
            {passkeyCount ? 'Ajouter cet appareil' : 'Activer Face ID'}
          </Button>
        </div>
      )}
      {message && <p className={`text-sm ${message.error ? 'text-danger' : 'text-ok'}`}>{message.text}</p>}

      <Button
        variant="ghost"
        className="w-full"
        onClick={async () => {
          if (!confirm('Se déconnecter ? Les données restent sur cet appareil.')) return
          await supabase.auth.signOut()
          await resetSyncCursors()
        }}
      >
        Se déconnecter
      </Button>
    </Card>
  )
}

/** Après un lien "mot de passe oublié" : saisie du nouveau mot de passe. */
export function PasswordRecovery() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setOpen(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60">
      <div className="pb-safe w-full space-y-3 rounded-t-3xl bg-card p-4">
        <h2 className="text-lg font-bold">Nouveau mot de passe</h2>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          variant="primary"
          className="w-full"
          disabled={password.length < 8}
          onClick={async () => {
            const { error } = await supabase.auth.updateUser({ password })
            if (error) setError(explain(error.message))
            else setOpen(false)
          }}
        >
          Enregistrer
        </Button>
      </div>
    </div>
  )
}
