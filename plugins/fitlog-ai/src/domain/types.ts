export interface SetInput {
  weightKg: number;
  reps: number;
}

export interface ExerciseInput {
  name: string;
  sets: SetInput[];
}

export interface WorkoutInput {
  date: string;
  title: string;
  exercises: ExerciseInput[];
  note?: string;
}

export interface MealInput {
  date: string;
  mealType: string;
  note?: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface NutritionTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}
