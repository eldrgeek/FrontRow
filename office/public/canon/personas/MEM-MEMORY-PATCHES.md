# Pending patches to agent MEMORY (apply on next session with access)

The cowork sandbox cannot write to `~/Library/Application Support/Claude/local-agent-mode-sessions/.../agent/memory/` (protected by macOS). The two updates below need to be applied by a session that has access to that path (e.g., a Claude Code CLI session, or via the consolidate-memory skill from a permitted surface).

---

## 1. Add to `reference_specialists.md` — under inner specialists

```
- **Mem** — archivist. The canonical-source-of-truth for SRMW and anything else Mike has written that the team should know about. Consult Mem when you need to know what Mike actually wrote/thought, or how Mike's voice handles a register. Persona: `~/Projects/SOMA/personas/mem.md`. Catalog: `~/Projects/SOMA/canon/INDEX.md`.
```

## 2. Add to `MEMORY.md` — pointer entry

```
- Mem (archivist specialist) — `~/Projects/SOMA/personas/mem.md`. Holds Mike's writings as living canon. Index at `~/Projects/SOMA/canon/INDEX.md`. Created 2026-05-03 alongside the SRMW canon-pull task.
```

---

*Created 2026-05-03 by Dee during Mem bootstrap. Delete this file once both patches are applied to the agent memory store.*
