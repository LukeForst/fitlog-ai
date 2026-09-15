import test from "node:test";
import assert from "node:assert/strict";
import { createDashboardService } from "../src/services/dashboard-service.ts";
import { createRecordService } from "../src/services/record-service.ts";
import { createSqliteRepository } from "../src/storage/sqlite-repository.ts";

test("summarizes training, food, and an exercise trend for a date range", () => {
  const repo = createSqliteRepository(":memory:", "me@example.com");
  const records = createRecordService(repo);
  records.recordWorkout("me@example.com", {
    date: "2026-09-13",
    title: "下肢力量",
    exercises: [{ name: "深蹲", sets: [{ weightKg: 80, reps: 5 }] }]
  });
  records.recordWorkout("me@example.com", {
    date: "2026-09-14",
    title: "下肢力量",
    exercises: [{ name: "深蹲", sets: [{ weightKg: 90, reps: 5 }] }]
  });
  records.recordMeal("me@example.com", {
    date: "2026-09-14",
    mealType: "午餐",
    calories: 460,
    proteinG: 35,
    carbsG: 58,
    fatG: 12
  });
  records.recordBodyMeasurement("me@example.com", { date: "2026-09-14", weightKg: 72.5 });

  const dashboard = createDashboardService(repo).getDashboard(
    "me@example.com",
    { from: "2026-09-08", to: "2026-09-14" },
    "深蹲"
  );

  assert.equal(dashboard.trainingDays, 2);
  assert.equal(dashboard.streakDays, 2);
  assert.deepEqual(dashboard.nutrition, { calories: 460, proteinG: 35, carbsG: 58, fatG: 12 });
  assert.equal(dashboard.weeklyVolumeKg, 850);
  assert.deepEqual(dashboard.exerciseTrend, [
    { date: "2026-09-13", volumeKg: 400 },
    { date: "2026-09-14", volumeKg: 450 }
  ]);
  repo.close();
});
