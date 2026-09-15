import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createFitlogServer } from "../src/mcp/server.ts";
import { registerFitlogTools } from "../src/mcp/tools.ts";
import { createSqliteRepository } from "../src/storage/sqlite-repository.ts";
import type { OwnerContext } from "../src/storage/repository.ts";

test("records a workout and returns a dashboard with its UI resource", async () => {
  const repository = createSqliteRepository(":memory:", "me@example.com");
  const owner = { id: "fitlog-owner", email: "me@example.com" };
  const server = createFitlogServer({ mode: "local", localOwner: owner, repositoryFactory: { forOwner: () => repository } });
  const client = new Client({ name: "fitlog-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const workout = await client.callTool({ name: "log_workout", arguments: { date: "2026-09-14", title: "下肢力量", exercises: [{ name: "深蹲", sets: [{ weightKg: 80, reps: 5 }, { weightKg: 80, reps: 5 }] }] } });
  const dashboard = await client.callTool({ name: "get_dashboard", arguments: { from: "2026-09-08", to: "2026-09-14" } });
  assert.equal((workout.structuredContent as { volumeKg: number }).volumeKg, 800);
  assert.equal((dashboard.structuredContent as { trainingDays: number }).trainingDays, 1);
  assert.equal((dashboard as { _meta?: { ui?: { resourceUri?: string } } })._meta?.ui?.resourceUri, "ui://fitlog/dashboard");
  await client.close(); await server.close(); await repository.close();
});

test("uses the authenticated request owner to create the cloud repository", async () => {
  const repository = createSqliteRepository(":memory:", "me@example.com");
  const seenOwners: OwnerContext[] = [];
  const callbacks = new Map<string, (input: unknown, extra: unknown) => Promise<unknown>>();
  registerFitlogTools({ registerTool(name: string, _config: unknown, callback: (input: unknown, extra: unknown) => Promise<unknown>) { callbacks.set(name, callback); } }, { mode: "cloud", repositoryFactory: { forOwner(owner) { seenOwners.push(owner); return repository; } } });
  const result = await callbacks.get("log_workout")?.({ date: "2026-09-14", title: "下肢力量", exercises: [{ name: "深蹲", sets: [{ weightKg: 80, reps: 5 }] }] }, { authInfo: { extra: { owner: { id: "user-1", email: "me@example.com", accessToken: "token-1" } } } });
  assert.equal((result as { structuredContent: { volumeKg: number } }).structuredContent.volumeKg, 400);
  assert.deepEqual(seenOwners, [{ id: "user-1", email: "me@example.com", accessToken: "token-1" }]);
  await repository.close();
});

test("returns a safe authorization error when a cloud tool has no authenticated owner", async () => {
  const callbacks = new Map<string, (input: unknown, extra: unknown) => Promise<unknown>>();
  registerFitlogTools({ registerTool(name: string, _config: unknown, callback: (input: unknown, extra: unknown) => Promise<unknown>) { callbacks.set(name, callback); } }, { mode: "cloud", repositoryFactory: { forOwner: () => { throw new Error("must not run"); } } });
  const result = await callbacks.get("get_dashboard")?.({ from: "2026-09-08", to: "2026-09-14" }, {});
  assert.equal((result as { isError?: boolean }).isError, true);
});
