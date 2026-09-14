import test from "node:test";
import assert from "node:assert/strict";
import { calculateNutrition, createWorkoutSet, answerCoach } from "../dist/logic.js";

test("calculates daily nutrition totals from saved meals", () => {
  const summary = calculateNutrition([
    { calories: 460, protein: 35, carbs: 58, fat: 12 },
    { calories: 210, protein: 25, carbs: 8, fat: 7 }
  ]);

  assert.deepEqual(summary, { calories: 670, protein: 60, carbs: 66, fat: 19 });
});

test("creates a workout set from selected weight and reps", () => {
  assert.deepEqual(createWorkoutSet(42.5, 10), { weight: 42.5, reps: 10 });
});

test("answers calorie questions with the current personal total", () => {
  const response = answerCoach("今天吃了多少热量？", {
    nutrition: { calories: 670, protein: 60, carbs: 66, fat: 19 },
    workouts: []
  });

  assert.match(response, /670/);
});
