import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { formatDuration } from '../domain/exercise'
import { parseDuration } from './format'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white active:bg-accent-strong',
  secondary: 'bg-card-2 text-fg active:bg-line',
  ghost: 'text-muted active:bg-card-2',
  danger: 'bg-danger/15 text-danger active:bg-danger/25',
}

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-medium transition-colors disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

export function Card({ className = '', children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  const base = `rounded-2xl bg-card p-4 ${className}`
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} block w-full text-left active:bg-card-2`}>
        {children}
      </button>
    )
  }
  return <div className={base}>{children}</div>
}

export function PageHeader({ title, back, right }: { title: string; back?: boolean; right?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <header className="pt-safe sticky top-0 z-20 bg-bg/95 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-4">
        {back && (
          <button type="button" onClick={() => navigate(-1)} className="-ml-2 px-2 text-2xl text-accent" aria-label="Retour">
            ‹
          </button>
        )}
        <h1 className="flex-1 truncate text-xl font-bold">{title}</h1>
        {right}
      </div>
    </header>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-muted">{children}</p>
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-6 mb-2 flex items-center justify-between px-1">
      <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">{children}</h2>
      {right}
    </div>
  )
}

/** Analyse un nombre saisi à la française ("62,5") ou à l'anglaise ("62.5"). */
export function parseNumber(text: string): number | undefined {
  const t = text.trim().replace(',', '.')
  if (t === '' || t === '-') return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

const showNumber = (v: number | undefined) => (v === undefined ? '' : String(v).replace('.', ','))

/**
 * Champ numérique adapté au clavier iOS. Garde le texte brut pendant la
 * saisie (pour permettre "62," en cours de frappe) et remonte la valeur
 * analysée à chaque changement.
 */
export function NumberField({
  value,
  onChange,
  placeholder,
  decimal = true,
  className = '',
  ariaLabel,
}: {
  value: number | undefined
  onChange: (v: number | undefined) => void
  placeholder?: string
  decimal?: boolean
  className?: string
  ariaLabel?: string
}) {
  const [text, setText] = useState(showNumber(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(showNumber(value))
  }, [value])
  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      aria-label={ariaLabel}
      value={text}
      placeholder={placeholder}
      onFocus={(e) => {
        focused.current = true
        e.currentTarget.select()
      }}
      onBlur={() => {
        focused.current = false
        setText(showNumber(value))
      }}
      onChange={(e) => {
        setText(e.target.value)
        onChange(parseNumber(e.target.value))
      }}
      className={`w-full rounded-lg bg-card-2 px-2 py-2 text-center outline-none placeholder:text-muted/50 focus:ring-2 focus:ring-accent ${className}`}
    />
  )
}

/**
 * Durée saisie en "m:ss" (ou un nombre seul, exprimé dans `plainUnit`).
 * Affichée en "m:ss" hors saisie.
 */
export function DurationField({
  value,
  onChange,
  plainUnit,
  placeholder,
  className = '',
  ariaLabel,
}: {
  value: number | undefined
  onChange: (sec: number | undefined) => void
  plainUnit: 'min' | 's'
  placeholder?: string
  className?: string
  ariaLabel?: string
}) {
  const show = (v: number | undefined) => (v === undefined ? '' : formatDuration(v))
  const [text, setText] = useState(show(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(show(value))
  }, [value])
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={text}
      placeholder={placeholder}
      onFocus={(e) => {
        focused.current = true
        e.currentTarget.select()
      }}
      onBlur={() => {
        focused.current = false
        setText(show(value))
      }}
      onChange={(e) => {
        setText(e.target.value)
        onChange(parseDuration(e.target.value, plainUnit))
      }}
      className={`w-full rounded-lg bg-card-2 px-2 py-2 text-center outline-none placeholder:text-muted/50 focus:ring-2 focus:ring-accent ${className}`}
    />
  )
}

export function TextField({
  value,
  onChange,
  placeholder,
  className = '',
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}) {
  return (
    <input
      type="text"
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-xl bg-card-2 px-3 py-2.5 outline-none placeholder:text-muted/60 focus:ring-2 focus:ring-accent ${className}`}
    />
  )
}

export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`mb-1 block text-xs text-muted ${className}`}>{children}</span>
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={`w-full appearance-none rounded-xl bg-card-2 px-3 py-2.5 outline-none focus:ring-2 focus:ring-accent ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${active ? 'bg-accent text-white' : 'bg-card-2 text-muted'}`}
    >
      {children}
    </button>
  )
}

/** Panneau modal montant du bas de l'écran. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div
        className="pb-safe flex max-h-[90dvh] flex-col rounded-t-3xl bg-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="px-2 text-muted" aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </div>
  )
}

/** Menu d'actions simple dans un Sheet. */
export function ActionSheet({
  open,
  onClose,
  title,
  actions,
}: {
  open: boolean
  onClose: () => void
  title: string
  actions: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }[]
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-2">
        {actions.map((a) => (
          <Button
            key={a.label}
            variant={a.danger ? 'danger' : 'secondary'}
            disabled={a.disabled}
            className="w-full justify-start py-3"
            onClick={() => {
              onClose()
              a.onClick()
            }}
          >
            {a.label}
          </Button>
        ))}
      </div>
    </Sheet>
  )
}
