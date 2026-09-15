import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("declares FitLog, its local MCP endpoint, and its Render deployment", async () => {
  const manifest = JSON.parse(await readFile(".codex-plugin/plugin.json", "utf8"));
  const mcp = JSON.parse(await readFile(".mcp.json", "utf8"));
  const render = await readFile("../../render.yaml", "utf8");
  const readme = await readFile("README.md", "utf8");

  assert.equal(manifest.name, "fitlog-ai");
  assert.equal(mcp.mcpServers.fitlog.url, "http://127.0.0.1:3333/mcp");
  assert.match(render, /rootDir:\s*plugins\/fitlog-ai/);
  assert.match(render, /healthCheckPath:\s*\/healthz/);
  assert.match(render, /FITLOG_RUNTIME/);
  assert.match(readme, /OAuth 2\.1 Server/);
  assert.match(readme, /Dynamic Client Registration/);
  assert.match(readme, /Site URL/);
  assert.match(readme, /Authorization Path/);
});
