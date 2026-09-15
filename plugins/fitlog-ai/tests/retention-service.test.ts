import test from "node:test";
import assert from "node:assert/strict";
import { runRetention } from "../src/services/retention-service.ts";
import { createSqliteRepository } from "../src/storage/sqlite-repository.ts";

test("deletes audit events older than 30 days", async () => {
  const repo = createSqliteRepository(":memory:", "me@example.com");
  const owner = { id: "fitlog-owner", email: "me@example.com" };
  await repo.writeAuditEvent(owner, "old.event", {}, "2026-08-01T02:00:00.000Z");
  await repo.writeAuditEvent(owner, "recent.event", {}, "2026-09-13T02:00:00.000Z");

  assert.equal(await runRetention(repo, owner, new Date("2026-09-14T02:00:00.000Z")), 1);
  assert.equal(await repo.countAuditEvents(owner), 1);
  await repo.close();
});
