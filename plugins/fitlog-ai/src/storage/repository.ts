import type { MealInput, WorkoutInput } from "../domain/types.ts";

export interface OwnerContext {
  id: string;
  email: string;
  accessToken?: string;
}

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
  saveWorkout(owner: OwnerContext, workout: WorkoutInput): Promise<string>;
  saveMeal(owner: OwnerContext, meal: MealInput): Promise<string>;
  saveBodyMeasurement(owner: OwnerContext, measurement: BodyMeasurementInput): Promise<string>;
  saveMemoryFact(owner: OwnerContext, fact: MemoryFactInput): Promise<string>;
  listWorkouts(owner: OwnerContext, from: string, to: string): Promise<StoredWorkout[]>;
  listMeals(owner: OwnerContext, from: string, to: string): Promise<StoredMeal[]>;
  listMeasurements(owner: OwnerContext, from: string, to: string): Promise<StoredBodyMeasurement[]>;
  listMemoryFacts(owner: OwnerContext): Promise<StoredMemoryFact[]>;
  deleteMemoryFact(owner: OwnerContext, id: string): Promise<boolean>;
  writeAuditEvent(owner: OwnerContext, action: string, metadata?: Record<string, unknown>, createdAt?: string): Promise<void>;
  purgeAuditEventsBefore(owner: OwnerContext, cutoff: string): Promise<number>;
  countAuditEvents(owner: OwnerContext): Promise<number>;
  close(): Promise<void>;
}
