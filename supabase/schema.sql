-- Schéma Supabase de Muscu App (cf. SPECS.md §10.3).
-- À exécuter dans Supabase → SQL Editor → New query → Run.
-- Idempotent : peut être relancé après l'ajout d'une collection.
--
-- Une table par collection, même forme partout : le document complet est
-- dans `data` (jsonb), avec les colonnes nécessaires à la synchro :
--   - updated_at        : horodatage CLIENT (ms) pour le last-write-wins
--   - server_updated_at : horodatage SERVEUR, curseur de récupération des
--                         changements (insensible aux horloges des appareils)
--   - deleted           : suppression logique, propagée aux autres appareils
-- Les ids sont du texte (UUID, ou "seed-…" pour la bibliothèque de départ).

create or replace function public.touch_server_updated_at()
returns trigger language plpgsql as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['exercises', 'templates', 'sessions', 'max_tests', 'bodyweights', 'programs'] loop
    execute format($f$
      create table if not exists public.%1$I (
        user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
        id text not null,
        updated_at bigint not null,
        server_updated_at timestamptz not null default now(),
        deleted boolean not null default false,
        data jsonb not null,
        primary key (user_id, id)
      );

      create index if not exists %1$s_sync_idx on public.%1$I (user_id, server_updated_at);

      alter table public.%1$I enable row level security;

      drop policy if exists "owner only" on public.%1$I;
      create policy "owner only" on public.%1$I
        for all to authenticated
        using (user_id = auth.uid())
        with check (user_id = auth.uid());

      drop trigger if exists touch_server_updated_at on public.%1$I;
      create trigger touch_server_updated_at
        before insert or update on public.%1$I
        for each row execute function public.touch_server_updated_at();
    $f$, t);
  end loop;
end;
$$;
