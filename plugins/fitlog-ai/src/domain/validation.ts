import { z } from "zod";
import type { MealInput, WorkoutInput } from "./types.ts";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (maximum: number) => z.string().trim().min(1).max(maximum);

const workoutSchema = z.object({
  date: isoDate,
  title: text(120),
  note: z.string().trim().max(1_000).optional(),
  exercises: z.array(z.object({
    name: text(120),
    sets: z.array(z.object({
      weightKg: z.number().finite().min(0).max(1_000),
      reps: z.number().int().min(1).max(1_000)
    })).min(1).max(50)
  })).min(1).max(50)
});

const mealSchema = z.object({
  date: isoDate,
  mealType: text(30),
  note: z.string().trim().max(1_000).optional(),
  calories: z.number().finite().min(0).max(50_000),
  proteinG: z.number().finite().min(0).max(10_000),
  carbsG: z.number().finite().min(0).max(10_000),
  fatG: z.number().finite().min(0).max(10_000)
});

export function parseWorkoutInput(input: unknown): WorkoutInput {
  const result = workoutSchema.safeParse(input);
  if (!result.success) {
    throw new Error("训练数据不符合要求");
  }
  return result.data;
}

export function parseMealInput(input: unknown): MealInput {
  const result = mealSchema.safeParse(input);
  if (!result.success) {
    throw new Error("饮食数据不符合要求");
  }
  return result.data;
}
