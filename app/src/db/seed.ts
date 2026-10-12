import type { Exercise, MeasureType, Muscle } from '../domain/types'

type Seed = [name: string, measure: MeasureType, primary: Muscle[], secondary?: Muscle[]]

// Ids stables (seed-…) : la même bibliothèque sur tous les appareils, sans doublon à la synchro.
const SEEDS: Seed[] = [
  // Jambes
  ['Squat', 'barbell', ['quadriceps', 'fessiers'], ['ischios', 'lombaires']],
  ['Front squat', 'barbell', ['quadriceps'], ['fessiers', 'abdos']],
  ['Soulevé de terre', 'barbell', ['ischios', 'fessiers', 'lombaires'], ['dos', 'trapezes', 'avant-bras']],
  ['Soulevé de terre roumain', 'barbell', ['ischios', 'fessiers'], ['lombaires']],
  ['Hip thrust', 'barbell', ['fessiers'], ['ischios']],
  ['Presse à cuisses', 'machine', ['quadriceps', 'fessiers']],
  ['Leg extension', 'machine', ['quadriceps']],
  ['Leg curl', 'machine', ['ischios']],
  ['Fentes', 'unilateral', ['quadriceps', 'fessiers'], ['ischios']],
  ['Fentes bulgares', 'unilateral', ['quadriceps', 'fessiers']],
  ['Mollets debout', 'machine', ['mollets']],
  // Poussée
  ['Développé couché', 'barbell', ['pectoraux'], ['triceps', 'epaules']],
  ['Développé incliné haltères', 'dumbbell', ['pectoraux'], ['epaules', 'triceps']],
  ['Développé militaire', 'barbell', ['epaules'], ['triceps']],
  ['Développé épaules haltères', 'dumbbell', ['epaules'], ['triceps']],
  ['Élévations latérales', 'dumbbell', ['epaules']],
  ['Dips', 'bodyweight', ['pectoraux', 'triceps'], ['epaules']],
  ['Pompes', 'bodyweight', ['pectoraux'], ['triceps', 'epaules']],
  ['Extension triceps poulie', 'machine', ['triceps']],
  ['Écarté poulie', 'machine', ['pectoraux']],
  // Tirage
  ['Tractions', 'bodyweight', ['dos'], ['biceps']],
  ['Rowing barre', 'barbell', ['dos'], ['biceps', 'lombaires']],
  ['Rowing haltère', 'unilateral', ['dos'], ['biceps']],
  ['Tirage vertical', 'machine', ['dos'], ['biceps']],
  ['Tirage horizontal', 'machine', ['dos'], ['biceps']],
  ['Face pull', 'machine', ['epaules', 'trapezes']],
  ['Shrugs', 'dumbbell', ['trapezes']],
  ['Curl barre', 'barbell', ['biceps'], ['avant-bras']],
  ['Curl haltères', 'dumbbell', ['biceps'], ['avant-bras']],
  ['Curl marteau', 'dumbbell', ['biceps', 'avant-bras']],
  // Gainage / abdos
  ['Gainage', 'time', ['abdos']],
  ['Relevés de jambes', 'reps', ['abdos']],
  ['Ab wheel', 'reps', ['abdos'], ['lombaires']],
  // WOD / conditionnement
  ['Burpees', 'reps', ['cardio'], ['pectoraux', 'quadriceps']],
  ['Box jumps', 'reps', ['quadriceps', 'cardio'], ['fessiers']],
  ['Double unders', 'reps', ['cardio'], ['mollets']],
  ['Kettlebell swing', 'barbell', ['fessiers', 'ischios'], ['lombaires', 'epaules']],
  ['Wall balls', 'barbell', ['quadriceps', 'epaules'], ['fessiers']],
  ['Thrusters', 'barbell', ['quadriceps', 'epaules'], ['fessiers', 'triceps']],
  ['Toes to bar', 'reps', ['abdos'], ['dos']],
  ['Rameur', 'distance', ['cardio'], ['dos', 'quadriceps']],
  ['Rameur (calories)', 'calories', ['cardio'], ['dos', 'quadriceps']],
  ['Course', 'distance', ['cardio'], ['quadriceps', 'mollets']],
  ['Assault bike', 'calories', ['cardio'], ['quadriceps']],
  ['Ski erg', 'calories', ['cardio'], ['dos', 'triceps']],
  ['Farmer carry', 'distance', ['avant-bras', 'trapezes'], ['abdos']],
]

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export const SEED_EXERCISES: Omit<Exercise, 'updatedAt'>[] = SEEDS.map(([name, measure, primary, secondary = []]) => ({
  id: `seed-${slug(name)}`,
  name,
  measure,
  primaryMuscles: primary,
  secondaryMuscles: secondary,
  maxReference: 'estimated',
  trainingMaxPct: 90,
}))
