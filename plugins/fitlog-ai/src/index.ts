import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createFitlogServer } from "./mcp/server.ts";
import { runRetention } from "./services/retention-service.ts";
import { createSqliteRepository } from "./storage/sqlite-repository.ts";

const isProduction = process.env.NODE_ENV === "production";
const ownerEmail = process.env.FITLOG_OWNER_EMAIL ?? (isProduction ? undefined : "me@example.com");
const databasePath = process.env.FITLOG_SQLITE_PATH ?? (isProduction ? undefined : "./fitlog.local.db");

if (!ownerEmail || !databasePath) {
  throw new Error("生产环境必须设置 FITLOG_OWNER_EMAIL 和 FITLOG_SQLITE_PATH");
}

const repository = createSqliteRepository(databasePath, ownerEmail);
const owner = { id: "fitlog-owner", email: ownerEmail };
await runRetention(repository, owner, new Date());

const mcpServer = createFitlogServer({ ownerEmail, repository });
const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
await mcpServer.connect(transport);

const port = Number(process.env.PORT ?? 3333);
const httpServer = createServer(async (request, response) => {
  if (request.url?.startsWith("/mcp")) {
    await transport.handleRequest(request, response);
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not found" }));
});

httpServer.listen(port, () => {
  console.log(`FitLog MCP listening on http://127.0.0.1:${port}/mcp`);
});
