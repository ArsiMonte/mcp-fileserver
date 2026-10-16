# Sandboxed MCP File-Server Connector

> A production-grade Model Context Protocol (MCP) server providing safe, sandboxed filesystem access, a multi-agent handoff protocol, optimistic concurrency locks, and Git-Lite primitives over Streamable HTTP and stdio transports.

[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-Official-orange.svg)](https://modelcontextprotocol.io/)
[![Process Manager](https://img.shields.io/badge/PM2-Supported-brightgreen.svg)](https://pm2.keymetrics.io/)
[![Tests](https://img.shields.io/badge/Vitest-Passing-success.svg)](https://vitest.dev/)

---

## 🌟 Overview & Architecture

The **MCP File-Server Connector** functions as the persistent shared memory for AI agents collaborating across multiple sessions. It strictly isolates all filesystem actions inside a defined `WORKSPACE_ROOT` sandbox, rejecting directory escapes and symlink vulnerabilities.

```
                           +---------------------------+
                           |     AI Agent Client       |
                           |  (Cursor / Claude / LLM)  |
                           +-------------+-------------+
                                         |
                       [ HTTPS Tunnel / ngrok / Cloudflare ]
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                               MCP File Server                                   |
|                                                                                 |
|  +-------------------------+   +----------------------+   +------------------+  |
|  |   Bearer / Token Auth   |-->|   Streamable HTTP    |-->|   JSON-RPC       |  |
|  |     Security Gate       |   |   (SSE / Express)    |   |   Dispatcher     |  |
|  +-------------------------+   +----------------------+   +------------------+  |
|                                                                      |          |
|  +-------------------------------------------------------------------+-------+  |
|  |                           Tool Handlers (12 Tools)                        |  |
|  |  • list_files     • read_file     • write_file    • str_replace           |  |
|  |  • delete_file    • search_code   • repo_map      • git_status            |  |
|  |  • git_diff       • git_commit    • read_handoff  • update_handoff        |  |
|  +-------------------------------------------------------------------+-------+  |
|                                         |                                       |
|  +--------------------------------------v------------------------------------+  |
|  |                   Security Sandbox & Canonicalization                     |  |
|  |  • Boundary Enforcer   • Path Traversal Rejector   • Symlink Realpath     |  |
|  |  • Null-byte Guard     • Optimistic Version Locks  • Audit Logger         |  |
|  +---------------------------------------------------------------------------+  |
|                                         |                                       |
|                                         v                                       |
|             +-------------------------------------------------------+           |
|             |             Sandboxed Workspace Root                  |           |
|             |  [ PROJECT_STATE.md | PLAN_LOG.md | CHECKPOINTS.md ]  |           |
|             +-------------------------------------------------------+           |
+---------------------------------------------------------------------------------+
```

---

## 🚀 Key Features

1. **Sandboxed Workspace Enforcement**:
   - Every file operation is strictly jail-checked against `WORKSPACE_ROOT`.
   - Prohibits directory traversal (`../`), null-byte injections, root escapes (`C:\Windows`, `/etc/passwd`), and symlink attacks.
2. **12 Comprehensive MCP Tools**:
   - **Core File Operations**: `list_files`, `read_file`, `write_file`, `str_replace`, `delete_file`.
   - **Optimistic Concurrency**: `if_version` SHA-256 hash checking prevents accidental race conditions.
   - **Search & Exploration**: `search_code` (regex/case sensitive) and `repo_map` (ASCII directory tree).
   - **Git-Lite Integration**: `git_status`, `git_diff`, and `git_commit` executed inside the sandbox.
   - **Multi-Agent Handoff Protocol**: `read_handoff` and `update_handoff` for cross-session memory.
3. **Dual Transports**:
   - **Streamable HTTP (SSE)**: For remote clients connecting via HTTPS tunnels.
   - **stdio**: For local testing with Claude Desktop, Cursor, or MCP Inspector.
4. **Endpoint Security**:
   - Bearer token / `X-MCP-Token` header validation on public endpoints.
   - Structured JSON audit logging (`logs/audit.log`) for all tool invocations and security alerts.
5. **Process Manager & High Availability**:
   - Pre-configured `ecosystem.config.cjs` for **PM2** ensuring auto-restart on crashes and reboot persistence.

---

## 📋 Prerequisites

- **Node.js**: v18.0.0 or later (v20+ recommended, tested on v24.x)
- **npm**: v9.0.0 or later
- **Git**: Installed on host machine
- *(Optional for remote access)*: `ngrok` or `cloudflared` for HTTPS tunneling
- *(Optional for process management)*: `pm2` (`npm install -g pm2`)

---

## ⚙️ Quick Start Installation

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/<YOUR_USERNAME>/mcp-fileserver.git
cd mcp-fileserver
npm install
```

### 2. Configure Environment Variables
Copy the template configuration:
```bash
cp .env.example .env
```
Edit `.env` as desired:
```ini
PORT=3000
HOST=0.0.0.0
TRANSPORT=http
WORKSPACE_ROOT=./workspace
AUTH_TOKEN=your-secure-mcp-token-here
LOG_LEVEL=info
AUDIT_LOG_FILE=./logs/audit.log
```

### 3. Build the Project
```bash
npm run build
```

---

## 🖥️ Running the Server

### Mode A: Streamable HTTP (Default - for Remote / Tunneling)
```bash
npm run start:http
```
Output:
```
=======================================================
🚀 MCP File-Server Connector is active!
📡 URL: http://0.0.0.0:3000
🔒 Workspace Sandbox: C:\...\mcp-fileserver\workspace
🔑 Token Auth: ENABLED (Bearer token required)
🚦 Endpoints:
   - SSE Stream:   GET  http://0.0.0.0:3000/sse
   - Messages:     POST http://0.0.0.0:3000/messages?sessionId=...
   - Health Check: GET  http://0.0.0.0:3000/health
=======================================================
```

### Mode B: stdio (For Local MCP Clients / Inspector)
```bash
npm run start:stdio
```

### Mode C: Production with PM2 (Survives Restarts)
```bash
# Install PM2 globally if not already installed
npm install -g pm2

# Start the daemon
npm run pm2:start

# View live status and logs
npm run pm2:logs

# Save PM2 process list to resurrect on machine reboot
pm2 save
```

---

## 🌐 Exposing Over HTTPS Tunnel

To connect AI agents over the public internet, expose the local port using an HTTPS tunnel:

### Option 1: ngrok
```bash
npm run tunnel:ngrok
# or: ngrok http 3000
```
Grab the forwarded HTTPS URL (e.g. `https://xyz-abc.ngrok-free.app`).

### Option 2: Cloudflare Tunnel (cloudflared)
```bash
npm run tunnel:cloudflared
# or: cloudflared tunnel --url http://localhost:3000
```

---

## 🔌 Connecting MCP Clients

### 1. Connecting via MCP Inspector (Testing & Debugging)
```bash
npx @modelcontextprotocol/inspector node dist/index.js --stdio
```

### 2. Connecting Claude Desktop
Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "fileserver": {
      "command": "node",
      "args": ["C:/Users/Acer/projects/mcp-fileserver/dist/index.js", "--stdio"],
      "env": {
        "WORKSPACE_ROOT": "C:/Users/Acer/projects/mcp-fileserver/workspace"
      }
    }
  }
}
```

### 3. Connecting via Streamable HTTP (Remote Agent / Cursor)
- **SSE URL:** `https://<YOUR_TUNNEL_URL>/sse`
- **Headers:** `Authorization: Bearer <AUTH_TOKEN>` or `X-MCP-Token: <AUTH_TOKEN>`

---

## 🛠️ Tool Catalog Reference

| Tool Name | Parameters | Description |
| :--- | :--- | :--- |
| `list_files` | `path`, `recursive`, `include_hidden` | Lists files/directories strictly confined to sandbox. |
| `read_file` | `path`, `start_line`, `end_line` | Reads file content with line numbers and version hash. |
| `write_file` | `path`, `content`, `if_version`, `create_dirs` | Writes file with optional optimistic concurrency version check. |
| `str_replace` | `path`, `old_str`, `new_str`, `allow_multiple` | Exact substring replacement with uniqueness validation. |
| `delete_file` | `path`, `confirm` | Gated deletion of individual files; directories are protected. |
| `search_code` | `query`, `path`, `is_regex`, `case_sensitive` | Fast multi-file search inside sandbox with line matches. |
| `repo_map` | `path`, `depth` | Generates hierarchical ASCII directory layout tree. |
| `git_status` | `path` | Checks git branch, modified files, and staged status. |
| `git_diff` | `path`, `staged` | Inspects working tree diffs or staged diffs. |
| `git_commit` | `message`, `files` | Stages files safely and creates a git commit. |
| `read_handoff` | `doc` | Reads `PROJECT_STATE`, `PLAN_LOG`, `CHECKPOINTS`, or `DECISIONS`. |
| `update_handoff` | `doc`, `content`, `mode` | Appends or updates protocol handoff state across sessions. |

---

## 🤝 Multi-Agent Handoff Protocol

The workspace root includes 4 standardized protocol files for multi-agent coordination:

1. **`PROJECT_STATE.md`**: High-level system state, current objectives, and active session tags.
2. **`PLAN_LOG.md`**: Step-by-step checklist of tasks in progress, completed, or deferred.
3. **`CHECKPOINTS.md`**: Milestone sign-offs and verification criteria.
4. **`DECISIONS.md`**: Architectural Decision Records (ADR) capturing rationale and trade-offs.

---

## 🧪 Automated Testing

Run the Vitest test suite to verify sandbox boundary enforcement, path traversal rejection, tool operations, and token auth:

```bash
npm run test
```

Expected output:
```
✓ tests/sandbox.test.ts (7 tests)
✓ tests/tools.test.ts (8 tests)
✓ tests/auth.test.ts (4 tests)

Test Files  3 passed (3)
Tests       19 passed (19)
```

---

## 📄 Documentation & Architecture Report

For in-depth explanations on:
- Technology stack selection and trade-off justifications
- Security architecture, STRIDE threat model, and sandbox escape mitigations
- Step-by-step verification and multi-agent workflow walkthrough

See [DOCUMENTATION.md](./DOCUMENTATION.md).
