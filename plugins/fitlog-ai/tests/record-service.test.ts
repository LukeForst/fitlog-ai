import test from "node:test";
import assert from "node:assert/strict";
import { createRecordService } from "../src/services/record-service.ts";
import { createSqliteRepository } from "../src/storage/sqlite-repository.ts";

test("records a workout and meal with calculated summaries", () => {
  const repo = createSqliteRepository(":memory:", "me@example.com");
  const service = createRecordService(repo);

  const workout = service.recordWorkout("me@example.com", {
    date: "2026-09-14",
    title: "下肢力量",
    exercises: [{ name: "深蹲", sets: [{ weightKg: 80, reps: 5 }, { weightKg: 80, reps: 5 }] }]
  });
  const meal = service.recordMeal("me@example.com", {
    date: "2026-09-14",
    mealType: "午餐",
    calories: 460,
    proteinG: 35,
    carbsG: 58,
    fatG: 12
  });

  assert.ok(workout.id);
  assert.equal(workout.volumeKg, 800);
  assert.deepEqual(meal.nutrition, { calories: 460, proteinG: 35, carbsG: 58, fatG: 12 });
  repo.close();
});

test("rejects a blank long-term memory fact", () => {
  const repo = createSqliteRepository(":memory:", "me@example.com");
  const service = createRecordService(repo);

  assert.throws(() => service.rememberFact("me@example.com", { content: "   ", isImportant: true }));
  repo.close();
});
