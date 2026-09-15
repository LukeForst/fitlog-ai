import { sumNutrition } from "../domain/calculations.ts";
import type { NutritionTotals } from "../domain/types.ts";
import type { FitLogRepository, StoredBodyMeasurement, StoredWorkout } from "../storage/repository.ts";

export interface DashboardRange {
  from: string;
  to: string;
}

export interface ExerciseTrendPoint {
  date: string;
  volumeKg: number;
}

export interface Dashboard {
  range: DashboardRange;
  nutrition: NutritionTotals;
  trainingDays: number;
  streakDays: number;
  weeklyVolumeKg: number;
  exerciseTrend: ExerciseTrendPoint[];
  recentWorkouts: StoredWorkout[];
  measurements: StoredBodyMeasurement[];
}

export interface DashboardService {
  getDashboard(ownerEmail: string, range: DashboardRange, exerciseName?: string): Dashboard;
}

export function createDashboardService(repository: FitLogRepository): DashboardService {
  return {
    getDashboard(ownerEmail, range, exerciseName) {
      const workouts = repository.listWorkouts(ownerEmail, range.from, range.to);
      const meals = repository.listMeals(ownerEmail, range.from, range.to);
      const measurements = repository.listMeasurements(ownerEmail, range.from, range.to);
      const workoutDates = [...new Set(workouts.map((workout) => workout.date))];

      return {
        range,
        nutrition: sumNutrition(meals),
        trainingDays: workoutDates.length,
        streakDays: calculateStreakDays(workoutDates),
        weeklyVolumeKg: workouts.reduce((total, workout) => total + workout.volumeKg, 0),
        exerciseTrend: calculateExerciseTrend(workouts, exerciseName),
        recentWorkouts: workouts.slice(0, 5),
        measurements
      };
    }
  };
}

function calculateStreakDays(dates: string[]): number {
  const descending = [...dates].sort((left, right) => right.localeCompare(left));
  if (descending.length === 0) {
    return 0;
  }

  let streak = 1;
  for (let index = 1; index < descending.length; index += 1) {
    if (daysBetween(descending[index - 1], descending[index]) !== 1) {
      break;
    }
    streak += 1;
  }
  return streak;
}

function daysBetween(laterDate: string, earlierDate: string): number {
  const later = Date.parse(`${laterDate}T00:00:00Z`);
  const earlier = Date.parse(`${earlierDate}T00:00:00Z`);
  return Math.round((later - earlier) / 86_400_000);
}

function calculateExerciseTrend(workouts: StoredWorkout[], exerciseName?: string): ExerciseTrendPoint[] {
  if (!exerciseName?.trim()) {
    return [];
  }
  const totals = new Map<string, number>();
  for (const workout of workouts) {
    const volume = workout.exercises
      .filter((exercise) => exercise.name === exerciseName)
      .reduce(
        (total, exercise) => total + exercise.sets.reduce((setTotal, set) => setTotal + set.weightKg * set.reps, 0),
        0
      );
    if (volume > 0) {
      totals.set(workout.date, (totals.get(workout.date) ?? 0) + volume);
    }
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, volumeKg]) => ({ date, volumeKg }));
}
