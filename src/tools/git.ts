import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveSafePath } from "../security/sandbox.js";
import { config } from "../config.js";

function ensureGitRepo(targetDir: string): void {
  const gitDir = path.join(targetDir, ".git");
  if (!fs.existsSync(gitDir)) {
    // If workspace is not yet a git repo, initialize it automatically for git-lite support
    try {
      execSync("git init", { cwd: targetDir, stdio: "pipe" });
    } catch {
      throw new Error(`Directory "${targetDir}" is not a git repository and git init failed.`);
    }
  }
}

export function gitStatus(targetPath?: string): { branch: string; status_output: string; is_clean: boolean } {
  const resolved = resolveSafePath(targetPath || ".", false);
  const targetDir = fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
  ensureGitRepo(targetDir);

  try {
    const branch = execSync("git branch --show-current", { cwd: targetDir, encoding: "utf8" }).trim() || "HEAD";
    const status = execSync("git status --short", { cwd: targetDir, encoding: "utf8" }).trim();

    return {
      branch,
      status_output: status || "Working tree clean",
      is_clean: status.length === 0,
    };
  } catch (err: any) {
    throw new Error(`Git status failed: ${err.message}`);
  }
}

export function gitDiff(options: { staged?: boolean; path?: string } = {}): { diff: string } {
  const resolved = resolveSafePath(options.path || ".", false);
  const targetDir = fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
  ensureGitRepo(targetDir);

  const cmd = options.staged ? "git diff --staged" : "git diff";
  try {
    const diff = execSync(cmd, { cwd: targetDir, encoding: "utf8" });
    return {
      diff: diff.trim() || "No changes detected",
    };
  } catch (err: any) {
    throw new Error(`Git diff failed: ${err.message}`);
  }
}

export function gitCommit(options: { message: string; files?: string[] }): {
  commit_hash: string;
  summary: string;
} {
  const targetDir = config.workspaceRoot;
  ensureGitRepo(targetDir);

  if (!options.message || options.message.trim().length === 0) {
    throw new Error("Commit message cannot be empty.");
  }

  try {
    if (options.files && options.files.length > 0) {
      for (const file of options.files) {
        // Resolve safe path to ensure files to stage are within sandbox
        const safe = resolveSafePath(file, false);
        execSync(`git add "${safe}"`, { cwd: targetDir, stdio: "pipe" });
      }
    } else {
      execSync("git add -A", { cwd: targetDir, stdio: "pipe" });
    }

    // Configure fallback author if not set in git host
    try {
      execSync("git config user.name", { cwd: targetDir, stdio: "pipe" });
    } catch {
      execSync('git config user.name "MCP FileServer Agent"', { cwd: targetDir, stdio: "pipe" });
      execSync('git config user.email "agent@mcp-fileserver.local"', { cwd: targetDir, stdio: "pipe" });
    }

    const output = execSync(`git commit -m "${options.message.replace(/"/g, '\\"')}"`, {
      cwd: targetDir,
      encoding: "utf8",
    });

    const commitHash = execSync("git rev-parse --short HEAD", { cwd: targetDir, encoding: "utf8" }).trim();

    return {
      commit_hash: commitHash,
      summary: output.trim(),
    };
  } catch (err: any) {
    throw new Error(`Git commit failed: ${err.message}`);
  }
}
