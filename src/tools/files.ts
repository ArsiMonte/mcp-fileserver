import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolveSafePath, getRelativePath } from "../security/sandbox.js";

export interface ListFilesOptions {
  path?: string;
  recursive?: boolean;
  include_hidden?: boolean;
}

export interface FileItemInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: string;
}

export function listFiles(options: ListFilesOptions = {}): { root: string; total: number; files: FileItemInfo[] } {
  const reqPath = options.path || ".";
  const targetDir = resolveSafePath(reqPath, false);

  const stat = fs.statSync(targetDir);
  if (!stat.isDirectory()) {
    throw new Error(`Target path "${reqPath}" is a file, not a directory.`);
  }

  const results: FileItemInfo[] = [];

  function scan(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!options.include_hidden && entry.name.startsWith(".")) {
        continue;
      }
      if (entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      try {
        const itemStat = fs.statSync(fullPath);
        const relPath = getRelativePath(fullPath);

        results.push({
          name: entry.name,
          path: relPath,
          isDirectory: entry.isDirectory(),
          size: entry.isDirectory() ? 0 : itemStat.size,
          modified: itemStat.mtime.toISOString(),
        });

        if (entry.isDirectory() && options.recursive) {
          scan(fullPath);
        }
      } catch {
        // Skip inaccessible entries
      }
    }
  }

  scan(targetDir);
  return {
    root: getRelativePath(targetDir),
    total: results.length,
    files: results,
  };
}

export interface ReadFileOptions {
  path: string;
  start_line?: number;
  end_line?: number;
}

export function readFile(options: ReadFileOptions): {
  path: string;
  total_lines: number;
  start_line: number;
  end_line: number;
  version_hash: string;
  content: string;
} {
  const fullPath = resolveSafePath(options.path, false);
  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    throw new Error(`Cannot read directory "${options.path}" as a file. Use list_files instead.`);
  }

  const content = fs.readFileSync(fullPath, "utf8");
  const versionHash = crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
  const lines = content.split(/\r?\n/);
  const totalLines = lines.length;

  let start = options.start_line && options.start_line > 0 ? options.start_line : 1;
  let end = options.end_line && options.end_line <= totalLines ? options.end_line : totalLines;

  if (start > totalLines) {
    start = totalLines;
  }
  if (end < start) {
    end = start;
  }

  const selectedLines = lines.slice(start - 1, end);
  const formattedContent = selectedLines.map((line, idx) => `${start + idx} | ${line}`).join("\n");

  return {
    path: getRelativePath(fullPath),
    total_lines: totalLines,
    start_line: start,
    end_line: end,
    version_hash: versionHash,
    content: formattedContent,
  };
}

export interface WriteFileOptions {
  path: string;
  content: string;
  if_version?: string;
  create_dirs?: boolean;
}

export function writeFile(options: WriteFileOptions): {
  path: string;
  bytes_written: number;
  version_hash: string;
  status: string;
} {
  const fullPath = resolveSafePath(options.path, true);

  if (fs.existsSync(fullPath)) {
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      throw new Error(`Target "${options.path}" is an existing directory; cannot overwrite with file content.`);
    }

    if (options.if_version) {
      const current = fs.readFileSync(fullPath, "utf8");
      const currentHash = crypto.createHash("sha256").update(current).digest("hex").slice(0, 16);
      if (currentHash !== options.if_version) {
        throw new Error(
          `Version lock conflict! Current version "${currentHash}" does not match requested if_version "${options.if_version}". Reload file before writing.`
        );
      }
    }
  } else if (options.create_dirs !== false) {
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
  }

  fs.writeFileSync(fullPath, options.content, "utf8");
  const newHash = crypto.createHash("sha256").update(options.content).digest("hex").slice(0, 16);

  return {
    path: getRelativePath(fullPath),
    bytes_written: Buffer.byteLength(options.content, "utf8"),
    version_hash: newHash,
    status: "SAVED",
  };
}

export interface StrReplaceOptions {
  path: string;
  old_str: string;
  new_str: string;
  allow_multiple?: boolean;
}

export function strReplace(options: StrReplaceOptions): {
  path: string;
  replacements_count: number;
  new_version_hash: string;
} {
  const fullPath = resolveSafePath(options.path, false);
  const current = fs.readFileSync(fullPath, "utf8");

  if (!current.includes(options.old_str)) {
    throw new Error(`Target text to replace was not found in "${options.path}". Ensure exact spacing and case match.`);
  }

  const occurrences = current.split(options.old_str).length - 1;
  if (occurrences > 1 && !options.allow_multiple) {
    throw new Error(
      `Found ${occurrences} occurrences of target string in "${options.path}". Provide more surrounding context lines or set allow_multiple: true.`
    );
  }

  const updated = options.allow_multiple
    ? current.replaceAll(options.old_str, options.new_str)
    : current.replace(options.old_str, options.new_str);

  fs.writeFileSync(fullPath, updated, "utf8");
  const newHash = crypto.createHash("sha256").update(updated).digest("hex").slice(0, 16);

  return {
    path: getRelativePath(fullPath),
    replacements_count: occurrences > 1 && !options.allow_multiple ? 1 : occurrences,
    new_version_hash: newHash,
  };
}

export interface DeleteFileOptions {
  path: string;
  confirm: boolean;
}

export function deleteFile(options: DeleteFileOptions): {
  path: string;
  status: string;
} {
  if (!options.confirm) {
    throw new Error(`Confirmation required to delete file "${options.path}". Pass confirm: true.`);
  }

  const fullPath = resolveSafePath(options.path, false);
  const stat = fs.statSync(fullPath);

  if (stat.isDirectory()) {
    throw new Error(
      `Refusing to delete directory "${options.path}". delete_file only operates on individual files for safety.`
    );
  }

  fs.unlinkSync(fullPath);
  return {
    path: getRelativePath(fullPath),
    status: "DELETED",
  };
}
