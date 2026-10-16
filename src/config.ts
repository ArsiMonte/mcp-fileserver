import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";

// Load environment variables from .env if present
dotenv.config();

export interface ServerConfig {
  port: number;
  host: string;
  transport: "http" | "stdio";
  workspaceRoot: string;
  authToken?: string;
  logLevel: "debug" | "info" | "warn" | "error";
  auditLogFile: string;
}

const rawWorkspace = process.env.WORKSPACE_ROOT || "./workspace";
const resolvedWorkspace = path.resolve(process.cwd(), rawWorkspace);

// Ensure workspace directory exists
if (!fs.existsSync(resolvedWorkspace)) {
  fs.mkdirSync(resolvedWorkspace, { recursive: true });
}

// Ensure logs directory exists
const rawAuditLog = process.env.AUDIT_LOG_FILE || "./logs/audit.log";
const resolvedAuditLog = path.resolve(process.cwd(), rawAuditLog);
const auditLogDir = path.dirname(resolvedAuditLog);
if (!fs.existsSync(auditLogDir)) {
  fs.mkdirSync(auditLogDir, { recursive: true });
}

export const config: ServerConfig = {
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "0.0.0.0",
  transport: (process.env.TRANSPORT === "stdio" ? "stdio" : "http"),
  workspaceRoot: resolvedWorkspace,
  authToken: process.env.AUTH_TOKEN || undefined,
  logLevel: (process.env.LOG_LEVEL as ServerConfig["logLevel"]) || "info",
  auditLogFile: resolvedAuditLog,
};
