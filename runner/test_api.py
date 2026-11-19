"""Tests for the Analysis Service API (app.py)."""
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app as app_module
import pylint_script

client = TestClient(app_module.app)

SAMPLE = Path(__file__).parent / "samples" / "sample_code.py"
CLEAN_CODE = '"""Doc."""\n\n\ndef add(a, b):\n    """Add."""\n    return a + b\n'


def analyze(payload):
    return client.post("/analyze", json=payload)


@pytest.fixture
def spy_analyzer(monkeypatch):
    """Replace pylint_script.analyze with a fake that records the file it was given."""
    seen = {"paths": [], "existed_during_call": []}

    def fake(path, timeout=None):
        seen["paths"].append(Path(path))
        seen["existed_during_call"].append(Path(path).exists())
        return {"file": str(path), "tool": "pylint", "issue_count": 0, "issues": []}

    monkeypatch.setattr(pylint_script, "analyze", fake)
    return seen


# 1. Health ---------------------------------------------------------------
def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "analysis-service"}


# 2 + 3. Valid code, real Pylint, response structure ----------------------
def test_clean_code_has_no_issues():
    response = analyze({"language": "python", "code": CLEAN_CODE})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["issues"] == []
    assert body["summary"]["issue_count"] == 0
    assert body["summary"]["error_count"] == 0
    assert body["summary"]["warning_count"] == 0


def test_real_pylint_findings_and_structure():
    code = SAMPLE.read_text(encoding="utf-8")
    response = analyze({"language": "python", "code": code})
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"status", "summary", "issues"}
    assert body["status"] == "completed"
    assert body["summary"]["issue_count"] == len(body["issues"]) > 0
    for issue in body["issues"]:
        assert set(issue) == {"line", "column", "severity", "message", "rule_id", "symbol"}
    by_symbol = {i["symbol"]: i for i in body["issues"]}
    assert by_symbol["undefined-variable"]["severity"] == "error"
    assert by_symbol["undefined-variable"]["line"] == 18
    assert by_symbol["unused-import"]["severity"] == "warning"


def test_summary_counts_match_issues_and_keep_other_severities():
    code = SAMPLE.read_text(encoding="utf-8")
    body = analyze({"language": "python", "code": code}).json()
    summary, issues = body["summary"], body["issues"]
    sev = [i["severity"] for i in issues]
    assert summary["error_count"] == sev.count("error") + sev.count("fatal")
    assert summary["warning_count"] == sev.count("warning")
    assert summary["by_severity"]["convention"] == sev.count("convention") > 0
    assert summary["by_severity"]["refactor"] == sev.count("refactor") > 0
    assert sum(summary["by_severity"].values()) == summary["issue_count"]


def test_syntax_error_is_reported_as_an_issue():
    response = analyze({"language": "python", "code": "def broken(:\n    pass\n"})
    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["error_count"] >= 1
    assert any(i["symbol"] == "syntax-error" for i in body["issues"])


def test_language_is_case_insensitive():
    assert analyze({"language": " Python ", "code": CLEAN_CODE}).status_code == 200


# 4. Unsupported language -------------------------------------------------
def test_unsupported_language_rejected():
    response = analyze({"language": "cobol", "code": "DISPLAY 'HI'."})
    assert response.status_code == 400
    assert "Unsupported language" in response.json()["detail"]
    assert "python" in response.json()["detail"]


# 5. Empty / malformed requests -------------------------------------------
@pytest.mark.parametrize("code", ["", "   \n\t  ", "print('a')\x00"])
def test_empty_or_invalid_code_rejected(code):
    assert analyze({"language": "python", "code": code}).status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"language": "python"},
        {"code": "x = 1"},
        {"language": "python", "code": 123},
        {"language": "", "code": "x = 1"},
        {"language": "python", "code": "x" * (app_module.MAX_CODE_CHARS + 1)},
    ],
)
def test_malformed_requests_rejected(payload):
    assert analyze(payload).status_code == 422


def test_non_json_body_rejected():
    response = client.post("/analyze", content="not json", headers={"Content-Type": "application/json"})
    assert response.status_code == 422


# 6. Analysis failures are handled safely ---------------------------------
def test_analysis_failure_returns_500_without_leaking_details(monkeypatch):
    def boom(path, timeout=None):
        raise RuntimeError(f"Traceback: crashed reading {path} on /srv/secret/host")

    monkeypatch.setattr(pylint_script, "analyze", boom)
    response = analyze({"language": "python", "code": "x = 1"})
    assert response.status_code == 500
    assert response.json() == {"detail": "Analysis failed."}
    assert "secret" not in response.text
    assert "Traceback" not in response.text
    assert "submission.py" not in response.text


def test_pylint_timeout_returns_500(monkeypatch):
    def hang(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd="pylint", timeout=1)

    monkeypatch.setattr(subprocess, "run", hang)
    response = analyze({"language": "python", "code": "x = 1"})
    assert response.status_code == 500
    assert response.json() == {"detail": "Analysis failed."}


# 7. Temporary files and paths --------------------------------------------
def test_temp_files_removed_after_success(spy_analyzer):
    response = analyze({"language": "python", "code": "x = 1"})
    assert response.status_code == 200
    (path,) = spy_analyzer["paths"]
    assert spy_analyzer["existed_during_call"] == [True]
    assert not path.exists()
    assert not path.parent.exists()


def test_temp_files_removed_after_failure(monkeypatch):
    seen = []

    def boom(path, timeout=None):
        seen.append(Path(path))
        raise RuntimeError("boom")

    monkeypatch.setattr(pylint_script, "analyze", boom)
    assert analyze({"language": "python", "code": "x = 1"}).status_code == 500
    assert len(seen) == 1
    assert not seen[0].exists()
    assert not seen[0].parent.exists()


def test_real_run_leaves_no_temp_directories():
    import tempfile

    tmp_root = Path(tempfile.gettempdir())
    before = set(tmp_root.glob("analysis_*"))
    analyze({"language": "python", "code": CLEAN_CODE})
    assert set(tmp_root.glob("analysis_*")) == before


def test_temp_path_never_appears_in_response(monkeypatch):
    def fake(path, timeout=None):
        message = f"Cannot import module at {Path(path).parent}"
        return {"issues": [{"line": 1, "column": 0, "severity": "error", "message": message,
                            "rule_id": "E0401", "symbol": "import-error"}]}

    monkeypatch.setattr(pylint_script, "analyze", fake)
    response = analyze({"language": "python", "code": "import nope"})
    assert response.status_code == 200
    assert "analysis_" not in response.text
    assert "<code>" in response.json()["issues"][0]["message"]
