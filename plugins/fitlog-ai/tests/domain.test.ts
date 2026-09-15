import test from "node:test";
import assert from "node:assert/strict";
import { calculateWorkoutVolume, sumNutrition } from "../src/domain/calculations.ts";
import { parseMealInput, parseWorkoutInput } from "../src/domain/validation.ts";

test("calculates volume from normalized workout sets", () => {
  const workout = parseWorkoutInput({
    date: "2026-09-14",
    title: "下肢力量",
    exercises: [{ name: "深蹲", sets: [{ weightKg: 80, reps: 5 }, { weightKg: 80, reps: 5 }] }]
  });

  assert.equal(calculateWorkoutVolume(workout.exercises), 800);
});

test("rejects a set with zero repetitions", () => {
  assert.throws(() => parseWorkoutInput({
    date: "2026-09-14",
    title: "错误",
    exercises: [{ name: "深蹲", sets: [{ weightKg: 80, reps: 0 }] }]
  }));
});

test("accepts non-negative meal nutrients and sums them", () => {
  const meal = parseMealInput({
    date: "2026-09-14",
    mealType: "午餐",
    note: "鸡胸肉饭",
    calories: 460,
    proteinG: 35,
    carbsG: 58,
    fatG: 12
  });

  assert.deepEqual(sumNutrition([meal]), {
    calories: 460,
    proteinG: 35,
    carbsG: 58,
    fatG: 12
  });
});
