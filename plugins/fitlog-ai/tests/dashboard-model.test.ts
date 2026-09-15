import test from "node:test";
import assert from "node:assert/strict";
import { toDashboardViewModel } from "../src/ui/dashboard-model.ts";

test("formats nutrition cards and chronological exercise points", () => {
  const view = toDashboardViewModel({
    nutrition: { calories: 580, proteinG: 59, carbsG: 61, fatG: 14 },
    trainingDays: 2,
    streakDays: 2,
    weeklyVolumeKg: 1200,
    exerciseTrend: [{ date: "2026-09-13", volumeKg: 75 }, { date: "2026-09-14", volumeKg: 80 }],
    recentWorkouts: [{ date: "2026-09-14", title: "下肢力量", volumeKg: 800 }]
  });

  assert.equal(view.cards[0]?.value, "580 kcal");
  assert.deepEqual(view.exercisePoints.map((point) => point.value), [75, 80]);
});
