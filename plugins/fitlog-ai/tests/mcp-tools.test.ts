import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createFitlogServer } from "../src/mcp/server.ts";
import { createSqliteRepository } from "../src/storage/sqlite-repository.ts";

test("records a workout and returns a dashboard with its UI resource", async () => {
  const repository = createSqliteRepository(":memory:", "me@example.com");
  const server = createFitlogServer({ ownerEmail: "me@example.com", repository });
  const client = new Client({ name: "fitlog-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const workout = await client.callTool({
    name: "log_workout",
    arguments: {
      date: "2026-09-14",
      title: "下肢力量",
      exercises: [{ name: "深蹲", sets: [{ weightKg: 80, reps: 5 }, { weightKg: 80, reps: 5 }] }]
    }
  });
  const dashboard = await client.callTool({
    name: "get_dashboard",
    arguments: { from: "2026-09-08", to: "2026-09-14" }
  });

  assert.equal((workout.structuredContent as { volumeKg: number }).volumeKg, 800);
  assert.equal((dashboard.structuredContent as { trainingDays: number }).trainingDays, 1);
  assert.equal((dashboard as { _meta?: { ui?: { resourceUri?: string } } })._meta?.ui?.resourceUri, "ui://fitlog/dashboard");

  await client.close();
  await server.close();
  repository.close();
});
