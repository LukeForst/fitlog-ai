import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { calculateWorkoutVolume } from "../domain/calculations.ts";
import type { MealInput, WorkoutInput } from "../domain/types.ts";
import type {
  BodyMeasurementInput,
  FitLogRepository,
  MemoryFactInput,
  StoredBodyMeasurement,
  StoredMeal,
  StoredMemoryFact,
  StoredWorkout
} from "./repository.ts";

const OWNER_ID = "fitlog-owner";

type WorkoutRow = { id: string; date: string; title: string; note: string | null; volumeKg: number };
type ExerciseRow = { id: string; name: string };
type SetRow = { weightKg: number; reps: number };
type MealRow = Omit<StoredMeal, "note"> & { note: string | null };
type MeasurementRow = Omit<StoredBodyMeasurement, "bodyFatPercent"> & { bodyFatPercent: number | null };
type FactRow = Omit<StoredMemoryFact, "category" | "isImportant"> & { category: string | null; isImportant: number };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createSqliteRepository(path: string, ownerEmail: string): FitLogRepository {
  return new SqliteRepository(path, ownerEmail);
}

class SqliteRepository implements FitLogRepository {
  private readonly database: DatabaseSync;
  private readonly ownerEmail: string;

  constructor(path: string, ownerEmail: string) {
    this.database = new DatabaseSync(path);
    this.ownerEmail = normalizeEmail(ownerEmail);
    this.database.exec("PRAGMA foreign_keys = ON");
    this.initialize();
  }

  saveWorkout(ownerEmail: string, workout: WorkoutInput): string {
    this.assertAuthorized(ownerEmail);
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare(
        "INSERT INTO workouts (id, owner_id, date, title, note, volume_kg, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(id, OWNER_ID, workout.date, workout.title, workout.note ?? null, calculateWorkoutVolume(workout.exercises), createdAt);

      workout.exercises.forEach((exercise, exerciseIndex) => {
        const exerciseId = randomUUID();
        this.database.prepare(
          "INSERT INTO exercises (id, workout_id, name, position) VALUES (?, ?, ?, ?)"
        ).run(exerciseId, id, exercise.name, exerciseIndex);

        exercise.sets.forEach((set, setIndex) => {
          this.database.prepare(
            "INSERT INTO workout_sets (id, exercise_id, position, weight_kg, reps) VALUES (?, ?, ?, ?, ?)"
          ).run(randomUUID(), exerciseId, setIndex, set.weightKg, set.reps);
        });
      });
      this.database.exec("COMMIT");
      return id;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  saveMeal(ownerEmail: string, meal: MealInput): string {
    this.assertAuthorized(ownerEmail);
    const id = randomUUID();
    this.database.prepare(
      "INSERT INTO meals (id, owner_id, date, meal_type, note, calories, protein_g, carbs_g, fat_g, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(id, OWNER_ID, meal.date, meal.mealType, meal.note ?? null, meal.calories, meal.proteinG, meal.carbsG, meal.fatG, new Date().toISOString());
    return id;
  }

  saveBodyMeasurement(ownerEmail: string, measurement: BodyMeasurementInput): string {
    this.assertAuthorized(ownerEmail);
    const id = randomUUID();
    this.database.prepare(
      "INSERT INTO body_measurements (id, owner_id, date, weight_kg, body_fat_percent, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, OWNER_ID, measurement.date, measurement.weightKg, measurement.bodyFatPercent ?? null, new Date().toISOString());
    return id;
  }

  saveMemoryFact(ownerEmail: string, fact: MemoryFactInput): string {
    this.assertAuthorized(ownerEmail);
    const id = randomUUID();
    this.database.prepare(
      "INSERT INTO memory_facts (id, owner_id, content, category, is_important, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, OWNER_ID, fact.content, fact.category ?? null, Number(fact.isImportant), new Date().toISOString());
    return id;
  }

  listWorkouts(ownerEmail: string, from: string, to: string): StoredWorkout[] {
    this.assertAuthorized(ownerEmail);
    const workouts = this.database.prepare(
      "SELECT id, date, title, note, volume_kg AS volumeKg FROM workouts WHERE owner_id = ? AND date BETWEEN ? AND ? ORDER BY date DESC, created_at DESC"
    ).all(OWNER_ID, from, to) as unknown as WorkoutRow[];

    return workouts.map((workout) => ({
      id: workout.id,
      date: workout.date,
      title: workout.title,
      ...(workout.note ? { note: workout.note } : {}),
      volumeKg: workout.volumeKg,
      exercises: this.database.prepare(
        "SELECT id, name FROM exercises WHERE workout_id = ? ORDER BY position"
      ).all(workout.id).map((exercise) => {
        const exerciseRow = exercise as unknown as ExerciseRow;
        return {
          name: exerciseRow.name,
          sets: this.database.prepare(
            "SELECT weight_kg AS weightKg, reps FROM workout_sets WHERE exercise_id = ? ORDER BY position"
          ).all(exerciseRow.id) as unknown as SetRow[]
        };
      })
    }));
  }

  listMeals(ownerEmail: string, from: string, to: string): StoredMeal[] {
    this.assertAuthorized(ownerEmail);
    const rows = this.database.prepare(
      "SELECT id, date, meal_type AS mealType, note, calories, protein_g AS proteinG, carbs_g AS carbsG, fat_g AS fatG FROM meals WHERE owner_id = ? AND date BETWEEN ? AND ? ORDER BY date DESC, created_at DESC"
    ).all(OWNER_ID, from, to) as unknown as MealRow[];
    return rows.map(({ note, ...meal }) => ({ ...meal, ...(note ? { note } : {}) }));
  }

  listMeasurements(ownerEmail: string, from: string, to: string): StoredBodyMeasurement[] {
    this.assertAuthorized(ownerEmail);
    const rows = this.database.prepare(
      "SELECT id, date, weight_kg AS weightKg, body_fat_percent AS bodyFatPercent FROM body_measurements WHERE owner_id = ? AND date BETWEEN ? AND ? ORDER BY date DESC, created_at DESC"
    ).all(OWNER_ID, from, to) as unknown as MeasurementRow[];
    return rows.map(({ bodyFatPercent, ...measurement }) => ({ ...measurement, ...(bodyFatPercent === null ? {} : { bodyFatPercent }) }));
  }

  listMemoryFacts(ownerEmail: string): StoredMemoryFact[] {
    this.assertAuthorized(ownerEmail);
    const rows = this.database.prepare(
      "SELECT id, content, category, is_important AS isImportant, created_at AS createdAt FROM memory_facts WHERE owner_id = ? ORDER BY created_at DESC"
    ).all(OWNER_ID) as unknown as FactRow[];
    return rows.map(({ category, isImportant, ...fact }) => ({
      ...fact,
      isImportant: Boolean(isImportant),
      ...(category ? { category } : {})
    }));
  }

  deleteMemoryFact(ownerEmail: string, id: string): boolean {
    this.assertAuthorized(ownerEmail);
    const result = this.database.prepare(
      "DELETE FROM memory_facts WHERE id = ? AND owner_id = ?"
    ).run(id, OWNER_ID);
    return result.changes > 0;
  }

  writeAuditEvent(ownerEmail: string, action: string, metadata: Record<string, unknown> = {}, createdAt = new Date().toISOString()): void {
    this.assertAuthorized(ownerEmail);
    this.database.prepare(
      "INSERT INTO audit_events (id, owner_id, action, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(randomUUID(), OWNER_ID, action, JSON.stringify(metadata), createdAt);
  }

  purgeAuditEventsBefore(ownerEmail: string, cutoff: string): number {
    this.assertAuthorized(ownerEmail);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = this.database.prepare(
        "DELETE FROM audit_events WHERE owner_id = ? AND created_at < ?"
      ).run(OWNER_ID, cutoff);
      this.database.exec("COMMIT");
      return Number(result.changes);
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  countAuditEvents(ownerEmail: string): number {
    this.assertAuthorized(ownerEmail);
    const result = this.database.prepare(
      "SELECT COUNT(*) AS count FROM audit_events WHERE owner_id = ?"
    ).get(OWNER_ID) as unknown as { count: number };
    return result.count;
  }

  close(): void {
    this.database.close();
  }

  private assertAuthorized(email: string): void {
    if (normalizeEmail(email) !== this.ownerEmail) {
      throw new Error("not authorized");
    }
  }

  private initialize(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workouts (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id),
        date TEXT NOT NULL,
        title TEXT NOT NULL,
        note TEXT,
        volume_kg REAL NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS exercises (
        id TEXT PRIMARY KEY,
        workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        position INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workout_sets (
        id TEXT PRIMARY KEY,
        exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        weight_kg REAL NOT NULL,
        reps INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meals (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id),
        date TEXT NOT NULL,
        meal_type TEXT NOT NULL,
        note TEXT,
        calories REAL NOT NULL,
        protein_g REAL NOT NULL,
        carbs_g REAL NOT NULL,
        fat_g REAL NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS body_measurements (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id),
        date TEXT NOT NULL,
        weight_kg REAL NOT NULL,
        body_fat_percent REAL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memory_facts (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        category TEXT,
        is_important INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id),
        action TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    const existing = this.database.prepare("SELECT email FROM users WHERE id = ?").get(OWNER_ID) as unknown as { email: string } | undefined;
    if (existing && existing.email !== this.ownerEmail) {
      throw new Error("database owner does not match configured owner");
    }
    this.database.prepare("INSERT OR IGNORE INTO users (id, email, created_at) VALUES (?, ?, ?)").run(
      OWNER_ID,
      this.ownerEmail,
      new Date().toISOString()
    );
  }
}
