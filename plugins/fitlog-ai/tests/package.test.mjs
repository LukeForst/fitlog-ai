import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("declares FitLog and its local MCP endpoint", async () => {
  const manifest = JSON.parse(await readFile(".codex-plugin/plugin.json", "utf8"));
  const mcp = JSON.parse(await readFile(".mcp.json", "utf8"));

  assert.equal(manifest.name, "fitlog-ai");
  assert.equal(mcp.mcpServers.fitlog.url, "http://127.0.0.1:3333/mcp");
});
