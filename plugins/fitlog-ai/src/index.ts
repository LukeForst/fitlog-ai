import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createHttpRequestHandler } from "./http/routes.ts";
import { createSupabaseIdentityVerifier } from "./auth/identity.ts";
import { createFitlogServer } from "./mcp/server.ts";
import { runRetention } from "./services/retention-service.ts";
import { createSqliteRepository } from "./storage/sqlite-repository.ts";
import { createSupabaseRepositoryFactory } from "./storage/supabase-repository.ts";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing required configuration: " + name);
  return value;
}

async function startLocal(): Promise<void> {
  const isProduction = process.env.NODE_ENV === "production";
  const ownerEmail = process.env.FITLOG_OWNER_EMAIL ?? (isProduction ? undefined : "me@example.com");
  const databasePath = process.env.FITLOG_SQLITE_PATH ?? (isProduction ? undefined : "./fitlog.local.db");
  if (!ownerEmail || !databasePath) throw new Error("FITLOG_OWNER_EMAIL and FITLOG_SQLITE_PATH are required in local production mode");
  const repository = createSqliteRepository(databasePath, ownerEmail);
  const owner = { id: "fitlog-owner", email: ownerEmail };
  await runRetention(repository, owner, new Date());
  const mcpServer = createFitlogServer({ mode: "local", localOwner: owner, repositoryFactory: { forOwner: () => repository } });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await mcpServer.connect(transport);
  const httpServer = createServer(async (request, response) => {
    if (request.url?.startsWith("/mcp")) return transport.handleRequest(request, response);
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
  });
  listen(httpServer, "local");
}

async function startCloud(): Promise<void> {
  const publicUrl = required("FITLOG_PUBLIC_URL");
  const allowedEmail = required("FITLOG_ALLOWED_EMAIL");
  const supabaseUrl = required("SUPABASE_URL");
  const publishableKey = required("SUPABASE_PUBLISHABLE_KEY");
  const repositoryFactory = createSupabaseRepositoryFactory({ url: supabaseUrl, publishableKey });
  const mcpServer = createFitlogServer({ mode: "cloud", repositoryFactory });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await mcpServer.connect(transport);
  const consentHtml = readFileSync(new URL("../dist/src/auth/consent.html", import.meta.url), "utf8");
  const httpServer = createServer(createHttpRequestHandler({ publicUrl, supabaseUrl, publishableKey, consentHtml, verifyIdentity: createSupabaseIdentityVerifier({ allowedEmail, url: supabaseUrl, publishableKey }), transport }));
  listen(httpServer, "cloud");
}

function listen(httpServer: ReturnType<typeof createServer>, mode: "local" | "cloud"): void {
  const port = Number(process.env.PORT ?? 3333);
  httpServer.listen(port, () => console.log("FitLog listening on port " + port + " in " + mode + " mode"));
}

const runtime = process.env.FITLOG_RUNTIME ?? "local";
if (runtime === "local") await startLocal();
else if (runtime === "cloud") await startCloud();
else throw new Error("FITLOG_RUNTIME must be local or cloud");
