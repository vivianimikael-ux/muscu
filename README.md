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
- [ ] V2 : programmes / blocs / semaines, progression, synchro iCloud
- [ ] V3 : import Notion, arrêt de la V4
