# Muscu App

PWA de suivi de musculation (séances, WOD, records, 1RM, volume). Besoin et
choix techniques : voir [SPECS.md](SPECS.md).

## Structure

```
app/                  PWA React + TypeScript (Vite)
  src/domain/         logique métier pure, testée (1RM, records, volume, minuteurs WOD)
  src/db/             base locale Dexie (IndexedDB) + bibliothèque d'exercices de départ
  src/ui/             composants, hooks, écran de séance
  src/pages/          écrans
```

## Déploiement

Chaque push sur `main` lance [.github/workflows/deploy.yml](.github/workflows/deploy.yml) :
tests, build, puis publication sur https://vivianimikael-ux.github.io/muscu/.

Toutes les heures, [.github/workflows/calendar.yml](.github/workflows/calendar.yml)
envoie le planning et les séances faites vers le calendrier iCloud « Musculation »
([scripts/sync_calendar.py](scripts/sync_calendar.py), tests : `python3 -m unittest discover scripts`).

Base Supabase : schéma dans [supabase/schema.sql](supabase/schema.sql)
(projet `ndxsyluprxsrvyvmtrpr`).

## Développement

Node.js est installé localement dans `~/.local/node` (ajouté au `PATH` via `~/.zshrc`).

```bash
cd app && npm run dev
```

```bash
cd app && npm test
```

```bash
cd app && npm run build
```

## Avancement

- [x] V1 locale : exercices, modèles (blocs classiques + WOD), séance en cours
      (saisie série par série, repos, minuteurs WOD), records, 1RM, courbes, volume
- [x] V1 : connexion (mot de passe + Face ID), synchro Supabase, déploiement GitHub Pages
- [x] V2 : programmes / blocs / semaines, progression, synchro calendrier iCloud
- [x] V3 : import Notion (112 séances) — reste : arrêt de la V4

## Import Notion (unique)

1. `python3 scripts/notion_export.py` : export brut vers `import/notion-raw.json`
   (cookie dans `~/.config/agent-muscu/notion_session.txt`).
2. `python3 scripts/notion_convert.py` : conversion selon les règles validées
   (documentées en tête du script), non-reconnus listés dans `import/residuels.md`.
3. Dans l'app : Réglages → Données → Importer `import/notion-import.json`.

Le dossier `import/` contient des données personnelles et n'est pas versionné.
