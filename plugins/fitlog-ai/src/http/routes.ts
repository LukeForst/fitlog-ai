import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { AuthorizationError, type IdentityVerifier } from "../auth/identity.ts";

export interface ProtectedResourceConfig {
  publicUrl: string;
  supabaseUrl: string;
}

export interface McpTransport {
  handleRequest(request: IncomingMessage & { auth?: AuthInfo }, response: ServerResponse): Promise<void>;
}

export interface HttpRequestHandlerConfig extends ProtectedResourceConfig {
  verifyIdentity: IdentityVerifier;
  transport: McpTransport;
}

function publicOrigin(publicUrl: string): string {
  return new URL(publicUrl).origin;
}

export function protectedResourceMetadata(config: ProtectedResourceConfig): Record<string, unknown> {
  const origin = publicOrigin(config.publicUrl);
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [`${new URL(config.supabaseUrl).origin}/auth/v1`],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "email", "profile"]
  };
}

function metadataUrl(config: ProtectedResourceConfig): string {
  return `${publicOrigin(config.publicUrl)}/.well-known/oauth-protected-resource`;
}

function sendJson(response: ServerResponse, status: number, payload: Record<string, unknown>, headers: Record<string, string> = {}): void {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(payload));
}

function bearerToken(request: IncomingMessage): string | undefined {
  const value = request.headers.authorization;
  if (!value) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1]?.trim() || undefined;
}

export function createHttpRequestHandler(config: HttpRequestHandlerConfig): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const challenge = `Bearer resource_metadata="${metadataUrl(config)}"`;
  return async (request, response): Promise<void> => {
    const pathname = new URL(request.url ?? "/", publicOrigin(config.publicUrl)).pathname;
    if (pathname === "/healthz") {
      sendJson(response, 200, { status: "ok" });
      return;
    }
    if (pathname === "/.well-known/oauth-protected-resource") {
      sendJson(response, 200, protectedResourceMetadata(config));
      return;
    }
    if (pathname !== "/mcp") {
      sendJson(response, 404, { error: "not found" });
      return;
    }

    const accessToken = bearerToken(request);
    if (!accessToken) {
      sendJson(response, 401, { error: "authorization required" }, { "www-authenticate": challenge });
      return;
    }
    try {
      const authenticatedRequest = request as IncomingMessage & { auth?: AuthInfo };
      authenticatedRequest.auth = await config.verifyIdentity(accessToken);
      await config.transport.handleRequest(authenticatedRequest, response);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        const headers: Record<string, string> = error.status === 401 ? { "www-authenticate": challenge } : {};
        sendJson(response, error.status, { error: error.status === 401 ? "authorization required" : "forbidden" }, headers);
        return;
      }
      sendJson(response, 500, { error: "service unavailable" });
    }
  };
}
