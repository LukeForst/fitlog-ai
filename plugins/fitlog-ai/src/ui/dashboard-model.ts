export interface DashboardViewInput {
  nutrition: { calories: number; proteinG: number; carbsG: number; fatG: number };
  trainingDays: number;
  streakDays: number;
  weeklyVolumeKg: number;
  exerciseTrend: Array<{ date: string; volumeKg: number }>;
  recentWorkouts: Array<{ date: string; title: string; volumeKg: number }>;
}

export interface DashboardViewModel {
  cards: Array<{ label: string; value: string }>;
  exercisePoints: Array<{ date: string; value: number }>;
  recentWorkouts: DashboardViewInput["recentWorkouts"];
}

export function toDashboardViewModel(dashboard: DashboardViewInput): DashboardViewModel {
  return {
    cards: [
      { label: "热量", value: `${dashboard.nutrition.calories} kcal` },
      { label: "蛋白质", value: `${dashboard.nutrition.proteinG} g` },
      { label: "碳水", value: `${dashboard.nutrition.carbsG} g` },
      { label: "脂肪", value: `${dashboard.nutrition.fatG} g` },
      { label: "连续训练", value: `${dashboard.streakDays} 天` },
      { label: "本周训练量", value: `${dashboard.weeklyVolumeKg} kg` }
    ],
    exercisePoints: [...dashboard.exerciseTrend]
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((point) => ({ date: point.date, value: point.volumeKg })),
    recentWorkouts: dashboard.recentWorkouts
  };
}
