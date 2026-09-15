import type { MealInput, WorkoutInput } from "../domain/types.ts";

export interface BodyMeasurementInput {
  date: string;
  weightKg: number;
  bodyFatPercent?: number;
}

export interface MemoryFactInput {
  content: string;
  category?: string;
  isImportant: boolean;
}

export interface StoredWorkout extends WorkoutInput {
  id: string;
  volumeKg: number;
}

export interface StoredMeal extends MealInput {
  id: string;
}

export interface StoredBodyMeasurement extends BodyMeasurementInput {
  id: string;
}

export interface StoredMemoryFact extends MemoryFactInput {
  id: string;
  createdAt: string;
}

export interface FitLogRepository {
  saveWorkout(ownerEmail: string, workout: WorkoutInput): string;
  saveMeal(ownerEmail: string, meal: MealInput): string;
  saveBodyMeasurement(ownerEmail: string, measurement: BodyMeasurementInput): string;
  saveMemoryFact(ownerEmail: string, fact: MemoryFactInput): string;
  listWorkouts(ownerEmail: string, from: string, to: string): StoredWorkout[];
  listMeals(ownerEmail: string, from: string, to: string): StoredMeal[];
  listMeasurements(ownerEmail: string, from: string, to: string): StoredBodyMeasurement[];
  listMemoryFacts(ownerEmail: string): StoredMemoryFact[];
  deleteMemoryFact(ownerEmail: string, id: string): boolean;
  writeAuditEvent(ownerEmail: string, action: string, metadata?: Record<string, unknown>, createdAt?: string): void;
  purgeAuditEventsBefore(ownerEmail: string, cutoff: string): number;
  countAuditEvents(ownerEmail: string): number;
  close(): void;
}
