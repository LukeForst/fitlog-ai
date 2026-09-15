import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FitLogRepository } from "../storage/repository.ts";
import { registerFitlogTools } from "./tools.ts";

export interface FitlogServerOptions {
  ownerEmail: string;
  repository: FitLogRepository;
}

export function createFitlogServer(options: FitlogServerOptions): McpServer {
  const server = new McpServer({ name: "fitlog-ai", version: "0.1.0" });
  registerFitlogTools(server, options);
  server.registerResource(
    "fitlog-dashboard",
    "ui://fitlog/dashboard",
    { mimeType: "text/html", description: "FitLog 健身仪表盘" },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: "text/html",
        text: "<main><h1>FitLog AI</h1><p>仪表盘将在这里显示。</p></main>"
      }]
    })
  );
  return server;
}
