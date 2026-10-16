import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export type HandoffDocType = "PROJECT_STATE" | "PLAN_LOG" | "CHECKPOINTS" | "DECISIONS";

const HANDOFF_FILES: Record<HandoffDocType, string> = {
  PROJECT_STATE: "PROJECT_STATE.md",
  PLAN_LOG: "PLAN_LOG.md",
  CHECKPOINTS: "CHECKPOINTS.md",
  DECISIONS: "DECISIONS.md",
};

export function readHandoff(doc: HandoffDocType | "ALL"): Record<string, string> {
  const result: Record<string, string> = {};

  if (doc === "ALL") {
    for (const [key, filename] of Object.entries(HANDOFF_FILES)) {
      const fullPath = path.join(config.workspaceRoot, filename);
      if (fs.existsSync(fullPath)) {
        result[key] = fs.readFileSync(fullPath, "utf8");
      } else {
        result[key] = `[Document ${filename} does not exist yet]`;
      }
    }
    return result;
  }

  const filename = HANDOFF_FILES[doc];
  if (!filename) {
    throw new Error(`Invalid handoff document type: "${doc}". Must be one of: PROJECT_STATE, PLAN_LOG, CHECKPOINTS, DECISIONS, ALL.`);
  }

  const fullPath = path.join(config.workspaceRoot, filename);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Handoff document "${filename}" was not found in workspace root.`);
  }

  result[doc] = fs.readFileSync(fullPath, "utf8");
  return result;
}

export function updateHandoff(options: {
  doc: HandoffDocType;
  content: string;
  mode?: "append" | "overwrite";
}): { doc: string; status: string; total_length: number } {
  const filename = HANDOFF_FILES[options.doc];
  if (!filename) {
    throw new Error(`Invalid handoff document type: "${options.doc}".`);
  }

  const fullPath = path.join(config.workspaceRoot, filename);
  const mode = options.mode || "append";

  let finalContent: string;
  if (mode === "append" && fs.existsSync(fullPath)) {
    const existing = fs.readFileSync(fullPath, "utf8");
    const separator = existing.endsWith("\n") ? "\n" : "\n\n";
    finalContent = existing + separator + options.content.trim() + "\n";
  } else {
    finalContent = options.content.trim() + "\n";
  }

  fs.writeFileSync(fullPath, finalContent, "utf8");

  return {
    doc: options.doc,
    status: mode === "append" ? "APPENDED" : "OVERWRITTEN",
    total_length: finalContent.length,
  };
}
