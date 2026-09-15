import { z } from "zod";
import { calculateWorkoutVolume, sumNutrition } from "../domain/calculations.ts";
import type { MealInput, NutritionTotals, WorkoutInput } from "../domain/types.ts";
import { parseMealInput, parseWorkoutInput } from "../domain/validation.ts";
import type { BodyMeasurementInput, FitLogRepository, MemoryFactInput } from "../storage/repository.ts";

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
  recordWorkout(ownerEmail: string, input: unknown): { id: string; volumeKg: number; workout: WorkoutInput };
  recordMeal(ownerEmail: string, input: unknown): { id: string; nutrition: NutritionTotals; meal: MealInput };
  recordBodyMeasurement(ownerEmail: string, input: unknown): { id: string; measurement: BodyMeasurementInput };
  rememberFact(ownerEmail: string, input: unknown): { id: string; fact: MemoryFactInput };
  forgetFact(ownerEmail: string, memoryId: string): boolean;
}

export function createRecordService(repository: FitLogRepository): RecordService {
  const audit = (ownerEmail: string, action: string, recordId: string) => {
    repository.writeAuditEvent(ownerEmail, action, { recordId, timestamp: new Date().toISOString() });
  };

  return {
    recordWorkout(ownerEmail, input) {
      const workout = parseWorkoutInput(input);
      const id = repository.saveWorkout(ownerEmail, workout);
      audit(ownerEmail, "workout.recorded", id);
      return { id, volumeKg: calculateWorkoutVolume(workout.exercises), workout };
    },

    recordMeal(ownerEmail, input) {
      const meal = parseMealInput(input);
      const id = repository.saveMeal(ownerEmail, meal);
      audit(ownerEmail, "meal.recorded", id);
      return { id, nutrition: sumNutrition([meal]), meal };
    },

    recordBodyMeasurement(ownerEmail, input) {
      const parsed = bodyMeasurementSchema.safeParse(input);
      if (!parsed.success) {
        throw new Error("身体数据不符合要求");
      }
      const measurement = parsed.data;
      const id = repository.saveBodyMeasurement(ownerEmail, measurement);
      audit(ownerEmail, "body_measurement.recorded", id);
      return { id, measurement };
    },

    rememberFact(ownerEmail, input) {
      const parsed = memoryFactSchema.safeParse(input);
      if (!parsed.success) {
        throw new Error("长期记忆内容不符合要求");
      }
      const fact = parsed.data;
      const id = repository.saveMemoryFact(ownerEmail, fact);
      audit(ownerEmail, "memory.remembered", id);
      return { id, fact };
    },

    forgetFact(ownerEmail, memoryId) {
      const deleted = repository.deleteMemoryFact(ownerEmail, memoryId);
      if (deleted) {
        audit(ownerEmail, "memory.forgotten", memoryId);
      }
      return deleted;
    }
  };
}
