import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { calculateWorkoutVolume } from "../domain/calculations.ts";
import type { MealInput, WorkoutInput } from "../domain/types.ts";
import type { BodyMeasurementInput, FitLogRepository, MemoryFactInput, OwnerContext, RepositoryFactory, StoredBodyMeasurement, StoredMeal, StoredMemoryFact, StoredWorkout } from "./repository.ts";

export interface SupabaseRepositoryConfig { url: string; publishableKey: string; fetch?: typeof fetch; }
type Row = Record<string, unknown>;

function requireAccessToken(owner: OwnerContext): asserts owner is OwnerContext & { accessToken: string } {
  if (!owner.accessToken?.trim()) throw new Error("an access token is required for cloud storage");
}
function requestError(): Error { return new Error("Supabase request failed"); }
function optionalText(value: unknown): string | undefined { return typeof value === "string" && value.length > 0 ? value : undefined; }
function numberValue(value: unknown): number { const number = typeof value === "number" ? value : Number(value); if (!Number.isFinite(number)) throw new Error("Supabase returned an invalid numeric value"); return number; }
function stringValue(value: unknown): string { if (typeof value !== "string") throw new Error("Supabase returned an invalid record"); return value; }

export function createSupabaseRepositoryFactory(config: SupabaseRepositoryConfig): RepositoryFactory {
  return { forOwner(owner: OwnerContext): FitLogRepository {
    const client = createClient(config.url, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: owner.accessToken ? { Authorization: `Bearer ${owner.accessToken}` } : {}, fetch: config.fetch }
    });
    return new SupabaseRepository(client, owner);
  }};
}

class SupabaseRepository implements FitLogRepository {
  private readonly client: SupabaseClient;
  private readonly requestOwner: OwnerContext;

  constructor(client: SupabaseClient, requestOwner: OwnerContext) {
    this.client = client;
    this.requestOwner = requestOwner;
  }

  async saveWorkout(owner: OwnerContext, workout: WorkoutInput): Promise<string> {
    this.assertRequestOwner(owner);
    const { data, error } = await this.client.rpc("fitlog_record_workout", { payload: {
      date: workout.date, title: workout.title, ...(workout.note ? { note: workout.note } : {}),
      volumeKg: calculateWorkoutVolume(workout.exercises), exercises: workout.exercises
    }});
    if (error || typeof data !== "string") throw requestError();
    return data;
  }

  async saveMeal(owner: OwnerContext, meal: MealInput): Promise<string> {
    this.assertRequestOwner(owner); await this.ensureUser();
    const { data, error } = await this.client.from("meals").insert({ owner_id: owner.id, date: meal.date, meal_type: meal.mealType, note: meal.note ?? null, calories: meal.calories, protein_g: meal.proteinG, carbs_g: meal.carbsG, fat_g: meal.fatG }).select("id").single();
    if (error || !data) throw requestError(); return stringValue((data as Row).id);
  }

  async saveBodyMeasurement(owner: OwnerContext, measurement: BodyMeasurementInput): Promise<string> {
    this.assertRequestOwner(owner); await this.ensureUser();
    const { data, error } = await this.client.from("body_measurements").insert({ owner_id: owner.id, date: measurement.date, weight_kg: measurement.weightKg, body_fat_percent: measurement.bodyFatPercent ?? null }).select("id").single();
    if (error || !data) throw requestError(); return stringValue((data as Row).id);
  }

  async saveMemoryFact(owner: OwnerContext, fact: MemoryFactInput): Promise<string> {
    this.assertRequestOwner(owner); await this.ensureUser();
    const { data, error } = await this.client.from("memory_facts").insert({ owner_id: owner.id, content: fact.content, category: fact.category ?? null, is_important: fact.isImportant }).select("id").single();
    if (error || !data) throw requestError(); return stringValue((data as Row).id);
  }

  async listWorkouts(owner: OwnerContext, from: string, to: string): Promise<StoredWorkout[]> {
    this.assertRequestOwner(owner);
    const { data, error } = await this.client.from("workouts").select("id,date,title,note,volume_kg,exercises(id,name,position,workout_sets(weight_kg,reps,position))").gte("date", from).lte("date", to).order("date", { ascending: false });
    if (error || !data) throw requestError(); return (data as Row[]).map((row) => this.mapWorkout(row));
  }

  async listMeals(owner: OwnerContext, from: string, to: string): Promise<StoredMeal[]> {
    this.assertRequestOwner(owner);
    const { data, error } = await this.client.from("meals").select("id,date,meal_type,note,calories,protein_g,carbs_g,fat_g").gte("date", from).lte("date", to).order("date", { ascending: false });
    if (error || !data) throw requestError();
    return (data as Row[]).map((row) => ({ id: stringValue(row.id), date: stringValue(row.date), mealType: stringValue(row.meal_type), calories: numberValue(row.calories), proteinG: numberValue(row.protein_g), carbsG: numberValue(row.carbs_g), fatG: numberValue(row.fat_g), ...(optionalText(row.note) ? { note: optionalText(row.note) } : {}) }));
  }

  async listMeasurements(owner: OwnerContext, from: string, to: string): Promise<StoredBodyMeasurement[]> {
    this.assertRequestOwner(owner);
    const { data, error } = await this.client.from("body_measurements").select("id,date,weight_kg,body_fat_percent").gte("date", from).lte("date", to).order("date", { ascending: false });
    if (error || !data) throw requestError();
    return (data as Row[]).map((row) => ({ id: stringValue(row.id), date: stringValue(row.date), weightKg: numberValue(row.weight_kg), ...(row.body_fat_percent === null ? {} : { bodyFatPercent: numberValue(row.body_fat_percent) }) }));
  }

  async listMemoryFacts(owner: OwnerContext): Promise<StoredMemoryFact[]> {
    this.assertRequestOwner(owner);
    const { data, error } = await this.client.from("memory_facts").select("id,content,category,is_important,created_at").order("created_at", { ascending: false });
    if (error || !data) throw requestError();
    return (data as Row[]).map((row) => ({ id: stringValue(row.id), content: stringValue(row.content), isImportant: Boolean(row.is_important), createdAt: stringValue(row.created_at), ...(optionalText(row.category) ? { category: optionalText(row.category) } : {}) }));
  }

  async deleteMemoryFact(owner: OwnerContext, id: string): Promise<boolean> {
    this.assertRequestOwner(owner); const { data, error } = await this.client.from("memory_facts").delete().eq("id", id).select("id");
    if (error) throw requestError(); return Array.isArray(data) && data.length > 0;
  }

  async writeAuditEvent(owner: OwnerContext, action: string, metadata: Record<string, unknown> = {}, createdAt = new Date().toISOString()): Promise<void> {
    this.assertRequestOwner(owner); await this.ensureUser();
    const { error } = await this.client.from("audit_events").insert({ owner_id: owner.id, action, metadata_json: metadata, created_at: createdAt });
    if (error) throw requestError();
  }

  async purgeAuditEventsBefore(owner: OwnerContext, cutoff: string): Promise<number> {
    this.assertRequestOwner(owner); const { data, error } = await this.client.from("audit_events").delete().lt("created_at", cutoff).select("id");
    if (error) throw requestError(); return Array.isArray(data) ? data.length : 0;
  }

  async countAuditEvents(owner: OwnerContext): Promise<number> {
    this.assertRequestOwner(owner); const { count, error } = await this.client.from("audit_events").select("id", { count: "exact", head: true });
    if (error) throw requestError(); return count ?? 0;
  }

  async close(): Promise<void> {}

  private async ensureUser(): Promise<void> {
    const { error } = await this.client.from("fitlog_users").upsert({ id: this.requestOwner.id, email: this.requestOwner.email }, { onConflict: "id" });
    if (error) throw requestError();
  }

  private assertRequestOwner(owner: OwnerContext): asserts owner is OwnerContext & { accessToken: string } {
    requireAccessToken(owner);
    if (owner.id !== this.requestOwner.id || owner.email !== this.requestOwner.email || owner.accessToken !== this.requestOwner.accessToken) throw new Error("owner context does not match this repository");
  }

  private mapWorkout(row: Row): StoredWorkout {
    const exercises = Array.isArray(row.exercises) ? row.exercises as Row[] : [];
    return {
      id: stringValue(row.id), date: stringValue(row.date), title: stringValue(row.title), volumeKg: numberValue(row.volume_kg), ...(optionalText(row.note) ? { note: optionalText(row.note) } : {}),
      exercises: exercises.sort((a, b) => numberValue(a.position) - numberValue(b.position)).map((exercise) => {
        const sets = Array.isArray(exercise.workout_sets) ? exercise.workout_sets as Row[] : [];
        return { name: stringValue(exercise.name), sets: sets.sort((a, b) => numberValue(a.position) - numberValue(b.position)).map((set) => ({ weightKg: numberValue(set.weight_kg), reps: numberValue(set.reps) })) };
      })
    };
  }
}
