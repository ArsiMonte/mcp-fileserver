# Project Report: Sandboxed MCP File-Server Connector

**Course:** CS 3A / CS 3B Elective: Model Context Protocol (MCP)  
**Deliverable:** Technical Report & Architectural Documentation  
**Repository:** [https://github.com/ArsiMonte/mcp-fileserver](https://github.com/ArsiMonte/mcp-fileserver)  
**Author:** ArsiMonte  

---

## 1. Executive Summary & Problem Brief

In autonomous multi-agent software engineering, AI agents are constrained by finite context windows, stateless runtime sessions, and security risks when accessing host systems. When multiple sequential agents collaborate, state drift and inadvertent file clobbering frequently occur.

This project implements a production-grade, sandboxed **Model Context Protocol (MCP) File-Server Connector**. It acts as persistent shared memory for AI agents, guaranteeing that all read, write, search, and git operations remain strictly jailed within a designated `WORKSPACE_ROOT`. Furthermore, it introduces an optimistic concurrency lock (`if_version`), a 4-file handoff protocol, token-gated public endpoints, and process persistence via PM2.

```
+---------------------------------------------------------------------------------+
|                                 MCP Client                                      |
|                       (Cursor / Claude Desktop / Agent)                         |
+---------------------------------------+-----------------------------------------+
                                        |
                 [ HTTPS Tunnel (ngrok/cloudflared) + Bearer Token ]
                                        |
                                        v
+---------------------------------------------------------------------------------+
|                       MCP File-Server Connector (Port 3000)                     |
|                                                                                 |
|  +-------------------------+  +-----------------------+  +-------------------+  |
|  |     Token Auth Gate     |  |    Streamable HTTP    |  |     stdio Mode    |  |
|  |  (Bearer / X-MCP-Token) |  |   (Express + SSE)     |  |   (Local Testing) |  |
|  +-------------------------+  +-----------------------+  +-------------------+  |
|                                           |                                     |
|  +----------------------------------------v----------------------------------+  |
|  |                        12 Registered MCP Tools                            |  |
|  |  list_files | read_file | write_file | str_replace | delete_file          |  |
|  |  search_code | repo_map | git_status | git_diff | git_commit              |  |
|  |  read_handoff | update_handoff                                            |  |
|  +---------------------------------------------------------------------------+  |
|                                           |                                     |
|  +----------------------------------------v----------------------------------+  |
|  |                       Sandbox Security Engine                             |  |
|  |  • Path Normalizer & Canonicalizer    • Symlink Realpath Verifier         |  |
|  |  • Null-Byte Rejector                 • Audit Logger (logs/audit.log)     |  |
|  +---------------------------------------------------------------------------+  |
|                                           |                                     |
|                                           v                                     |
|  +---------------------------------------------------------------------------+  |
|  |                      Sandboxed Workspace Root                             |  |
|  |  PROJECT_STATE.md | PLAN_LOG.md | CHECKPOINTS.md | DECISIONS.md           |  |
|  +---------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------+
```

---

## 2. Tech Stack & Architectural Justifications (Rubric Criterion D)

The tech stack was selected to satisfy the **Exemplary** criteria of Rubric II:

| Layer | Selection | Alternatives | Justification & Architectural Trade-offs |
| :--- | :--- | :--- | :--- |
| **Runtime** | **Node.js (v24 LTS) + TypeScript** | Python, Go | Asynchronous, event-driven I/O ideal for streaming Server-Sent Events (SSE). TypeScript ensures strict compile-time validation for tool schemas matching the official specification. |
| **SDK** | **`@modelcontextprotocol/sdk`** | FastMCP, Python SDK | Official reference implementation ensuring 100% protocol compliance (JSON-RPC 2.0 framing, capability negotiation, error handling). |
| **Transport** | **Streamable HTTP (SSE) & stdio** | stdio only, WebSockets | Stdio enables zero-config local testing with Claude Desktop/Cursor; Streamable HTTP (SSE) allows remote agents to interact over HTTPS tunnels. |
| **Validation** | **Zod Schemas** | Raw JSON Schema | Zod provides end-to-end type safety, deriving TypeScript types and JSON-RPC parameter schemas from a single source of truth. |
| **Process Manager** | **PM2 (`ecosystem.config.cjs`)** | Docker, Systemd | Cross-platform process supervisor providing auto-restart on unhandled errors, memory monitoring (`300M` max), log rotation, and server reboot resilience. |
| **Tunneling** | **ngrok / Cloudflare Tunnel** | Direct Port Forward | Exposes local endpoints over TLS/HTTPS with DDoS protection, eliminating the risks of opening raw router ports. |

### Configuration & Secret Isolation
All sensitive variables (`PORT`, `AUTH_TOKEN`, `WORKSPACE_ROOT`, `AUDIT_LOG_FILE`) are managed exclusively via environment variables (`.env`). The `.env` file is excluded in `.gitignore` to prevent secret leakage, while `.env.example` documents the required schema.

---

## 3. Security Architecture & Sandboxing (Rubric Criterion E)

### 3.1 Sandbox Path Confinement
The core security layer ([`src/security/sandbox.ts`](file:///C:/Users/Acer/projects/mcp-fileserver/src/security/sandbox.ts)) prevents agents from accessing host files:
1. **Null-Byte Injection Defense:** Immediately detects and rejects strings containing `\0`.
2. **Canonical Path Normalization:** Resolves relative and absolute paths against `path.resolve(WORKSPACE_ROOT)`.
3. **Boundary Enclosure:** Verifies that the resolved path is either identical to the workspace root or begins with `${WORKSPACE_ROOT}${path.sep}`. Attacks using directory traversal (e.g. `../../etc/passwd` or `workspace_fake/`) trigger a `SandboxViolationError`.
4. **Symlink Traversal Check:** Uses `fs.realpathSync` on existing files and ancestor directories to block symlinks pointing to targets outside the jail.

### 3.2 Endpoint Token Authentication
Public endpoints (`/sse` and `/messages`) are gated by Express middleware ([`src/security/auth.ts`](file:///C:/Users/Acer/projects/mcp-fileserver/src/security/auth.ts)). Clients must provide a valid `AUTH_TOKEN` via:
- `Authorization: Bearer <AUTH_TOKEN>`
- `X-MCP-Token: <AUTH_TOKEN>`
- `?token=<AUTH_TOKEN>` (for browser EventSource connections)

Unauthenticated requests receive `401 Unauthorized` and generate a security alert entry in the audit log. The `/health` endpoint remains accessible without authentication for uptime monitors.

### 3.3 Gated Destructive Actions & Audit Logging
- **Deletion Guard:** `delete_file` is strictly restricted to individual files (directory deletion is blocked) and requires an explicit `confirm: true` parameter.
- **Audit Trail:** Every tool execution is recorded in structured JSON format in `logs/audit.log` (timestamp, tool name, sanitized parameters, latency, outcome: `SUCCESS`, `REJECTED`, or `ERROR`).

---

## 4. Tool Design Choices & Concurrency Control

The connector registers **12 specialized tools** divided into four logical domains:

### 4.1 Core File Operations & Optimistic Locking
- `list_files`: Non-escaping directory scanner with recursive options and ignore filters (`node_modules`, `.git`).
- `read_file`: Line-range slicing (`start_line`, `end_line`) with line numbering and SHA-256 version hash generation.
- `write_file`: File creation/update with parent directory creation and **`if_version` optimistic concurrency locking**. If an agent provides an outdated version hash, the write is aborted, preventing clobbering in multi-agent runs.
- `str_replace`: In-place string replacement requiring exact substring matches and enforcing uniqueness unless `allow_multiple: true` is explicitly passed.
- `delete_file`: Gated removal of target files.

### 4.2 Search & Discovery (Stretch Features)
- `search_code`: Multi-file regex/string search across the workspace with line-by-line matches.
- `repo_map`: Generates an ASCII visual tree of directory structure to accelerate agent onboarding.

### 4.3 Git-Lite Tools
- `git_status`: Displays branch status and modified/untracked files.
- `git_diff`: Inspects unstaged or staged changes within the workspace.
- `git_commit`: Stages modified files and creates standard git commits signed by the agent.

---

## 5. Multi-Agent Handoff Protocol

To solve context loss between independent agent sessions, the server integrates a 4-file handoff protocol located in `workspace/`:

1. **`PROJECT_STATE.md`**: Tracks overarching project vision, active sprint milestones, and current session ID.
2. **`PLAN_LOG.md`**: Chronological checklist of pending and completed tasks.
3. **`CHECKPOINTS.md`**: Verification gates and sign-offs required before concluding a session.
4. **`DECISIONS.md`**: Architectural Decision Records (ADRs) documenting technical rationale.

Agents interact with this system via `read_handoff` (retrieving individual docs or `ALL`) and `update_handoff` (safely appending notes or updating state).

---

## 6. Testing

<!-- 
========================================================================
STUDENT NOTE / INSTRUCTION:
Place your test transcripts, screenshots, and multi-agent verification 
evidence in this section.
========================================================================
-->

### 6.1 Automated Test Suite Results (Vitest)
All 20 automated unit and security tests pass:
- **Sandbox Boundary Tests (7 tests):** Directory climbing (`../`), absolute host paths, null bytes, and subfolder jail escapes.
- **Endpoint Security Tests (4 tests):** Public health check bypass, missing token rejection (HTTP 401), and valid token authentication.
- **Tool Operation Tests (9 tests):** File reads/writes, optimistic version lock rejections, `str_replace`, gated deletions, and handoff protocols.

```text
✓ tests/sandbox.test.ts (7 tests)
✓ tests/auth.test.ts (4 tests)
✓ tests/tools.test.ts (9 tests)

Test Files  3 passed (3)
Tests       20 passed (20)
Duration    4.03s
```

### 6.2 Interactive MCP Inspector Verification
*(Insert your MCP Inspector tool execution logs or screenshot here)*

### 6.3 Multi-Agent Session Task Transcript
*(Insert your multi-agent session transcript demonstrating Session 1 creating a feature and Session 2 verifying it via the handoff protocol here)*

---

## 7. Production Deployment & Recovery (PM2)

The server is configured for automated recovery using PM2 via [`ecosystem.config.cjs`](file:///C:/Users/Acer/projects/mcp-fileserver/ecosystem.config.cjs):
- **Crash Recovery:** `autorestart: true` automatically revives the server upon unexpected termination.
- **Resource Management:** `max_memory_restart: '300M'` prevents process leaks.
- **Persistent Startup:** `pm2 save` persists the process table across machine reboots.
- **Health Verification:** Monitored continuously via `GET /health`.
