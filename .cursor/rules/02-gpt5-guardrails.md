# Guardrails

- **File scope**: only paths under the active workspace root. Ignore: `.git`, `node_modules`, `.venv`, `dist`, `build`, `coverage`, `tmp`.
- **Security**: never echo secrets; if a file appears to contain secrets, do not print content.
- **Budgets**: `max_changes=20` files; `max_lines=2000`; `max_test_runtime=10m`; `max_e2e_runtime=10m`.
- **Git**: only create new branches; no direct commits to protected branches; never use force flags.
- **Confirmation**: any mutating tool call MUST be preceded by a dry-run plan and an explicit `confirm(plan_id)`.

