import { z } from "zod";
import { calculateWorkoutVolume, sumNutrition } from "../domain/calculations.ts";
import type { MealInput, NutritionTotals, WorkoutInput } from "../domain/types.ts";
import { parseMealInput, parseWorkoutInput } from "../domain/validation.ts";
import type { BodyMeasurementInput, FitLogRepository, MemoryFactInput, OwnerContext } from "../storage/repository.ts";

const bodyMeasurementSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weightKg: z.number().finite().min(0).max(1_000),
  bodyFatPercent: z.number().finite().min(0).max(100).optional()
});

const memoryFactSchema = z.object({
  content: z.string().trim().min(1).max(1_000),
  category: z.string().trim().min(1).max(60).optional(),
  isImportant: z.boolean()
});

export interface RecordService {
  recordWorkout(owner: OwnerContext, input: unknown): Promise<{ id: string; volumeKg: number; workout: WorkoutInput }>;
  recordMeal(owner: OwnerContext, input: unknown): Promise<{ id: string; nutrition: NutritionTotals; meal: MealInput }>;
  recordBodyMeasurement(owner: OwnerContext, input: unknown): Promise<{ id: string; measurement: BodyMeasurementInput }>;
  rememberFact(owner: OwnerContext, input: unknown): Promise<{ id: string; fact: MemoryFactInput }>;
  forgetFact(owner: OwnerContext, memoryId: string): Promise<boolean>;
}

export function createRecordService(repository: FitLogRepository): RecordService {
  const audit = async (owner: OwnerContext, action: string, recordId: string) => {
    await repository.writeAuditEvent(owner, action, { recordId, timestamp: new Date().toISOString() });
  };

  return {
    async recordWorkout(owner, input) {
      const workout = parseWorkoutInput(input);
      const id = await repository.saveWorkout(owner, workout);
      await audit(owner, "workout.recorded", id);
      return { id, volumeKg: calculateWorkoutVolume(workout.exercises), workout };
    },

    async recordMeal(owner, input) {
      const meal = parseMealInput(input);
      const id = await repository.saveMeal(owner, meal);
      await audit(owner, "meal.recorded", id);
      return { id, nutrition: sumNutrition([meal]), meal };
    },

    async recordBodyMeasurement(owner, input) {
      const parsed = bodyMeasurementSchema.safeParse(input);
      if (!parsed.success) {
        throw new Error("身体数据不符合要求");
      }
      const measurement = parsed.data;
      const id = await repository.saveBodyMeasurement(owner, measurement);
      await audit(owner, "body_measurement.recorded", id);
      return { id, measurement };
    },

    async rememberFact(owner, input) {
      const parsed = memoryFactSchema.safeParse(input);
      if (!parsed.success) {
        throw new Error("长期记忆内容不符合要求");
      }
      const fact = parsed.data;
      const id = await repository.saveMemoryFact(owner, fact);
      await audit(owner, "memory.remembered", id);
      return { id, fact };
    },

    async forgetFact(owner, memoryId) {
      const deleted = await repository.deleteMemoryFact(owner, memoryId);
      if (deleted) {
        await audit(owner, "memory.forgotten", memoryId);
      }
      return deleted;
    }
  };
}
