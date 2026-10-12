# Muscu App — Spécifications fonctionnelles

> Statut : besoin validé le 2026-10-12, stack technique non arrêtée.
> Remplace à terme le système Notion → iCloud (`../agent-Muscu-ics/`, V4).

## 1. Vision

Web app installable sur iPhone (PWA), **mono-utilisateur**, qui devient la
**source de vérité** pour programmer, réaliser et analyser les séances de
musculation. Remplace Notion (base du coach "Suivi de séance Mika").

Priorité absolue : l'écran **en séance** doit être rapide à utiliser, d'une
main, entre deux séries, y compris hors-ligne.

## 2. Planification

### 2.1 Hiérarchie

```
Programme
└── Bloc (ex : Hypertrophie 4 sem., Force 3 sem., Deload 1 sem.)
    ├── règle de progression (cf. §5) — définie au niveau du bloc,
    │   surchargeable par semaine
    └── Semaine
        └── Séance (instance d'une séance modèle, datée)
```

- Un programme est placé sur le calendrier (date de début + jours
  d'entraînement de la semaine).
- **Séances modèles** : réutilisables d'un bloc/programme à l'autre.
- Un seul programme **actif** à la fois.

### 2.1.1 Bloc = semaine type + exceptions (validé le 2026-10-12)

- Un bloc a un nom, un nombre de semaines et une **semaine type** : liste
  ordonnée de séances modèles, répétée chaque semaine du bloc.
- **Mode de progression par défaut du bloc** (libre / suggestion /
  % du 1RM), **surchargeable par exercice**. La règle d'un exercice est
  attachée à son occurrence dans un modèle (pas à l'exercice en général) :
  un squat lourd le lundi et léger le vendredi peuvent avoir des tableaux
  différents (programmation ondulatoire).
- **% du 1RM : tableau par semaine** — pour chaque semaine du bloc :
  % du max de référence, reps, séries (optionnel, sinon celles du modèle).
- **Exceptions sur une semaine précise** :
  - deload rapide : charges × X % et ± N séries sur toute la semaine ;
  - remplacer une séance de la semaine type par un autre modèle ;
  - sauter une séance, ou ajouter une séance en plus ;
  - changer le mode de progression pour la semaine.

### 2.2 Placement dans le temps et séances manquées

- **Jours fixes** : les séances du programme se placent dans l'ordre sur
  les jours d'entraînement choisis (ex : lundi, mercredi, vendredi). Une
  séance ajoutée en exception consomme simplement le jour suivant.
- **Séance manquée** : si une séance n'est pas faite à sa date, **le
  planning se décale** — la séance manquée passe au prochain jour
  d'entraînement à partir d'aujourd'hui, et toutes les suivantes glissent
  d'autant.
- **Déplacement manuel** : une séance peut être déplacée à une date
  précise ; elle sort alors du flux et ne consomme pas de jour
  d'entraînement. Une séance peut aussi être sautée depuis le planning.
- Le planning calculé est mis en cache dans le programme (`schedule`) pour
  que la synchro calendrier, côté serveur, n'ait pas à le recalculer.

### 2.3 Synchro calendrier

Les séances planifiées sont poussées (sens unique app → calendrier) dans le
calendrier iCloud existant via CalDAV — logique reprise de la V4. Un
décalage de planning met à jour les événements existants (upsert par UID).
**Créneau unique par défaut** (8h–9h, modifiable dans le programme).

## 3. Structure d'une séance

Une séance est une **suite ordonnée de blocs**, de deux natures mélangeables
librement (ex : bloc classique squat 5×5 puis bloc WOD AMRAP 12 min).

### 3.1 Bloc classique

Liste d'exercices, chacun avec : nombre de séries, reps cibles (valeur ou
fourchette, ex 8–12), charge cible **ou** RPE cible, temps de repos, notes.

### 3.2 Bloc WOD

Un format + une liste d'exercices enchaînés en tours. Chaque exercice a sa
quantité (reps / distance / calories / durée) et sa charge éventuelle.

| Format | Paramètres | Chrono | Score |
|---|---|---|---|
| Rounds / For Time | nb de tours, time cap optionnel | montant | temps final (ou tours+reps si cap atteint) |
| AMRAP | durée | descendant | tours + reps |
| EMOM / E*N*MOM | intervalle (1, 2… min), nb d'intervalles, travail par intervalle | bip à chaque intervalle | intervalles tenus / total |
| Tabata / intervalles | durée travail, durée repos, nb de cycles | alternance travail/repos | reps par intervalle (total + min) |

Communs : compte à rebours 3-2-1, signaux sonores et visuels, écran
maintenu allumé (Wake Lock).

**Records WOD** : un même WOD modèle refait plusieurs fois → historique et
meilleur score. Pas de distinction RX / Scaled.

## 4. Exercices

Bibliothèque d'exercices, chacun tagué par **groupes musculaires**
(principal / secondaires) et par **type de mesure** :

| Type | Saisie | Charge effective (pour stats) |
|---|---|---|
| Barre / machine | charge totale × reps | charge saisie |
| Haltères bilatéral | charge par main × reps | charge × 2 pour le tonnage |
| Unilatéral | **une seule valeur, par côté** × reps | charge × 2 côtés pour le tonnage |
| Poids du corps | lest (+) ou assistance (−) × reps | poids de corps + lest − assistance |
| Reps seules | reps | — (compte en séries/reps) |
| Temps | secondes | — |
| Distance | mètres | — |
| Calories | kcal | — |

Poids de corps : valeur unique dans les réglages, historisée avec sa date
(pour que les calculs passés restent justes). Pas de suivi/graphe dédié.

## 5. Progression (blocs classiques uniquement)

Chaque bloc (ou semaine) choisit un mode. **Ne s'applique jamais aux blocs
WOD.**

1. **Libre** : charges fixées à la main, l'app ne fait que visualiser.
2. **Suggestion** : l'app propose la charge de la prochaine séance, tu
   valides ou corriges. Deux règles disponibles (au choix par exercice,
   **RPE par défaut** car usage principal) :
   - **RPE** (défaut) : comparer le RPE réel moyen au RPE cible.
     RPE réel ≤ cible − 1 → + 1 incrément ; ≥ cible + 1 → − 1 incrément ;
     sinon charge maintenue.
   - **Double progression** : fourchette de reps (ex 8–12). Haut de
     fourchette atteint sur toutes les séries → + 1 incrément. Échec
     (bas de fourchette non atteint) 2 séances de suite → − 10 %.
   - Incréments par défaut, configurables par exercice : barre 2,5 kg,
     haltères/unilatéral 2 kg, machine = pas de la machine.
3. **% du 1RM** : charge cible = % × max de référence de l'exercice,
   arrondie à l'incrément disponible.

> Les seuils ci-dessus sont des valeurs par défaut proposées, ajustables.

## 6. En séance (écran clé)

- Une ligne par série : **charge, reps, RPE/RIR**, pré-remplie avec la
  cible → un tap pour valider si conforme.
- **Minuteur de repos** démarré automatiquement à la validation d'une série
  (durée = repos prévu, modifiable).
- **Modifications à la volée** : ajouter/supprimer une série, remplacer un
  exercice, réordonner.
- **Contexte visible** : dernière performance sur l'exercice + record.
- **Pas de saisie d'échauffement** (hors périmètre).
- Bloc WOD : minuteur du format, puis en fin de bloc saisie du **score**,
  de la **charge réellement utilisée par exercice** et d'un **RPE global**.
- Fonctionne **hors-ligne**, synchro au retour du réseau.

## 7. Max et statistiques

### 7.1 1RM

- **Réel** : saisi manuellement lors d'un test.
- **Estimé** : recalculé à chaque série d'un bloc classique — table RPE
  (type RTS) quand le RPE est renseigné, Epley sinon ; séries > 10 reps
  ignorées pour l'estimation.
- **Max de référence** pour le mode % : choisi par exercice — réel,
  estimé ou training max (% configurable du réel/estimé).
- **Les blocs WOD ne comptent jamais** pour les 1RM ni les records.

### 7.2 Analyses

- Courbes par exercice : charge max, 1RM estimé, volume.
- **Records (PR)** détectés automatiquement : meilleure charge à X reps,
  meilleur 1RM estimé (blocs classiques uniquement).
- **Volume hebdomadaire par groupe musculaire** (séries et tonnage) —
  inclut blocs classiques **et** WOD.
- Historique des scores par WOD modèle.

Hors périmètre : export CSV, calculateur de disques, notes libres avancées,
suivi graphique du poids de corps, prévu vs réalisé.

## 8. Données et migration

### 8.1 Stockage

Base cloud (type Supabase), un seul compte, cache local pour le hors-ligne.

### 8.2 Import de l'historique Notion (unique)

- Source : base "Suivi de séance Mika" via l'API interne Notion (même
  mécanique que `agent-Muscu/CLAUDE.md`).
- Chaque séance Notion → séance passée avec un bloc classique.
- Pas de détail par série dans Notion : **chaque série est considérée au
  même poids** (Séries × Répétitions × Charge réelle).
- Pas de RPE dans Notion → séances importées sans RPE (1RM estimé via
  Epley).
- **`Charge réelle` en texte libre** : l'import ne devine pas. Les valeurs
  non numériques sont listées et **soumises à l'utilisateur** qui indique
  quoi retenir ; l'import ne se finalise qu'après ces arbitrages.
- Les noms d'exercices (résolus via la relation `Mouvements`) sont
  dédoublonnés vers la bibliothèque ; tags musculaires à compléter.

- **Réalisé le 2026-10-12** : 112 séances, 90 exercices créés, 5 max
  testés. Règles d'interprétation arbitrées avec l'utilisateur et
  documentées dans `scripts/notion_convert.py`. Les séances importées ne
  sont pas renvoyées au calendrier (déjà présentes via la V4).

### 8.3 Arrêt de la V4

Une fois l'import validé et la synchro calendrier de l'app opérationnelle :
désactiver le workflow GitHub Actions de `agent-Muscu-ics/`.

## 9. Contraintes techniques connues

- **PWA iOS** : les sons du minuteur ne fonctionnent qu'app au premier plan
  (écran verrouillé ou autre app → plus de bip). Usage visé : écran allumé
  pendant la séance.
- Le son doit être "débloqué" par une interaction utilisateur (ex : bouton
  Démarrer).
- Les identifiants iCloud (mot de passe d'application CalDAV) ne doivent pas
  vivre dans le navigateur → synchro calendrier côté serveur (fonction
  serveur ou job planifié).

## 10. Stack technique

| Couche | Choix |
|---|---|
| Front | React + TypeScript + Vite |
| PWA | `vite-plugin-pwa` (Workbox) |
| UI | Tailwind CSS, composants maison |
| Routage | React Router (mode hash, compatible GitHub Pages) |
| Stockage local | Dexie (IndexedDB) — **source de vérité sur l'appareil** |
| Backend | Supabase (Postgres + Auth + RLS) |
| Synchro | file d'attente locale + last-write-wins par ligne (`updated_at`) |
| Graphiques | Recharts |
| Logique métier | module TypeScript pur (`src/domain/`), testé avec Vitest |
| Hébergement | GitHub Pages |
| Calendrier iCloud | script Python (code CalDAV V4) dans GitHub Actions |
| Import Notion | script Python ponctuel (scraper V4) |

Node.js est installé localement dans `~/.local/node` (pas de Homebrew).

### 10.1 Principes

- L'UI lit/écrit **toujours en local** (Dexie) ; la synchro Supabase est
  asynchrone. L'app est entièrement utilisable sans réseau.
- Minuteurs basés sur des **horodatages** (`Date.now()`), jamais sur un
  comptage de ticks (iOS bride les timers).
- Sons via Web Audio API, débloqués par un geste (bouton Démarrer).

### 10.2 Authentification

- Compte unique. **E-mail + mot de passe** (enregistré dans le trousseau
  iCloud, rempli par Face ID). Le code OTP par mail initialement prévu a été
  abandonné : sur le plan gratuit, Supabase n'autorise pas la modification
  des modèles de mail sans SMTP personnalisé. Pas de lien magique non plus :
  une PWA iOS installée n'a pas le même stockage que Safari.
- **Face ID / Touch ID via passkey** (WebAuthn, Supabase Auth — en bêta) :
  proposé après la première connexion, utilisé ensuite. Le mot de passe
  reste la méthode de secours.
- Liens reçus par mail (confirmation, mot de passe oublié) : flux implicite,
  ils fonctionnent même ouverts dans Safari plutôt que dans la PWA.
- Création de compte à désactiver côté Supabase une fois le compte créé.
- La passkey est liée au domaine : fixer l'URL définitive avant
  d'enregistrer Face ID.
- Signalement de sécurité ANT-2026-0JJXMV3G (enregistrement de passkey sans
  revérification) : aucun correctif confirmé au 2026-10-12. Risque faible en
  mono-utilisateur (il faut d'abord voler la session) ; les réglages
  affichent le nombre de passkeys pour repérer un ajout inattendu.

### 10.3 Modèle de données

Chaque collection est un ensemble de documents (`id` UUID, `updatedAt`,
`deleted` pour la suppression logique nécessaire à la synchro). Côté
Supabase : une table par collection, colonnes indexées utiles + `data jsonb`.

| Collection | Contenu |
|---|---|
| `exercises` | nom, type de mesure, muscles principal/secondaires, incrément, max de référence (réel/estimé/training max + %) |
| `templates` | séance modèle : nom + liste de blocs (classiques / WOD) |
| `sessions` | séance planifiée ou réalisée : statut, dates, blocs réalisés (séries charge/reps/RPE, scores WOD), origine (`app` / `notion`) |
| `maxTests` | 1RM réels testés : exercice, date, charge |
| `bodyweights` | poids de corps daté |
| `programs` (V2) | programme → blocs → semaines, règle de progression |

Les stats (1RM estimé, records, volume) sont **calculées** à partir des
séances, jamais stockées.

## 11. Découpage proposé

- **V1 — utilisable à la salle** : bibliothèque d'exercices, séances modèles
  (blocs classiques + WOD), saisie en séance, minuteurs, records, courbes,
  1RM estimé/réel.
- **V2 — planification** : programmes/blocs/semaines, 3 modes de
  progression, décalage du planning, synchro iCloud.
- **V3 — migration** : import Notion (avec arbitrage du texte libre),
  volume par muscle, arrêt de la V4.

*(Option : avancer l'import Notion en V1 pour avoir les courbes dès le
départ.)*
