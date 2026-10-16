import { describe, it, expect, vi } from "vitest";
import { authMiddleware } from "../src/security/auth.js";
import { config } from "../src/config.js";

describe("Token Authentication Middleware", () => {
  it("should allow /health check without token", () => {
    const req: any = { path: "/health", headers: {} };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("should reject requests when token is missing", () => {
    // Ensure config has token set
    const originalToken = config.authToken;
    config.authToken = "secret-token-123";

    const req: any = {
      path: "/sse",
      headers: {},
      query: {},
      socket: { remoteAddress: "127.0.0.1" },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();

    config.authToken = originalToken;
  });

  it("should accept valid Bearer token", () => {
    const originalToken = config.authToken;
    config.authToken = "secret-token-123";

    const req: any = {
      path: "/sse",
      headers: { authorization: "Bearer secret-token-123" },
      query: {},
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();

    config.authToken = originalToken;
  });

  it("should accept valid X-MCP-Token header", () => {
    const originalToken = config.authToken;
    config.authToken = "secret-token-123";

    const req: any = {
      path: "/sse",
      headers: { "x-mcp-token": "secret-token-123" },
      query: {},
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();

    config.authToken = originalToken;
  });
});
