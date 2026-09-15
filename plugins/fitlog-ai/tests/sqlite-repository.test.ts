import test from "node:test";
import assert from "node:assert/strict";
import { createSqliteRepository } from "../src/storage/sqlite-repository.ts";
import type { WorkoutInput } from "../src/domain/types.ts";

const workout: WorkoutInput = {
  date: "2026-09-14",
  title: "下肢力量",
  exercises: [{ name: "深蹲", sets: [{ weightKg: 80, reps: 5 }] }]
};

test("stores and reloads a workout for the same owner context", async () => {
  const repo = createSqliteRepository(":memory:", "me@example.com");
  const owner = { id: "fitlog-owner", email: "me@example.com" };
  const id = await repo.saveWorkout(owner, workout);

  const workouts = await repo.listWorkouts(owner, "2026-09-14", "2026-09-14");
  assert.equal(workouts[0]?.id, id);
  assert.equal(workouts[0]?.exercises[0]?.sets[0]?.reps, 5);
  await repo.close();
});

test("rejects a different owner context", async () => {
  const repo = createSqliteRepository(":memory:", "me@example.com");
  const otherOwner = { id: "someone-else", email: "other@example.com" };

  await assert.rejects(
    repo.listWorkouts(otherOwner, "2026-09-14", "2026-09-14"),
    /not authorized/
  );
  await repo.close();
});
