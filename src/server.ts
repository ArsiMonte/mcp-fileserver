import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  listFiles,
  readFile,
  writeFile,
  strReplace,
  deleteFile,
} from "./tools/files.js";
import { searchCode, repoMap } from "./tools/search.js";
import { gitStatus, gitDiff, gitCommit } from "./tools/git.js";
import { readHandoff, updateHandoff, HandoffDocType } from "./tools/handoff.js";
import { logAudit } from "./security/audit.js";
import { SandboxViolationError } from "./security/sandbox.js";

export const TOOLS: Tool[] = [
  {
    name: "list_files",
    description: "List files and directories in the sandboxed workspace. Enforces root confinement.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative directory path within sandbox root (default: '.')",
        },
        recursive: {
          type: "boolean",
          description: "Whether to scan subdirectories recursively (default: false)",
        },
        include_hidden: {
          type: "boolean",
          description: "Whether to include hidden files starting with . (default: false)",
        },
      },
    },
  },
  {
    name: "read_file",
    description: "Read content of a file within the sandbox root with optional line range selection.",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: {
        path: {
          type: "string",
          description: "Relative file path within workspace root",
        },
        start_line: {
          type: "number",
          description: "1-based starting line number (optional)",
        },
        end_line: {
          type: "number",
          description: "1-based ending line number (optional)",
        },
      },
    },
  },
  {
    name: "write_file",
    description: "Write or overwrite a file within the sandbox root. Supports optimistic concurrency via if_version lock.",
    inputSchema: {
      type: "object",
      required: ["path", "content"],
      properties: {
        path: {
          type: "string",
          description: "Relative file path within workspace root",
        },
        content: {
          type: "string",
          description: "Full text content to write into the file",
        },
        if_version: {
          type: "string",
          description: "Optional SHA-256 version hash from previous read. Write will fail if modified concurrently.",
        },
        create_dirs: {
          type: "boolean",
          description: "Automatically create intermediate directories if missing (default: true)",
        },
      },
    },
  },
  {
    name: "str_replace",
    description: "Perform precise in-place string replacement in a sandboxed file. Rejects ambiguous multiple matches unless permitted.",
    inputSchema: {
      type: "object",
      required: ["path", "old_str", "new_str"],
      properties: {
        path: {
          type: "string",
          description: "Relative file path within workspace root",
        },
        old_str: {
          type: "string",
          description: "The exact substring to replace",
        },
        new_str: {
          type: "string",
          description: "The new replacement substring",
        },
        allow_multiple: {
          type: "boolean",
          description: "Set to true to replace all matches instead of strictly expecting a unique occurrence (default: false)",
        },
      },
    },
  },
  {
    name: "delete_file",
    description: "Gated file deletion inside the sandbox. Requires explicit confirmation and cannot delete directories.",
    inputSchema: {
      type: "object",
      required: ["path", "confirm"],
      properties: {
        path: {
          type: "string",
          description: "Relative file path to delete",
        },
        confirm: {
          type: "boolean",
          description: "Must be true to confirm deliberate deletion",
        },
      },
    },
  },
  {
    name: "search_code",
    description: "Search text or regular expressions across files in the sandbox workspace, with line numbers.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "Search string or regex pattern",
        },
        path: {
          type: "string",
          description: "Relative directory or file to search in (default: '.')",
        },
        is_regex: {
          type: "boolean",
          description: "Treat query as a regular expression (default: false)",
        },
        case_sensitive: {
          type: "boolean",
          description: "Match exact case (default: false)",
        },
        max_results: {
          type: "number",
          description: "Max matching lines to return (default: 50)",
        },
      },
    },
  },
  {
    name: "repo_map",
    description: "Generate a visual directory tree structure of the sandboxed workspace (Stretch Goal).",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative directory path (default: '.')",
        },
        depth: {
          type: "number",
          description: "Maximum depth of directory recursion (default: 4)",
        },
      },
    },
  },
  {
    name: "git_status",
    description: "Get current git status and modified files in the workspace (Git-Lite).",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Target repository path within sandbox (default: '.')",
        },
      },
    },
  },
  {
    name: "git_diff",
    description: "View git diff for working tree changes or staged changes in workspace (Git-Lite).",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Target repository path within sandbox (default: '.')",
        },
        staged: {
          type: "boolean",
          description: "Show staged changes instead of unstaged changes (default: false)",
        },
      },
    },
  },
  {
    name: "git_commit",
    description: "Stage changes and create a git commit in the sandboxed workspace (Git-Lite).",
    inputSchema: {
      type: "object",
      required: ["message"],
      properties: {
        message: {
          type: "string",
          description: "Git commit message",
        },
        files: {
          type: "array",
          items: { type: "string" },
          description: "Specific relative file paths to stage (default: stage all modified files)",
        },
      },
    },
  },
  {
    name: "read_handoff",
    description: "Read multi-agent handoff documentation: PROJECT_STATE, PLAN_LOG, CHECKPOINTS, or DECISIONS.",
    inputSchema: {
      type: "object",
      required: ["doc"],
      properties: {
        doc: {
          type: "string",
          enum: ["PROJECT_STATE", "PLAN_LOG", "CHECKPOINTS", "DECISIONS", "ALL"],
          description: "The handoff document to retrieve",
        },
      },
    },
  },
  {
    name: "update_handoff",
    description: "Update or append notes to the multi-agent handoff files for cross-session persistence.",
    inputSchema: {
      type: "object",
      required: ["doc", "content"],
      properties: {
        doc: {
          type: "string",
          enum: ["PROJECT_STATE", "PLAN_LOG", "CHECKPOINTS", "DECISIONS"],
          description: "Target handoff document",
        },
        content: {
          type: "string",
          description: "Markdown content to append or overwrite",
        },
        mode: {
          type: "string",
          enum: ["append", "overwrite"],
          description: "Whether to append to the bottom or overwrite the file (default: 'append')",
        },
      },
    },
  },
];

export function createMcpServer(): Server {
  const server = new Server(
    {
      name: "mcp-fileserver",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const startTime = Date.now();
    const args = rawArgs || {};

    try {
      let resultData: unknown;

      switch (name) {
        case "list_files": {
          resultData = listFiles(args as any);
          break;
        }
        case "read_file": {
          resultData = readFile(args as any);
          break;
        }
        case "write_file": {
          resultData = writeFile(args as any);
          break;
        }
        case "str_replace": {
          resultData = strReplace(args as any);
          break;
        }
        case "delete_file": {
          resultData = deleteFile(args as any);
          break;
        }
        case "search_code": {
          resultData = searchCode(args as any);
          break;
        }
        case "repo_map": {
          resultData = repoMap(args as any);
          break;
        }
        case "git_status": {
          resultData = gitStatus((args as any).path);
          break;
        }
        case "git_diff": {
          resultData = gitDiff(args as any);
          break;
        }
        case "git_commit": {
          resultData = gitCommit(args as any);
          break;
        }
        case "read_handoff": {
          resultData = readHandoff((args as any).doc);
          break;
        }
        case "update_handoff": {
          resultData = updateHandoff(args as any);
          break;
        }
        default:
          throw new Error(`Unknown tool requested: "${name}"`);
      }

      const durationMs = Date.now() - startTime;
      logAudit({
        timestamp: new Date().toISOString(),
        tool: name,
        parameters: args,
        outcome: "SUCCESS",
        durationMs,
      });

      return {
        content: [
          {
            type: "text",
            text: typeof resultData === "string" ? resultData : JSON.stringify(resultData, null, 2),
          },
        ],
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const isSandboxViolation = err instanceof SandboxViolationError;

      logAudit({
        timestamp: new Date().toISOString(),
        tool: name,
        parameters: args,
        outcome: isSandboxViolation ? "REJECTED" : "ERROR",
        durationMs,
        details: err.message,
      });

      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `[TOOL ERROR] ${err.message}`,
          },
        ],
      };
    }
  });

  return server;
}
