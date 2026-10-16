import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { resolveSafePath, SandboxViolationError, getRelativePath } from "../src/security/sandbox.js";

describe("Sandbox Path Enforcer & Escape Protection", () => {
  const testSandbox = path.resolve(process.cwd(), "test_sandbox_root");

  beforeAll(() => {
    if (!fs.existsSync(testSandbox)) {
      fs.mkdirSync(testSandbox, { recursive: true });
    }
    // Create dummy files inside sandbox
    fs.writeFileSync(path.join(testSandbox, "hello.txt"), "sandbox content", "utf8");
    fs.mkdirSync(path.join(testSandbox, "subdir"), { recursive: true });
    fs.writeFileSync(path.join(testSandbox, "subdir", "child.txt"), "child content", "utf8");
  });

  afterAll(() => {
    if (fs.existsSync(testSandbox)) {
      fs.rmSync(testSandbox, { recursive: true, force: true });
    }
  });

  it("should allow reading an existing file inside the sandbox", () => {
    const resolved = resolveSafePath("hello.txt", false, testSandbox);
    expect(resolved).toBe(path.join(testSandbox, "hello.txt"));
  });

  it("should allow nested subdirectories inside the sandbox", () => {
    const resolved = resolveSafePath("subdir/child.txt", false, testSandbox);
    expect(resolved).toBe(path.join(testSandbox, "subdir", "child.txt"));
  });

  it("should reject directory traversal with parent references (../)", () => {
    expect(() => {
      resolveSafePath("../package.json", false, testSandbox);
    }).toThrow(SandboxViolationError);
  });

  it("should reject nested directory traversal climbing outside (subdir/../../outside)", () => {
    expect(() => {
      resolveSafePath("subdir/../../secret.txt", false, testSandbox);
    }).toThrow(SandboxViolationError);
  });

  it("should reject absolute paths outside the sandbox root", () => {
    const outsidePath = process.platform === "win32" ? "C:\\Windows\\System32\\drivers\\etc\\hosts" : "/etc/passwd";
    expect(() => {
      resolveSafePath(outsidePath, false, testSandbox);
    }).toThrow(SandboxViolationError);
  });

  it("should reject null-byte injection attacks", () => {
    expect(() => {
      resolveSafePath("hello.txt\0.exe", false, testSandbox);
    }).toThrow(SandboxViolationError);
  });

  it("should correctly compute relative paths for display", () => {
    const filePath = path.join(testSandbox, "subdir", "child.txt");
    const rel = getRelativePath(filePath, testSandbox);
    expect(rel).toBe("subdir/child.txt");
  });
});
