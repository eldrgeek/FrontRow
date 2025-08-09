#!/usr/bin/env python3
"""
FrontRow Tool Router (MCP)
==========================

Minimal MCP router exposing high-level tools expected by the GPT-5 agent rules.

Implements/stubs the following tool contracts (see docs/ChatGPT Agent.md):
- repo.apply_changes (supports dry_run and confirm via in-process plan store)
- confirm (applies previously dry-run plans)
- tests.run (best-effort pytest runner; JSON-ish summary)
- docs.write (maps to repo.apply_changes)
- vcs.propose (stub returning a branch name; does not push)
- artifact.put/get/list (local filesystem store under .frontrow_artifacts)
- e2e.run (stub placeholder)

Use --stdio for Cursor integration or HTTP mode for debugging.
"""


import os
import sys
import json
import base64
import time
import uuid
import shlex
import shutil
import difflib
import logging
import argparse
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Tuple

from fastmcp import FastMCP


# ----------------------------------------------------------------------------
# Logging
# ----------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(os.path.expanduser("~/mcp_tool_router.log")),
        logging.StreamHandler(sys.stderr),
    ],
)
logger = logging.getLogger("mcp_tool_router")


# ----------------------------------------------------------------------------
# Configuration and guardrails
# ----------------------------------------------------------------------------
WORKSPACE_ROOT = Path(os.getcwd()).resolve()
ARTIFACT_DIR = WORKSPACE_ROOT / ".frontrow_artifacts"
ARTIFACT_DIR.mkdir(exist_ok=True)

IGNORED_PREFIXES = {
    ".git" , "node_modules", ".venv", "dist", "build", "coverage", "tmp",
}

MAX_FILES_PER_PLAN = int(os.environ.get("FR_MAX_FILES_PER_PLAN", "20"))
MAX_LINES_PER_PLAN = int(os.environ.get("FR_MAX_LINES_PER_PLAN", "2000"))
TEST_TIMEOUT_SEC = int(os.environ.get("FR_MAX_TEST_RUNTIME_SEC", "600"))


# ----------------------------------------------------------------------------
# In-memory plan store (confirm flow)
# ----------------------------------------------------------------------------
@dataclass
class PlannedChange:
    path: str
    content: str


@dataclass
class Plan:
    plan_id: str
    changes: list[PlannedChange] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)


class PlanStore:
    def __init__(self) -> None:
        self._plans: dict[str, Plan] = {}

    def create(self, changes: list[Tuple[str, str]]) -> Plan:
        plan_id = uuid.uuid4().hex[:12]
        plan = Plan(plan_id=plan_id, changes=[PlannedChange(p, c) for p, c in changes])
        self._plans[plan_id] = plan
        return plan

    def get(self, plan_id: str) -> Plan | None:
        return self._plans.get(plan_id)

    def pop(self, plan_id: str) -> Plan | None:
        return self._plans.pop(plan_id, None)


plan_store = PlanStore()


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------
def is_path_allowed(rel_path: str) -> bool:
    if rel_path.startswith("/"):
        return False
    parts = Path(rel_path).parts
    if not parts:
        return False
    return parts[0] not in IGNORED_PREFIXES


def resolve_path_safe(rel_path: str) -> Path:
    if not is_path_allowed(rel_path):
        raise ValueError(f"Path not allowed by guardrails: {rel_path}")
    abs_path = (WORKSPACE_ROOT / rel_path).resolve()
    if not str(abs_path).startswith(str(WORKSPACE_ROOT)):
        raise ValueError("Attempted to write outside the workspace root")
    return abs_path


def compute_diff_summary(old: str, new: str) -> Tuple[int, int]:
    added = 0
    removed = 0
    diff = difflib.unified_diff(
        old.splitlines(keepends=False),
        new.splitlines(keepends=False),
        lineterm="",
    )
    for line in diff:
        if line.startswith("+++") or line.startswith("---") or line.startswith("@@"):
            continue
        if line.startswith("+"):
            added += 1
        elif line.startswith("-"):
            removed += 1
    return added, removed


def write_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def run_command(cmd: list[str], timeout: int) -> Tuple[int, str, str]:
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        out, err = proc.communicate(timeout=timeout)
        return proc.returncode, out, err
    except subprocess.TimeoutExpired:
        proc.kill()
        return 124, "", f"Timeout after {timeout}s"


# ----------------------------------------------------------------------------
# MCP Server
# ----------------------------------------------------------------------------
mcp = FastMCP("FrontRow Tool Router v0.1")


@mcp.tool(name="router.health")
def router_health() -> dict[str, Any]:
    """Basic health check for the router."""
    try:
        tool_names = sorted([t.name for t in mcp._tool_manager.list_tools()])  # type: ignore[attr-defined]
    except Exception:
        tool_names = []
    return {
        "status": "ok",
        "workspace_root": str(WORKSPACE_ROOT),
        "tools": tool_names,
    }


@mcp.tool(name="repo.apply_changes")
def repo_apply_changes(files: list[dict[str, Any]] | None = None, patch: str | None = None, dry_run: bool = True) -> dict[str, Any]:
    """
    Apply file changes directly or return a dry-run plan with a diff summary.

    Input shape matches `repo.apply_changes` in docs. We expose it as `repo_apply_changes`
    to avoid dots in Python attribute names; MCP tool name is still `repo.apply_changes`.
    """
    files = files or []

    if patch:
        # Patch support can be added later; for now reject politely
        return {"error": "patch input not supported yet", "notes": "Provide full files[] instead."}

    if len(files) == 0:
        return {"error": "no files provided"}

    diffs = []
    total_lines_changed = 0
    planned_changes: List[Tuple[str, str]] = []

    for f in files:
        rel_path = f.get("path", "").strip()
        content = f.get("content", "")
        if not rel_path:
            return {"error": "file missing path"}
        if not is_path_allowed(rel_path):
            return {"error": f"path not allowed: {rel_path}"}

        abs_path = resolve_path_safe(rel_path)
        old = abs_path.read_text(encoding="utf-8") if abs_path.exists() else ""
        added, removed = compute_diff_summary(old, content)
        total_lines_changed += (added + removed)
        diffs.append({"path": rel_path, "added": added, "removed": removed})
        planned_changes.append((rel_path, content))

    if len(files) > MAX_FILES_PER_PLAN:
        return {"error": "budget exceeded", "notes": f"max files {MAX_FILES_PER_PLAN}"}
    if total_lines_changed > MAX_LINES_PER_PLAN:
        return {"error": "budget exceeded", "notes": f"max lines {MAX_LINES_PER_PLAN}"}

    if dry_run:
        plan = plan_store.create(planned_changes)
        return {"plan_id": plan.plan_id, "diff_summary": diffs, "notes": "dry-run only"}

    # Apply immediately
    for rel_path, content in planned_changes:
        write_file(resolve_path_safe(rel_path), content)
    return {"plan_id": None, "diff_summary": diffs, "notes": "applied immediately"}


 


@mcp.tool(name="confirm")
def confirm(plan_id: str) -> dict[str, Any]:
    """Execute a previously returned dry-run plan."""
    plan = plan_store.pop(plan_id)
    if not plan:
        return {"status": "error", "message": f"unknown plan_id {plan_id}"}

    diffs = []
    for change in plan.changes:
        abs_path = resolve_path_safe(change.path)
        old = abs_path.read_text(encoding="utf-8") if abs_path.exists() else ""
        added, removed = compute_diff_summary(old, change.content)
        diffs.append({"path": change.path, "added": added, "removed": removed})
        write_file(abs_path, change.content)

    return {
        "status": "applied",
        "commit": {"branch": None, "sha": None},
        "diff_summary": diffs,
    }


@mcp.tool(name="tests.run")
def tests_run(scope: list[str] | None = None, format: str = "json", timeout_sec: int = TEST_TIMEOUT_SEC) -> dict[str, Any]:
    """
    Run pytest and return a structured summary. If pytest is unavailable, returns a stub result.
    """
    # Prefer pytest if available
    cmd = [shlex.which("python") or "python", "-m", "pytest", "-q"]
    if scope:
        cmd.extend(scope)

    code, out, err = run_command(cmd, timeout=timeout_sec)

    # Simple heuristic parse
    summary = {"passed": 0, "failed": 0, "skipped": 0, "duration_sec": None}
    failures = []
    duration = None

    # Parse last few lines for counts (best-effort)
    tail = (out or "").strip().splitlines()[-5:]
    joined = " ".join(tail)
    try:
        # e.g., "3 passed, 1 failed, 1 skipped in 4.20s"
        if " in " in joined and "s" in joined:
            dur_token = joined.split(" in ")[-1]
            if dur_token.endswith("s"):
                duration = float(dur_token[:-1])
    except Exception:
        duration = None

    for token in ["passed", "failed", "skipped"]:
        try:
            before = joined.split(token)[0]
            count_str = before.split()[-1]
            if token == "passed":
                summary["passed"] = int(count_str)
            elif token == "failed":
                summary["failed"] = int(count_str)
            elif token == "skipped":
                summary["skipped"] = int(count_str)
        except Exception:
            # ignore parse errors
            pass

    summary["duration_sec"] = duration

    return {
        "summary": summary,
        "failures": failures,
        "artifacts": [
            {"name": "pytest-stdout.txt", "id": "out_raw", "mime": "text/plain"},
        ],
        "notes": err.strip() if err else None,
        "exit_code": code,
        "stdout": out[-4000:] if out else "",
    }




@mcp.tool(name="docs.write")
def docs_write(paths: list[str], contents: list[str], dry_run: bool = True) -> dict[str, Any]:
    """Write documentation files; wrapper around repo.apply_changes."""
    if len(paths) != len(contents):
        return {"error": "paths and contents length mismatch"}
    files = [{"path": p, "content": c} for p, c in zip(paths, contents)]
    return repo_apply_changes(files=files, dry_run=dry_run)




@mcp.tool(name="vcs.propose")
def vcs_propose(summary: str, branch_base: str = "master", open_pr: bool = True) -> dict[str, Any]:
    """
    Stub: return a proposed branch name; does not push or open PRs.
    """
    slug = summary.lower().strip().replace(" ", "-")[:40]
    branch = f"feat/{slug or 'change'}-{uuid.uuid4().hex[:6]}"
    return {"branch": branch, "commit_sha": None, "pr": {"number": None, "url": None, "status": "prepared"}}




@mcp.tool(name="e2e.run")
def e2e_run(suite: str = "smoke", timeout_sec: int = 600, headless: bool = True) -> dict[str, Any]:
    """Stub E2E runner; returns a placeholder summary."""
    return {
        "summary": {"passed": 0, "failed": 0, "duration_sec": 0.0},
        "failures": [],
        "artifacts": [],
        "notes": "Not configured. Wire to Playwright MCP or similar.",
    }




@mcp.tool(name="artifact.put")
def artifact_put(name: str, bytes_b64: str, mime: str = "application/octet-stream") -> dict[str, Any]:
    data = base64.b64decode(bytes_b64)
    art_id = f"art_{uuid.uuid4().hex[:10]}"
    target = ARTIFACT_DIR / f"{art_id}__{name}"
    target.write_bytes(data)
    meta = {"id": art_id, "name": name, "mime": mime, "path": str(target)}
    (ARTIFACT_DIR / f"{art_id}.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return {"id": art_id}


@mcp.tool(name="artifact.get")
def artifact_get(id: str) -> dict[str, Any]:
    meta_file = ARTIFACT_DIR / f"{id}.json"
    if not meta_file.exists():
        return {"error": f"artifact not found: {id}"}
    meta = json.loads(meta_file.read_text(encoding="utf-8"))
    path = Path(meta.get("path", ""))
    if not path.exists():
        return {"error": f"artifact file missing for id {id}"}
    data_b64 = base64.b64encode(path.read_bytes()).decode("utf-8")
    return {"id": id, "name": meta.get("name"), "mime": meta.get("mime"), "bytes_b64": data_b64}


@mcp.tool(name="artifact.list")
def artifact_list() -> dict[str, Any]:
    items: List[Dict[str, Any]] = []
    for meta_file in ARTIFACT_DIR.glob("art_*.json"):
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
            items.append({k: meta.get(k) for k in ("id", "name", "mime")})
        except Exception:
            continue
    return {"artifacts": items}




# ----------------------------------------------------------------------------
# Server startup
# ----------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(description="FrontRow Tool Router MCP")
    parser.add_argument("--stdio", action="store_true", help="Run in stdio mode")
    parser.add_argument("--host", default="127.0.0.1", help="HTTP host (HTTP mode)")
    parser.add_argument("--port", type=int, default=8010, help="HTTP port (HTTP mode)")
    args = parser.parse_args()

    logger.info("Starting FrontRow Tool Router")
    logger.info(f"Workspace root: {WORKSPACE_ROOT}")

    if args.stdio:
        logger.info("Running in stdio mode")
        mcp.run(transport="stdio")
    else:
        logger.info(f"Running in HTTP mode on {args.host}:{args.port}")
        mcp.run(transport="streamable-http", host=args.host, port=args.port)


if __name__ == "__main__":
    main()

