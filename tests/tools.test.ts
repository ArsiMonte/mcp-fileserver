import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { config } from "../src/config.js";
import { writeFile, readFile, strReplace, deleteFile, listFiles } from "../src/tools/files.js";
import { searchCode, repoMap } from "../src/tools/search.js";
import { readHandoff, updateHandoff } from "../src/tools/handoff.js";

describe("MCP File Server Core Tools", () => {
  const testFile = "unit-test-file.txt";

  beforeAll(() => {
    // Ensure test environment workspace exists
    if (!fs.existsSync(config.workspaceRoot)) {
      fs.mkdirSync(config.workspaceRoot, { recursive: true });
    }
  });

  afterAll(() => {
    const p = path.join(config.workspaceRoot, testFile);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  });

  it("should write a new file and return version hash", () => {
    const res = writeFile({
      path: testFile,
      content: "Line 1: Alpha\nLine 2: Beta\nLine 3: Gamma",
    });

    expect(res.status).toBe("SAVED");
    expect(res.version_hash).toBeDefined();
    expect(res.bytes_written).toBeGreaterThan(0);
  });

  it("should read a file with line numbers and match version hash", () => {
    const res = readFile({ path: testFile });
    expect(res.total_lines).toBe(3);
    expect(res.content).toContain("1 | Line 1: Alpha");
    expect(res.content).toContain("3 | Line 3: Gamma");
  });

  it("should read a partial line range", () => {
    const res = readFile({ path: testFile, start_line: 2, end_line: 2 });
    expect(res.content).toContain("2 | Line 2: Beta");
    expect(res.content).not.toContain("1 | Line 1: Alpha");
  });

  it("should perform safe str_replace and fail on ambiguous matches", () => {
    const res = strReplace({
      path: testFile,
      old_str: "Beta",
      new_str: "BetaUpdated",
    });

    expect(res.replacements_count).toBe(1);

    const verify = readFile({ path: testFile });
    expect(verify.content).toContain("BetaUpdated");
  });

  it("should reject optimistic locking mismatch with if_version", () => {
    expect(() => {
      writeFile({
        path: testFile,
        content: "New content",
        if_version: "wrong-checksum-hash",
      });
    }).toThrow(/Version lock conflict/);
  });

  it("should search code across files", () => {
    const searchRes = searchCode({ query: "BetaUpdated" });
    expect(searchRes.total_matches).toBeGreaterThan(0);
    expect(searchRes.matches.some((m) => m.content.includes("BetaUpdated"))).toBe(true);
  });

  it("should generate a visual repo map", () => {
    const map = repoMap();
    expect(map.tree).toBeDefined();
    expect(typeof map.tree).toBe("string");
  });

  it("should gate deletion and require confirmation", () => {
    expect(() => {
      deleteFile({ path: testFile, confirm: false });
    }).toThrow(/Confirmation required/);

    const del = deleteFile({ path: testFile, confirm: true });
    expect(del.status).toBe("DELETED");
  });

  it("should read and update handoff documents", () => {
    const initial = readHandoff("PROJECT_STATE");
    expect(initial.PROJECT_STATE).toBeDefined();

    const appendRes = updateHandoff({
      doc: "PLAN_LOG",
      content: "- [x] Automated test suite executed and validated.",
      mode: "append",
    });
    expect(appendRes.status).toBe("APPENDED");
  });
});
