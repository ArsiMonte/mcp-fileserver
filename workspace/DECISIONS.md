# DECISIONS LOG (ADR)

## Architectural Decision Records

### ADR-001: Adoption of Sandboxed MCP Fileserver Architecture
- **Date:** 2026-10-16
- **Status:** ACCEPTED
- **Context:** Multiple AI agents need synchronized filesystem access without risking host system integrity.
- **Decision:** Mandate a canonicalized path verification sandbox where every relative or absolute path is jail-checked against `WORKSPACE_ROOT`.
- **Consequences:** Any path escaping the boundary (e.g. `../` or symlink redirection) throws an immediate security rejection.

### ADR-002: Four-File Handoff Protocol
- **Date:** 2026-10-16
- **Status:** ACCEPTED
- **Context:** Agent context windows are ephemeral; distinct sessions must reconstruct state without prompt loss.
- **Decision:** Standardize on 4 Markdown files: `PROJECT_STATE.md`, `PLAN_LOG.md`, `CHECKPOINTS.md`, and `DECISIONS.md`.
