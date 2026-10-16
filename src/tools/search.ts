import fs from "node:fs";
import path from "node:path";
import { resolveSafePath, getRelativePath } from "../security/sandbox.js";
import { config } from "../config.js";

export interface SearchCodeOptions {
  query: string;
  path?: string;
  is_regex?: boolean;
  case_sensitive?: boolean;
  max_results?: number;
}

export interface MatchOccurrence {
  file: string;
  line: number;
  content: string;
}

export function searchCode(options: SearchCodeOptions): {
  query: string;
  total_matches: number;
  matches: MatchOccurrence[];
} {
  const reqPath = options.path || ".";
  const targetDir = resolveSafePath(reqPath, false);
  const maxResults = options.max_results || 50;

  let regex: RegExp;
  if (options.is_regex) {
    regex = new RegExp(options.query, options.case_sensitive ? "g" : "gi");
  } else {
    // Escape literal string for regex
    const escaped = options.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    regex = new RegExp(escaped, options.case_sensitive ? "g" : "gi");
  }

  const matches: MatchOccurrence[] = [];

  function searchInDirectory(dir: string) {
    if (matches.length >= maxResults) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (matches.length >= maxResults) break;

      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          searchInDirectory(fullPath);
        } else if (entry.isFile()) {
          // Avoid scanning binary or excessively large files (>2MB)
          const stat = fs.statSync(fullPath);
          if (stat.size > 2 * 1024 * 1024) continue;

          const content = fs.readFileSync(fullPath, "utf8");
          const lines = content.split(/\r?\n/);

          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= maxResults) break;
            const line = lines[i];
            regex.lastIndex = 0;
            if (regex.test(line)) {
              matches.push({
                file: getRelativePath(fullPath),
                line: i + 1,
                content: line.trim(),
              });
            }
          }
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  const stat = fs.statSync(targetDir);
  if (stat.isDirectory()) {
    searchInDirectory(targetDir);
  } else {
    // Single file search
    const content = fs.readFileSync(targetDir, "utf8");
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (matches.length >= maxResults) break;
      const line = lines[i];
      regex.lastIndex = 0;
      if (regex.test(line)) {
        matches.push({
          file: getRelativePath(targetDir),
          line: i + 1,
          content: line.trim(),
        });
      }
    }
  }

  return {
    query: options.query,
    total_matches: matches.length,
    matches,
  };
}

export interface RepoMapOptions {
  path?: string;
  depth?: number;
}

export function repoMap(options: RepoMapOptions = {}): { root: string; tree: string } {
  const reqPath = options.path || ".";
  const targetDir = resolveSafePath(reqPath, false);
  const maxDepth = options.depth || 4;

  const lines: string[] = [getRelativePath(targetDir) || "."];

  function buildTree(dir: string, prefix: string, currentDepth: number) {
    if (currentDepth > maxDepth) return;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "dist")
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });
    } catch {
      return;
    }

    entries.forEach((entry, index) => {
      const isLast = index === entries.length - 1;
      const pointer = isLast ? "└── " : "├── ";
      lines.push(`${prefix}${pointer}${entry.name}${entry.isDirectory() ? "/" : ""}`);

      if (entry.isDirectory()) {
        const nextPrefix = prefix + (isLast ? "    " : "│   ");
        buildTree(path.join(dir, entry.name), nextPrefix, currentDepth + 1);
      }
    });
  }

  buildTree(targetDir, "", 1);

  return {
    root: getRelativePath(targetDir),
    tree: lines.join("\n"),
  };
}
