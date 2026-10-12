// Modèle de données de l'app (cf. SPECS.md §10.3).
// Toutes les collections sont des documents synchronisables : id UUID,
// updatedAt (ms) pour le last-write-wins, deleted pour la suppression logique.

export interface Doc {
  id: string
  updatedAt: number
  deleted?: boolean
}

// ---------------------------------------------------------------------------
// Exercices

export type Muscle =
  | 'pectoraux'
  | 'dos'
  | 'trapezes'
  | 'epaules'
  | 'biceps'
  | 'triceps'
  | 'avant-bras'
  | 'abdos'
  | 'lombaires'
  | 'fessiers'
  | 'quadriceps'
  | 'ischios'
  | 'mollets'
  | 'cardio'

/**
 * Comment un exercice se mesure.
 * - barbell / machine : charge totale × reps
 * - dumbbell : charge PAR MAIN × reps (exercice bilatéral)
 * - unilateral : charge PAR CÔTÉ × reps (une seule valeur pour les deux côtés)
 * - bodyweight : lest (+) ou assistance (−) × reps, charge effective = poids de corps + lest
 * - reps / time / distance / calories : quantité seule, sans charge
 */
export type MeasureType =
  | 'barbell'
  | 'machine'
  | 'dumbbell'
  | 'unilateral'
  | 'bodyweight'
  | 'reps'
  | 'time'
  | 'distance'
  | 'calories'

/** Max utilisé comme référence pour les programmes en % (V2). */
export type MaxReference = 'real' | 'estimated' | 'training'

export interface Exercise extends Doc {
  name: string
  measure: MeasureType
  primaryMuscles: Muscle[]
  secondaryMuscles: Muscle[]
  /** Pas de charge en kg ; défaut selon le type de mesure si absent. */
  increment?: number
  maxReference: MaxReference
  /** % appliqué au max réel/estimé quand maxReference = 'training'. */
  trainingMaxPct: number
  notes?: string
}

// ---------------------------------------------------------------------------
// Séances modèles (plans)

export interface ClassicExercisePlan {
  id: string
  exerciseId: string
  sets: number
  /**
   * Fourchette cible. Pour les mesures sans charge (time / distance /
   * calories), il s'agit de la quantité dans l'unité de la mesure.
   */
  repsMin: number
  repsMax: number
  targetLoad?: number
  targetRpe?: number
  restSec: number
  notes?: string
}

export interface ClassicBlockPlan {
  id: string
  kind: 'classic'
  exercises: ClassicExercisePlan[]
}

export type WodFormat =
  | { type: 'for_time'; rounds: number; capSec?: number }
  | { type: 'amrap'; durationSec: number }
  /** alternate : les exercices tournent d'un intervalle à l'autre au lieu d'être tous faits à chaque intervalle. */
  | { type: 'emom'; intervalSec: number; intervals: number; alternate: boolean }
  /** Les exercices tournent d'un cycle de travail à l'autre s'il y en a plusieurs. */
  | { type: 'intervals'; workSec: number; restSec: number; cycles: number }

export type WodFormatType = WodFormat['type']

export interface WodItem {
  id: string
  exerciseId: string
  /** Quantité par tour, dans l'unité de la mesure de l'exercice. */
  quantity: number
  load?: number
}

export interface WodBlockPlan {
  id: string
  kind: 'wod'
  name?: string
  format: WodFormat
  items: WodItem[]
}

export type BlockPlan = ClassicBlockPlan | WodBlockPlan

export interface Template extends Doc {
  name: string
  blocks: BlockPlan[]
  notes?: string
}

// ---------------------------------------------------------------------------
// Séances réalisées / planifiées

export interface SetLog {
  id: string
  /** Même convention que MeasureType (par main / par côté / lest). */
  load?: number
  /** Reps, ou quantité pour les mesures sans charge. */
  reps?: number
  rpe?: number
  done: boolean
  doneAt?: number
}

export interface ClassicExerciseLog {
  id: string
  exerciseId: string
  /** Cible copiée depuis le modèle au démarrage (absente si ajouté à la volée). */
  target?: Pick<ClassicExercisePlan, 'repsMin' | 'repsMax' | 'targetLoad' | 'targetRpe'>
  /** Explication de la cible calculée par la progression (ex : "+2,5 kg : RPE 7 < 8"). */
  targetNote?: string
  restSec: number
  sets: SetLog[]
  notes?: string
}

export interface ClassicBlockLog {
  id: string
  kind: 'classic'
  exercises: ClassicExerciseLog[]
}

export type WodScore =
  | { type: 'time'; sec: number }
  | { type: 'rounds'; rounds: number; reps: number }
  | { type: 'intervals'; held: number; total: number }
  | { type: 'reps'; perInterval: number[] }

export interface WodBlockLog {
  id: string
  kind: 'wod'
  name?: string
  /** Modèle d'origine du bloc, pour comparer les scores d'un même WOD. */
  sourceBlockId?: string
  format: WodFormat
  /** Charges réellement utilisées (modifiables en fin de bloc). */
  items: WodItem[]
  score?: WodScore
  rpe?: number
  startedAt?: number
  finishedAt?: number
  done: boolean
}

export type BlockLog = ClassicBlockLog | WodBlockLog

export type SessionStatus = 'planned' | 'in_progress' | 'done' | 'skipped'

export interface Session extends Doc {
  name: string
  templateId?: string
  status: SessionStatus
  /** Date prévue au format YYYY-MM-DD. */
  plannedDate?: string
  startedAt?: number
  completedAt?: number
  blocks: BlockLog[]
  source: 'app' | 'notion'
  /** Fin du repos en cours (ms), pour retrouver le minuteur après un rechargement. */
  restEndsAt?: number
  /** Occurrence de programme dont la séance est issue. */
  programRef?: ProgramRef
  notes?: string
}

export interface MaxTest extends Doc {
  exerciseId: string
  /** YYYY-MM-DD */
  date: string
  /** Même convention que MeasureType (par main / par côté / lest). */
  load: number
}

export interface BodyweightEntry extends Doc {
  /** YYYY-MM-DD */
  date: string
  kg: number
}

// ---------------------------------------------------------------------------
// Programmes (SPECS.md §2)

export type ProgressionMode = 'free' | 'suggest' | 'percent'
export type SuggestRule = 'rpe' | 'double'

/** Une ligne du tableau % du 1RM (index = semaine du bloc). */
export interface PercentWeek {
  pct?: number
  reps?: number
  /** Absent : séries du modèle. */
  sets?: number
}

/**
 * Règle de progression d'UNE occurrence d'exercice dans un modèle
 * (ClassicExercisePlan.id) : un même exercice peut avoir des tableaux
 * différents d'une séance à l'autre (programmation ondulatoire).
 */
export interface ExerciseRule {
  planId: string
  /** Absent : mode du bloc. */
  mode?: ProgressionMode
  suggestRule?: SuggestRule
  percentWeeks: PercentWeek[]
}

export interface WeekSlot {
  id: string
  templateId: string
}

export interface Deload {
  /** Charges multipliées par loadPct / 100. */
  loadPct: number
  /** Séries ajoutées (négatif : retirées), minimum 1 par exercice. */
  setsDelta: number
}

/** Exceptions sur une semaine précise d'un bloc (index 0-based). */
export interface WeekOverride {
  week: number
  deload?: Deload
  mode?: ProgressionMode
  replace: { slotId: string; templateId: string }[]
  skip: string[]
  extra: WeekSlot[]
}

export interface ProgramBlock {
  id: string
  name: string
  weeks: number
  /** Semaine type : séances dans l'ordre. */
  slots: WeekSlot[]
  mode: ProgressionMode
  suggestRule: SuggestRule
  rules: ExerciseRule[]
  overrides: WeekOverride[]
}

/** Séance du planning calculé, mise en cache pour la synchro calendrier. */
export interface ScheduledEntry {
  key: string
  /** YYYY-MM-DD */
  date: string
  title: string
  status: 'planned' | 'done'
}

export interface Program extends Doc {
  name: string
  /** YYYY-MM-DD */
  startDate: string
  /** Jours d'entraînement, 1 = lundi … 7 = dimanche. */
  trainingDays: number[]
  active: boolean
  blocks: ProgramBlock[]
  /** Déplacements manuels : clé d'occurrence → date YYYY-MM-DD. */
  moves: Record<string, string>
  /** Occurrences sautées depuis le planning. */
  skipped: string[]
  calendarSlot: { start: string; durationMin: number }
  schedule?: ScheduledEntry[]
}

export interface ProgramRef {
  programId: string
  /** Clé d'occurrence : blockId:semaine:slotId */
  key: string
  blockId: string
  week: number
}
