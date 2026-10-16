import path from "node:path";
import fs from "node:fs";
import { config } from "../config.js";

export class SandboxViolationError extends Error {
  constructor(public requestedPath: string, message: string) {
    super(`[SANDBOX VIOLATION] Access Denied: ${message} (Path: "${requestedPath}")`);
    this.name = "SandboxViolationError";
  }
}

/**
 * Resolves and strictly validates that any given path stays within the workspace sandbox root.
 * 
 * @param relativeOrAbsolutePath The path requested by the client
 * @param allowNonExistent Whether the target path is allowed to not exist yet (e.g. for write_file)
 * @returns Canonical, verified safe absolute path
 * @throws SandboxViolationError if the path escapes the sandbox root
 */
export function resolveSafePath(
  relativeOrAbsolutePath: string,
  allowNonExistent: boolean = false,
  customRoot?: string
): string {
  if (!relativeOrAbsolutePath || typeof relativeOrAbsolutePath !== "string") {
    throw new SandboxViolationError(String(relativeOrAbsolutePath), "Path must be a non-empty string");
  }

  // Null byte injection check
  if (relativeOrAbsolutePath.includes("\0")) {
    throw new SandboxViolationError(relativeOrAbsolutePath, "Null byte injection detected");
  }

  const root = customRoot ? path.resolve(customRoot) : config.workspaceRoot;
  const normalizedRoot = path.normalize(root);

  // If path is absolute, check if it starts with the root; if relative, resolve from root
  let targetPath: string;
  if (path.isAbsolute(relativeOrAbsolutePath)) {
    targetPath = path.normalize(relativeOrAbsolutePath);
  } else {
    targetPath = path.normalize(path.resolve(normalizedRoot, relativeOrAbsolutePath));
  }

  // Windows case-insensitive comparison helper
  const isWindows = process.platform === "win32";
  const rootCompare = isWindows ? normalizedRoot.toLowerCase() : normalizedRoot;
  const targetCompare = isWindows ? targetPath.toLowerCase() : targetPath;

  // Verify target path starts with root directory
  // Note: root + path.sep ensures `/workspace-other` cannot match `/workspace`
  const rootWithSep = rootCompare.endsWith(path.sep) ? rootCompare : rootCompare + path.sep;
  const isExactRoot = targetCompare === rootCompare;
  const isInsideRoot = targetCompare.startsWith(rootWithSep);

  if (!isExactRoot && !isInsideRoot) {
    throw new SandboxViolationError(
      relativeOrAbsolutePath,
      `Path escapes sandboxed workspace root "${normalizedRoot}"`
    );
  }

  // Symlink escape check
  if (fs.existsSync(targetPath)) {
    const realTarget = fs.realpathSync(targetPath);
    const realCompare = isWindows ? realTarget.toLowerCase() : realTarget;
    if (realCompare !== rootCompare && !realCompare.startsWith(rootWithSep)) {
      throw new SandboxViolationError(
        relativeOrAbsolutePath,
        `Symlink resolves outside the sandboxed workspace (Real target: "${realTarget}")`
      );
    }
    return realTarget;
  }

  if (!allowNonExistent) {
    throw new Error(`Path does not exist: "${relativeOrAbsolutePath}"`);
  }

  // If the path doesn't exist yet, check its closest existing parent directory for symlinks
  let parent = path.dirname(targetPath);
  while (parent && parent !== path.dirname(parent)) {
    if (fs.existsSync(parent)) {
      const realParent = fs.realpathSync(parent);
      const realParentCompare = isWindows ? realParent.toLowerCase() : realParent;
      if (realParentCompare !== rootCompare && !realParentCompare.startsWith(rootWithSep)) {
        throw new SandboxViolationError(
          relativeOrAbsolutePath,
          `Parent directory resolves outside sandbox via symlink: "${realParent}"`
        );
      }
      break;
    }
    parent = path.dirname(parent);
  }

  return targetPath;
}

/**
 * Returns the relative path from the workspace root for clean display/logging.
 */
export function getRelativePath(absolutePath: string, customRoot?: string): string {
  const root = customRoot || config.workspaceRoot;
  const rel = path.relative(root, absolutePath);
  return rel === "" ? "." : rel.replace(/\\/g, "/");
}
