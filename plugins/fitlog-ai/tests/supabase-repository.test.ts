import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createSupabaseRepositoryFactory } from "../src/storage/supabase-repository.ts";
import type { WorkoutInput } from "../src/domain/types.ts";

const owner = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "me@example.com",
  accessToken: "caller-token"
};

const workout: WorkoutInput = {
  date: "2026-09-15",
  title: "下肢力量",
  note: "深蹲优先",
  exercises: [
    {
      name: "深蹲",
      sets: [
        { weightKg: 80, reps: 5 },
        { weightKg: 80, reps: 5 }
      ]
    }
  ]
};

test("forwards the caller token and full workout payload to the transactional RPC", async () => {
  const calls: Request[] = [];
  const factory = createSupabaseRepositoryFactory({
    url: "https://example.supabase.co",
    publishableKey: "publishable-test",
    fetch: async (input, init) => {
      calls.push(new Request(input, init));
      return Response.json("22222222-2222-4222-8222-222222222222");
    }
  });

  const id = await factory.forOwner(owner).saveWorkout(owner, workout);

  assert.equal(id, "22222222-2222-4222-8222-222222222222");
  assert.equal(calls.length, 1);
  assert.match(calls[0]?.url ?? "", /\/rest\/v1\/rpc\/fitlog_record_workout$/);
  assert.equal(calls[0]?.headers.get("authorization"), "Bearer caller-token");
  assert.deepEqual(await calls[0]?.json(), {
    payload: {
      date: "2026-09-15",
      title: "下肢力量",
      note: "深蹲优先",
      volumeKg: 800,
      exercises: workout.exercises
    }
  });
});

test("rejects a cloud owner without an access token before requesting Supabase", async () => {
  let calls = 0;
  const factory = createSupabaseRepositoryFactory({
    url: "https://example.supabase.co",
    publishableKey: "publishable-test",
    fetch: async () => {
      calls += 1;
      return Response.json({});
    }
  });

  await assert.rejects(
    factory.forOwner({ id: owner.id, email: owner.email }).saveWorkout({ id: owner.id, email: owner.email }, workout),
    /access token/i
  );
  assert.equal(calls, 0);
});

test("defines auth-owned RLS policies and the transactional workout function", async () => {
  const migrationPath = fileURLToPath(
    new URL("../../../supabase/migrations/002_fitlog_rls_and_workout_rpc.sql", import.meta.url)
  );
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /references\s+auth\.users\s*\(id\)/i);
  assert.match(migration, /create\s+policy/i);
  assert.match(migration, /fitlog_record_workout/i);
  assert.match(migration, /security\s+invoker/i);
  assert.match(migration, /auth\.uid\s*\(\)/i);
  assert.doesNotMatch(migration, /\\\\\./);
});
