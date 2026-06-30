// calc.js — Cálculos nutricionales y de objetivos
// Fórmula Mifflin-St Jeor (estándar) para BMR/TDEE.

const ACTIVITY_FACTORS = {
  sedentario: 1.2,
  ligero: 1.375,
  moderado: 1.55,
  activo: 1.725,
  muy_activo: 1.9,
};

export const ACTIVITY_OPTIONS = [
  { id: 'sedentario', label: 'Sedentario', desc: 'Poco o nada de ejercicio' },
  { id: 'ligero', label: 'Ligero', desc: '1–3 días/semana' },
  { id: 'moderado', label: 'Moderado', desc: '3–5 días/semana' },
  { id: 'activo', label: 'Activo', desc: '6–7 días/semana' },
  { id: 'muy_activo', label: 'Muy activo', desc: 'Trabajo físico + ejercicio' },
];

export const PACE_OPTIONS = [
  { id: 0.25, label: '0.25 kg/sem', desc: 'Suave y sostenible' },
  { id: 0.5, label: '0.5 kg/sem', desc: 'Recomendado' },
  { id: 0.75, label: '0.75 kg/sem', desc: 'Más agresivo' },
];

// BMR Mifflin-St Jeor. sex: 'h' (hombre) | 'm' (mujer)
export function bmr({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(sex === 'h' ? base + 5 : base - 161);
}

export function tdee(profile) {
  const factor = ACTIVITY_FACTORS[profile.activity] || 1.2;
  return Math.round(bmr(profile) * factor);
}

// Objetivo calórico diario aplicando déficit por ritmo deseado.
// 1 kg de grasa ≈ 7700 kcal → déficit diario = kgPorSemana * 7700 / 7.
// Se aplica un piso de seguridad (1200 mujer / 1500 hombre).
export function calorieTarget(profile) {
  const maint = tdee(profile);
  const pace = profile.pace || 0.5;
  const dailyDeficit = Math.round((pace * 7700) / 7);
  const floor = profile.sex === 'h' ? 1500 : 1200;
  return Math.max(maint - dailyDeficit, floor);
}

export function bmi({ weightKg, heightCm }) {
  const h = heightCm / 100;
  return +(weightKg / (h * h)).toFixed(1);
}

export function bmiCategory(value) {
  if (value < 18.5) return { label: 'Bajo peso', color: '#3b82f6' };
  if (value < 25) return { label: 'Normal', color: '#22c55e' };
  if (value < 30) return { label: 'Sobrepeso', color: '#f59e0b' };
  return { label: 'Obesidad', color: '#ef4444' };
}

// Calorías quemadas: MET * 3.5 * pesoKg / 200 * minutos
export function exerciseCalories({ met, weightKg, minutes }) {
  return Math.round((met * 3.5 * weightKg) / 200 * minutes);
}
