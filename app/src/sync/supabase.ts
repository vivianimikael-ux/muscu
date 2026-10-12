import { createClient } from '@supabase/supabase-js'

// Clés PUBLIQUES par conception : l'accès aux données est protégé par les
// règles RLS (supabase/schema.sql), pas par le secret de cette clé.
export const SUPABASE_URL = 'https://ndxsyluprxsrvyvmtrpr.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_BJ6SaU1T0N0ZB2zGO0kkFQ_ryaokD4Y'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Flux implicite : les liens reçus par mail (confirmation, mot de passe
    // oublié) s'ouvrent dans Safari et non dans la PWA ; le flux PKCE
    // échouerait car il exige le même stockage que celui qui a fait la demande.
    flowType: 'implicit',
    detectSessionInUrl: true,
  },
})

/** Adresse de l'app, pour les redirections des mails d'authentification. */
export const appUrl = () => `${location.origin}${location.pathname}`
