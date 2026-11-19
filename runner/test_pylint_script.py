import json
import subprocess
import sys
from pathlib import Path

import pylint_script

HERE = Path(__file__).parent
SAMPLE = HERE / "samples" / "sample_code.py"


def test_sample_produces_valid_json_with_required_fields():
    proc = subprocess.run(
        [sys.executable, str(HERE / "pylint_script.py"), str(SAMPLE)],
        capture_output=True, text=True, check=False,
    )
    assert proc.returncode == 0
    result = json.loads(proc.stdout)
    assert result["tool"] == "pylint"
    assert result["issue_count"] == len(result["issues"]) > 0
    for issue in result["issues"]:
        assert isinstance(issue["line"], int)
        assert issue["severity"] in {"convention", "refactor", "warning", "error", "fatal"}
        assert issue["message"]


def test_sample_reports_known_problems():
    result = pylint_script.analyze(SAMPLE)
    by_symbol = {i["symbol"]: i for i in result["issues"]}
    assert by_symbol["unused-import"]["severity"] == "warning"
    assert by_symbol["undefined-variable"]["severity"] == "error"
    assert by_symbol["undefined-variable"]["line"] == 18


def test_issues_sorted_by_line():
    lines = [i["line"] for i in pylint_script.analyze(SAMPLE)["issues"]]
    assert lines == sorted(lines)


def test_missing_file_returns_error_json(tmp_path):
    proc = subprocess.run(
        [sys.executable, str(HERE / "pylint_script.py"), str(tmp_path / "nope.py")],
        capture_output=True, text=True, check=False,
    )
    assert proc.returncode == 1
    assert "error" in json.loads(proc.stdout)


def test_non_python_file_returns_error_json(tmp_path):
    f = tmp_path / "notes.txt"
    f.write_text("hi")
    proc = subprocess.run(
        [sys.executable, str(HERE / "pylint_script.py"), str(f)],
        capture_output=True, text=True, check=False,
    )
    assert proc.returncode == 1
    assert "error" in json.loads(proc.stdout)


def test_timeout_raises_runtime_error(monkeypatch):
    import pytest

    def hang(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd="pylint", timeout=1)

    monkeypatch.setattr(subprocess, "run", hang)
    with pytest.raises(RuntimeError, match="timed out"):
        pylint_script.run_pylint(SAMPLE, timeout=1)
