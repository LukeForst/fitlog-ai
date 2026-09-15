import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import { registerFitlogTools, type FitlogToolDependencies } from "./tools.ts";

export type FitlogServerOptions = FitlogToolDependencies;

export function createFitlogServer(options: FitlogServerOptions): McpServer {
  const server = new McpServer({ name: "fitlog-ai", version: "0.1.0" });
  registerFitlogTools(server, options);
  const dashboardHtml = readFileSync(new URL("../ui/index.html", import.meta.url), "utf8");
  server.registerResource(
    "fitlog-dashboard",
    "ui://fitlog/dashboard",
    { mimeType: "text/html;profile=mcp-app", description: "FitLog 健身仪表盘" },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: "text/html;profile=mcp-app",
        text: dashboardHtml
      }]
    })
  );
  return server;
}
