# GPT-5 Agent Runbook

## Read
- Use `repo.list_files` + `repo.read_file` (via router) to collect context.
- Prefer targeted reads; avoid scanning `node_modules`, `dist`, `.git`, build artifacts.

## Plan
Return a JSON PLAN like:

```
{
  "plan_id": "<opaque>",
  "branch": "feat/<slug>",
  "commit_message": "<imperative summary>",
  "changes": [
    { "path": "...", "action": "create|edit|delete", "summary": "…" }
  ],
  "tests_to_run": ["pytest -q"],
  "docs_to_update": ["README.md"],
  "e2e_suites": []
}
```

Then call the relevant tool with `dry_run=true` so the router returns a server-side `plan_id` and diff preview.

## Execute
- Wait for user to run `confirm(plan_id)`.
- After apply: call `tests.run(format="json")`; fix-iterate if needed.
- On success: call `vcs.propose(summary, branch_base)` to create branch+commit and open (or prepare) a PR.

## Report
- Post a brief summary:
  - What, why, how (1–3 bullets)
  - Diff summary (per file)
  - Test results (pass/fail counts)
  - Links to artifacts (reports, screenshots)

