import test from "node:test";
import assert from "node:assert/strict";
import { createRecordService } from "../src/services/record-service.ts";
import { createSqliteRepository } from "../src/storage/sqlite-repository.ts";

test("records a workout and meal with calculated summaries", async () => {
  const repo = createSqliteRepository(":memory:", "me@example.com");
  const service = createRecordService(repo);
  const owner = { id: "fitlog-owner", email: "me@example.com" };

  const workout = await service.recordWorkout(owner, {
    date: "2026-09-14",
    title: "下肢力量",
    exercises: [{ name: "深蹲", sets: [{ weightKg: 80, reps: 5 }, { weightKg: 80, reps: 5 }] }]
  });
  const meal = await service.recordMeal(owner, {
    date: "2026-09-14",
    mealType: "午餐",
    calories: 460,
    proteinG: 35,
    carbsG: 58,
    fatG: 12
  });

  assert.equal(typeof workout.id, "string");
  assert.equal(workout.volumeKg, 800);
  assert.deepEqual(meal.nutrition, { calories: 460, proteinG: 35, carbsG: 58, fatG: 12 });
  await repo.close();
});

test("rejects a blank long-term memory fact", async () => {
  const repo = createSqliteRepository(":memory:", "me@example.com");
  const service = createRecordService(repo);
  const owner = { id: "fitlog-owner", email: "me@example.com" };

  await assert.rejects(service.rememberFact(owner, { content: "   ", isImportant: true }));
  await repo.close();
});
