import test from "node:test";
import assert from "node:assert/strict";
import { runRetention } from "../src/services/retention-service.ts";
import { createSqliteRepository } from "../src/storage/sqlite-repository.ts";

test("deletes audit events older than 30 days", () => {
  const repo = createSqliteRepository(":memory:", "me@example.com");
  repo.writeAuditEvent("me@example.com", "old.event", {}, "2026-08-01T02:00:00.000Z");
  repo.writeAuditEvent("me@example.com", "recent.event", {}, "2026-09-13T02:00:00.000Z");

  assert.equal(runRetention(repo, new Date("2026-09-14T02:00:00.000Z")), 1);
  assert.equal(repo.countAuditEvents("me@example.com"), 1);
  repo.close();
});
