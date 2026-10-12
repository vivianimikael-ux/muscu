import { lazy, Suspense } from 'react'
import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router'
import { ExercisesPage } from './pages/ExercisesPage'
import { HistoryPage } from './pages/HistoryPage'
import { HomePage } from './pages/HomePage'
import { SessionPage } from './pages/SessionPage'
import { SettingsPage } from './pages/SettingsPage'
import { TemplateEditorPage } from './pages/TemplateEditorPage'
import { TemplatesPage } from './pages/TemplatesPage'
import { PasswordRecovery } from './ui/AccountSection'

// Page la plus lourde (graphiques Recharts) : chargée à la demande.
const ExerciseDetailPage = lazy(() => import('./pages/ExerciseDetailPage').then((m) => ({ default: m.ExerciseDetailPage })))

const TABS = [
  { to: '/', label: 'Accueil', icon: '⌂' },
  { to: '/modeles', label: 'Modèles', icon: '☰' },
  { to: '/exercices', label: 'Exercices', icon: '◎' },
  { to: '/historique', label: 'Historique', icon: '↺' },
  { to: '/reglages', label: 'Réglages', icon: '⚙' },
]

function TabLayout() {
  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-24">
      <Suspense>
        <Outlet />
      </Suspense>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-accent' : 'text-muted'}`
              }
            >
              <span className="text-xl leading-none">{t.icon}</span>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <>
      <PasswordRecovery />
      <Routes>
        <Route element={<TabLayout />}>
          <Route index element={<HomePage />} />
          <Route path="modeles" element={<TemplatesPage />} />
          <Route path="exercices" element={<ExercisesPage />} />
          <Route path="exercices/:id" element={<ExerciseDetailPage />} />
          <Route path="historique" element={<HistoryPage />} />
          <Route path="reglages" element={<SettingsPage />} />
        </Route>
        {/* Plein écran, sans barre d'onglets */}
        <Route path="modeles/:id" element={<TemplateEditorPage />} />
        <Route path="seance/:id" element={<SessionPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
