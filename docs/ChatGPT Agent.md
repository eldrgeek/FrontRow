awesome — here are clean, copy-pasteable blocks you can drop into **Cursor** to turn GPT-5 into a mostly-autonomous coding agent using your MCP servers (via FrontRow as the “tool router”). I’m giving you:

1.  three small **.cursor/rules/** files to shape the agent’s behavior
    
2.  a **Supervisor prompt** you can paste when you kick off a task
    
3.  **Tool contracts (JSON schemas)** the agent will rely on (so your MCP servers can match them)
    
4.  a 30-second **Cursor wiring checklist** (placeholders where needed)
    

----------

# 1) .cursor/rules/00-gpt5-agent-contract.md

md

CopyEdit

``# GPT-5 Coding Agent — Contract  ## Goals  - Generate/modify code, generate tests, write docs, manage repo, and propose PRs. - Operate via MCP tools exposed by “FrontRow Tool Router” (the only tool surface). - Always follow **plan → confirm → execute** for any mutation. ## Tool Surface (high-level)  - repo.apply_changes(files|patch, dry_run?) - tests.run(scope?, format=json) - docs.write(paths[], contents[]) - vcs.propose(summary, branch_base?)
- e2e.run(suite?)    # optional if Playwright MCP is available
- artifact.put/get/list  # for reports and screenshots
- confirm(plan_id)   # execute a previously returned plan ## Golden Loop 1) Understand task → read codebase context (non-mutating).
2) Produce a PLAN (files to change, tests to run, branch name, commit message).
3) Request user approval via a `dry_run` call; wait for `confirm(plan_id)` before executing.
4) Apply changes, run tests; iterate fixes until tests pass or budget is reached.
5) Propose PR (never push to protected branches directly).
6) Summarize what changed, link artifacts. ## Guardrails  - Never write outside the repo root; never follow symlinks upward. - Max 20 files and 2,000 changed lines per plan unless user raises the cap. - No force-push; merges only via PRs. - Redact secrets; don’t print .env values. - Stop on 2 consecutive failing test iterations and ask for guidance. ## Outputs  - Always show a **concise diff summary** (filenames + +/- line counts). - For failures, return **structured** test errors (file:line, test name, short traceback).`` 

----------

# 2) .cursor/rules/01-gpt5-runbook.md

md

CopyEdit

``# GPT-5 Agent Runbook  ## Read  - Use `repo.list_files` + `repo.read_file` (via router) to collect context. - Prefer targeted reads; avoid scanning node_modules, dist, .git, build artifacts.

## Plan
Return a JSON PLAN like:
{
  "plan_id": "<opaque>",
  "branch": "feat/<slug>",
  "commit_message": "<imperative  summary>",
  "changes": [{"path": "...", "action": "create|edit|delete", "summary": "…"}],
  "tests_to_run": ["pytest -q"],   // or a narrowed path list
  "docs_to_update": ["README.md"],
  "e2e_suites": []
}

Then call the relevant tool with `dry_run=true` so the router returns a server-side `plan_id` and diff preview. ## Execute  - Wait for user to run `confirm(plan_id)`. - After apply: call `tests.run(format="json")`; fix-iterate if needed. - On success: call `vcs.propose(summary, branch_base)` to create branch+commit and open (or prepare) a PR. ## Report  - Post a brief summary: - What, why, how (1–3 bullets) - Diff summary (per file) - Test results (pass/fail counts) - Links to artifacts (reports, screenshots)`` 

----------

# 3) .cursor/rules/02-gpt5-guardrails.md

md

CopyEdit

``# Guardrails  - File scope: only paths under the active workspace root. Ignore: .git, node_modules, .venv, dist, build, coverage, tmp.
- Security: never echo secrets; if a file appears to contain secrets, do not print content.
- Budgets: max_changes=20 files; max_lines=2000; max_test_runtime=10m; max_e2e_runtime=10m.
- Git: only create new branches; no direct commits to protected branches; never use force flags.
- Confirmation: any mutating tool call MUST be preceded by a dry-run plan and an explicit `confirm(plan_id)`.`` 

----------

# 4) “Supervisor” prompt (paste this into Cursor when you start a task)

text

CopyEdit

`You are the GPT-5 Coding Agent operating through the FrontRow Tool Router (MCP).
Task: <your task here>

Constraints:
- Follow plan → confirm → execute.
- Keep changes small and iterative.
- Use tests.run (pytest JSON) to verify.
- Propose a PR; do not push to protected branches.

Deliverables:
- A PLAN for approval (branch name, commit msg, files + reasons).
- After execution: diff summary, test results, artifact links, and PR details.` 

----------

# 5) Tool contracts (JSON I/O the MCP router should expose)

> These are the shapes the agent will expect. Keep names and fields as below so the rules match your servers. Your FrontRow router can fan out to your existing MCP servers behind the scenes.

jsonc

CopyEdit

`// repo.apply_changes
{
  "name": "repo.apply_changes",
  "input": {
    "files": [
      { "path": "src/x.ts", "content": "<full new content>" }
    ],
    "patch": "optional unified diff string",
    "dry_run": true
  },
  "output": {
    "plan_id": "abc123",
    "diff_summary": [
      { "path": "src/x.ts", "added": 42, "removed": 10 }
    ],
    "notes": "any validations/formatting applied"
  }
}` 

jsonc

CopyEdit

`// confirm (execute a dry-run plan)
{
  "name": "confirm",
  "input": { "plan_id": "abc123" },
  "output": {
    "status": "applied",
    "commit": { "branch": "feat/foo", "sha": "deadbeef" },
    "diff_summary": [
      { "path": "src/x.ts", "added": 42, "removed": 10 }
    ]
  }
}` 

jsonc

CopyEdit

`// tests.run (pytest wrapper)
{
  "name": "tests.run",
  "input": {
    "scope": ["tests/unit", "pkg/module/test_api.py::TestFoo::test_bar"],
    "format": "json",
    "timeout_sec": 600
  },
  "output": {
    "summary": { "passed": 18, "failed": 2, "skipped": 1, "duration_sec": 41.2 },
    "failures": [
      {
        "test": "tests/unit/test_api.py::test_bar",
        "file": "tests/unit/test_api.py",
        "line": 42,
        "message": "AssertionError: expected 200, got 500",
        "trace": "short traceback…"
      }
    ],
    "artifacts": [
      { "name": "pytest-report.json", "id": "art_001", "mime": "application/json" }
    ]
  }
}` 

js

CopyEdit

`// docs.write
{
  "name": "docs.write",
  "input": {
    "paths": ["README.md", "docs/feature-x.md"],
    "contents": ["# README\\n…", "# Feature X\\n…"],
    "dry_run": true
  },
  "output": {
    "plan_id": "plan_docs_7",
    "diff_summary": [
      { "path": "README.md", "added": 12, "removed": 0 }
    ],
    "lint": { "errors": 0, "warnings": 1 }
  }
}` 

jsonc

CopyEdit

`// vcs.propose (create branch + commit; optionally open PR)
{
  "name": "vcs.propose",
  "input": {
    "summary": "feat: add user search with tests",
    "branch_base": "main",
    "open_pr": true
  },
  "output": {
    "branch": "feat/user-search",
    "commit_sha": "abc123",
    "pr": { "number": 27, "url": "https://…/pull/27", "status": "opened" }
  }
}` 

json

CopyEdit

`// e2e.run (Playwright)
{
  "name": "e2e.run",
  "input": { "suite": "smoke", "timeout_sec": 600, "headless": true },
  "output": {
    "summary": { "passed": 12, "failed": 1, "duration_sec": 95.0 },
    "failures": [
      { "name": "checkout flow", "step": "click Pay", "screenshot": "art_101" }
    ],
    "artifacts": [
      { "name": "video-checkout.webm", "id": "art_102", "mime": "video/webm" }
    ]
  }
}` 

jsonc

CopyEdit

`// artifact.put/get/list  (simple blob store)
{
  "name": "artifact.put",
  "input": { "name": "pytest-report.json", "bytes_b64": "<...>", "mime": "application/json" },
  "output": { "id": "art_001" }
}` 

----------

# 6) Cursor wiring checklist (30 seconds)

1.  **Add the rules**  
    Create the three files above under your repo:
    
    -   `.cursor/rules/00-gpt5-agent-contract.md`
        
    -   `.cursor/rules/01-gpt5-runbook.md`
        
    -   `.cursor/rules/02-gpt5-guardrails.md`
        
2.  **Expose one MCP endpoint in Cursor**
    
    -   In Cursor, open **Settings → MCP**.
        
    -   Add a **single tool source** called **FrontRow Tool Router**.
        
        -   If local/desktop-bridged: point it at your FrontRow WS/HTTP bridge (e.g., `ws://localhost:8787` or `http://localhost:8787/mcp`).
            
        -   If hosted later: change this URL to your Render deployment (e.g., `wss://frontrow.yourdomain/mcp`).
            
3.  **Back the router with your existing MCP servers**
    
    -   The router fans out to: File I/O MCP, Git MCP (read + new safe write ops), Pytest MCP, Playwright MCP, Artifact MCP.
        
    -   Ensure each implements the **JSON contracts** above (names + fields).
        
4.  **Kick off a run in Cursor**
    
    -   Paste the **Supervisor prompt**.
        
    -   The agent should enumerate tools, propose a **PLAN** with `dry_run`, wait for your `confirm(plan_id)`, then execute, test, and propose a PR.
        

----------

## Notes / gotchas

-   Start with **no `git_push`**; keep `vcs.propose(open_pr=true)` so everything flows through PRs.
    
-   Make sure the Pytest wrapper emits **JSON**, not only text — it dramatically improves the agent’s fix loop.
    
-   Cap file counts and line changes in the router; return a “budget exceeded” error if the plan is too big.
    
-   For Playwright on desktop, you’re good; for hosted later, bundle browsers or use a browser service.
    
-   Always return **diff summaries**; they’re lightweight and perfect for quick approvals in chat.
    

If you want, next I can give you **example agent–tool dialogues** (request/response pairs) so you can test the end-to-end flow in Cursor without writing any new code first.
