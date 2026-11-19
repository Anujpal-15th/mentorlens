#!/usr/bin/env python3
"""Run Pylint on a single Python file and print the issues as JSON.

Usage:
    python pylint_script.py path/to/file.py

Output (stdout) on success:
    {
      "file": "path/to/file.py",
      "tool": "pylint",
      "issue_count": 2,
      "issues": [
        {"line": 3, "column": 4, "severity": "warning",
         "message": "Unused import os", "rule_id": "W0611",
         "symbol": "unused-import"}
      ]
    }

Output on failure (exit code 1):
    {"file": "...", "tool": "pylint", "error": "reason"}

Severity is Pylint's message category: convention, refactor, warning,
error or fatal.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path


def run_pylint(file_path: Path, timeout: float = None) -> list:
    """Run Pylint on file_path and return its raw message list.

    If timeout (seconds) is given and Pylint takes longer, RuntimeError is raised.
    """
    cmd = [
        sys.executable, "-m", "pylint",
        "--output-format=json",
        "--score=n",
        str(file_path),
    ]
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, check=False, timeout=timeout
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"Pylint timed out after {timeout} seconds") from exc

    # Pylint exit codes are a bitmask: 1-30 just mean "messages were found".
    # 32 means a usage error; anything with no JSON on stdout is a real failure.
    if proc.returncode & 32 or not proc.stdout.strip():
        detail = (proc.stderr or proc.stdout).strip() or "Pylint failed to run"
        raise RuntimeError(detail)
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Could not parse Pylint output: {exc}") from exc


def to_issue(msg: dict) -> dict:
    """Convert one raw Pylint message into our fixed issue format."""
    return {
        "line": msg.get("line"),
        "column": msg.get("column"),
        "severity": msg.get("type"),
        "message": msg.get("message"),
        "rule_id": msg.get("message-id"),
        "symbol": msg.get("symbol"),
    }


def analyze(file_path: Path, timeout: float = None) -> dict:
    """Return the full result dict for file_path."""
    issues = [to_issue(m) for m in run_pylint(file_path, timeout)]
    issues.sort(key=lambda i: (i["line"] or 0, i["column"] or 0))
    return {
        "file": str(file_path),
        "tool": "pylint",
        "issue_count": len(issues),
        "issues": issues,
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Run Pylint on a Python file and print issues as JSON."
    )
    parser.add_argument("file", help="path to the Python file to analyze")
    args = parser.parse_args(argv)

    path = Path(args.file)
    try:
        if not path.is_file():
            raise FileNotFoundError(f"File not found: {path}")
        if path.suffix != ".py":
            raise ValueError(f"Not a Python file (.py expected): {path}")
        result = analyze(path)
    except (OSError, ValueError, RuntimeError) as exc:
        print(json.dumps({"file": str(path), "tool": "pylint", "error": str(exc)}, indent=2))
        return 1

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
