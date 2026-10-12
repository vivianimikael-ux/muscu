import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import App from './App.tsx'
import { ensureSeeded } from './db/db'
import { supabase } from './sync/supabase'
import { initSync } from './sync/sync'
import './index.css'

void ensureSeeded()
initSync()

// Les liens des mails d'authentification arrivent avec #access_token=… :
// on laisse Supabase lire la session AVANT que le routeur (par hash) ne
// prenne ce fragment pour une page, puis on revient à l'accueil.
const fromAuthLink = /access_token=|error_description=/.test(location.hash)
if (fromAuthLink) await supabase.auth.getSession()
if (fromAuthLink && /access_token=|error_description=/.test(location.hash)) history.replaceState(null, '', '#/')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
