import test from "node:test";
import assert from "node:assert/strict";
import { createSqliteRepository } from "../src/storage/sqlite-repository.ts";
import type { WorkoutInput } from "../src/domain/types.ts";

const workout: WorkoutInput = {
  date: "2026-09-14",
  title: "下肢力量",
  exercises: [{ name: "深蹲", sets: [{ weightKg: 80, reps: 5 }] }]
};

test("stores and reloads a workout for the configured owner", () => {
  const repo = createSqliteRepository(":memory:", "me@example.com");
  const id = repo.saveWorkout("me@example.com", workout);

  assert.equal(repo.listWorkouts("me@example.com", "2026-09-14", "2026-09-14")[0]?.id, id);
  assert.equal(repo.listWorkouts("me@example.com", "2026-09-14", "2026-09-14")[0]?.exercises[0]?.sets[0]?.reps, 5);
  repo.close();
});

test("rejects a different email", () => {
  const repo = createSqliteRepository(":memory:", "me@example.com");

  assert.throws(
    () => repo.listWorkouts("other@example.com", "2026-09-14", "2026-09-14"),
    /not authorized/
  );
  repo.close();
});
