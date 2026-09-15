import type { ExerciseInput, MealInput, NutritionTotals } from "./types.ts";

export function calculateWorkoutVolume(exercises: ExerciseInput[]): number {
  return exercises.reduce(
    (total, exercise) => total + exercise.sets.reduce(
      (setTotal, set) => setTotal + set.weightKg * set.reps,
      0
    ),
    0
  );
}

export function sumNutrition(meals: MealInput[]): NutritionTotals {
  return meals.reduce<NutritionTotals>(
    (total, meal) => ({
      calories: total.calories + meal.calories,
      proteinG: total.proteinG + meal.proteinG,
      carbsG: total.carbsG + meal.carbsG,
      fatG: total.fatG + meal.fatG
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );
}
