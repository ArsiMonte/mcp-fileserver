import { Request, Response, NextFunction } from "express";
import { config } from "../config.js";
import { logAudit } from "./audit.js";

/**
 * Authentication middleware for HTTP/SSE endpoints.
 * Validates either 'Authorization: Bearer <token>' or 'X-MCP-Token: <token>'.
 * If AUTH_TOKEN is not configured in environment, it logs a warning but allows traffic for local dev.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // If no auth token is required by configuration, pass through
  if (!config.authToken) {
    return next();
  }

  // Health check endpoint is public for uptime monitoring
  if (req.path === "/health") {
    return next();
  }

  const authHeader = req.headers.authorization;
  const customHeader = req.headers["x-mcp-token"] as string | undefined;

  let providedToken: string | undefined;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    providedToken = authHeader.slice(7).trim();
  } else if (customHeader) {
    providedToken = customHeader.trim();
  } else if (typeof req.query.token === "string") {
    // Also allow token in query param for SSE EventSource connections in browsers
    providedToken = req.query.token;
  }

  if (!providedToken || providedToken !== config.authToken) {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    logAudit({
      timestamp: new Date().toISOString(),
      tool: "HTTP_AUTH_GATE",
      parameters: { path: req.path, method: req.method },
      outcome: "REJECTED",
      durationMs: 0,
      details: "Missing or invalid authorization token",
      ip,
    });

    res.status(401).json({
      error: "Unauthorized",
      message: "Valid Bearer token or X-MCP-Token header required to access this MCP server endpoint."
    });
    return;
  }

  next();
}
