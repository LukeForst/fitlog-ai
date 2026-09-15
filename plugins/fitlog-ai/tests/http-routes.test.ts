import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createHttpRequestHandler, protectedResourceMetadata } from "../src/http/routes.ts";
import { createIdentityVerifier } from "../src/auth/identity.ts";

async function withServer(handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>, run: (url: string) => Promise<void>): Promise<void> {
  const server = createServer((request, response) => void handler(request, response));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("publishes protected-resource metadata for the canonical MCP URL", () => {
  assert.deepEqual(protectedResourceMetadata({
    publicUrl: "https://fitlog.example",
    supabaseUrl: "https://dxgsfassloqunvvubkgu.supabase.co"
  }), {
    resource: "https://fitlog.example/mcp",
    authorization_servers: ["https://dxgsfassloqunvvubkgu.supabase.co/auth/v1"],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "email", "profile"]
  });
});

test("challenges unauthenticated MCP requests with protected-resource metadata", async () => {
  const handler = createHttpRequestHandler({
    publicUrl: "https://fitlog.example",
    supabaseUrl: "https://dxgsfassloqunvvubkgu.supabase.co",
    verifyIdentity: createIdentityVerifier({ allowedEmail: "me@example.com", getUser: async () => null }),
    transport: { handleRequest: async (_request, response) => response.end() }
  });

  await withServer(handler, async (url) => {
    const response = await fetch(`${url}/mcp`);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("www-authenticate"), 'Bearer resource_metadata="https://fitlog.example/.well-known/oauth-protected-resource"');
  });
});

test("serves health and protected-resource metadata without authentication", async () => {
  const handler = createHttpRequestHandler({
    publicUrl: "https://fitlog.example",
    supabaseUrl: "https://dxgsfassloqunvvubkgu.supabase.co",
    verifyIdentity: createIdentityVerifier({ allowedEmail: "me@example.com", getUser: async () => null }),
    transport: { handleRequest: async (_request, response) => response.end() }
  });

  await withServer(handler, async (url) => {
    const health = await fetch(`${url}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
    const metadata = await fetch(`${url}/.well-known/oauth-protected-resource`);
    assert.equal(metadata.status, 200);
    assert.equal((await metadata.json()).resource, "https://fitlog.example/mcp");
  });
});
