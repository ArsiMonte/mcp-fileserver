import express from "express";
import cors from "cors";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpServer } from "./server.js";
import { config } from "./config.js";
import { authMiddleware } from "./security/auth.js";

async function main() {
  const args = process.argv.slice(2);
  const useStdio = args.includes("--stdio") || config.transport === "stdio";

  if (useStdio) {
    // Local stdio transport mode (ideal for MCP Inspector or local Claude Desktop / Cursor)
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[MCP FILESERVER] Running on stdio transport. Workspace root:", config.workspaceRoot);
    return;
  }

  // Streamable HTTP (SSE) mode
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health check endpoint (for PM2, reverse proxies, and tunnels)
  app.get("/health", (req, res) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      workspaceRoot: config.workspaceRoot,
      transport: "sse/http",
      authEnabled: Boolean(config.authToken),
    });
  });

  // Track active SSE transports by sessionId
  const transports: Map<string, SSEServerTransport> = new Map();

  // Apply authentication middleware to MCP endpoints
  app.use("/sse", authMiddleware);
  app.use("/messages", authMiddleware);

  // SSE endpoint for streamable connection
  app.get("/sse", async (req, res) => {
    console.log(`[SSE CONNECT] Client connected from ${req.ip || "unknown"}`);
    const transport = new SSEServerTransport("/messages", res);
    const server = createMcpServer();

    const sessionId = transport.sessionId;
    transports.set(sessionId, transport);

    transport.onclose = () => {
      console.log(`[SSE CLOSE] Session ${sessionId} closed`);
      transports.delete(sessionId);
    };

    await server.connect(transport);
  });

  // Messages POST endpoint for incoming JSON-RPC calls
  app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      res.status(400).send("Missing sessionId query parameter");
      return;
    }

    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).send(`Session "${sessionId}" not found or expired`);
      return;
    }

    await transport.handlePostMessage(req, res);
  });

  const serverInstance = app.listen(config.port, config.host, () => {
    console.log(`=======================================================`);
    console.log(`🚀 MCP File-Server Connector is active!`);
    console.log(`📡 URL: http://${config.host}:${config.port}`);
    console.log(`🔒 Workspace Sandbox: ${config.workspaceRoot}`);
    console.log(`🔑 Token Auth: ${config.authToken ? "ENABLED (Bearer token required)" : "DISABLED"}`);
    console.log(`🚦 Endpoints:`);
    console.log(`   - SSE Stream:   GET  http://${config.host}:${config.port}/sse`);
    console.log(`   - Messages:     POST http://${config.host}:${config.port}/messages?sessionId=...`);
    console.log(`   - Health Check: GET  http://${config.host}:${config.port}/health`);
    console.log(`=======================================================`);
  });

  // Graceful shutdown handling for PM2 and OS signals
  const shutdown = () => {
    console.log("\n[SHUTDOWN] Terminating MCP File-Server cleanly...");
    serverInstance.close(() => {
      console.log("[SHUTDOWN] Server stopped. Goodbye!");
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[FATAL ERROR] Server failed to start:", err);
  process.exit(1);
});
