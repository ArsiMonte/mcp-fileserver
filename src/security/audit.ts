import fs from "node:fs";
import { config } from "../config.js";

export interface AuditEntry {
  timestamp: string;
  tool: string;
  parameters: Record<string, unknown>;
  outcome: "SUCCESS" | "REJECTED" | "ERROR";
  durationMs: number;
  details?: string;
  ip?: string;
}

export function logAudit(entry: AuditEntry): void {
  const line = JSON.stringify(entry) + "\n";
  try {
    fs.appendFileSync(config.auditLogFile, line, "utf8");
  } catch (err) {
    console.error("[AUDIT LOG ERROR] Failed to write audit entry:", err);
  }

  // Also print to console if info or warn
  if (entry.outcome === "REJECTED") {
    console.warn(`[AUDIT SECURITY ALERT] ${entry.tool} REJECTED: ${entry.details || "Unauthorized or escape detected"}`);
  } else if (entry.outcome === "ERROR") {
    console.error(`[AUDIT ERROR] ${entry.tool}: ${entry.details}`);
  } else {
    console.log(`[AUDIT] ${entry.tool} executed successfully (${entry.durationMs}ms)`);
  }
}
