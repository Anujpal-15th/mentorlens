"""Analysis Service: a small FastAPI app that checks submitted code.

Run locally (from this folder):
    uvicorn app:app --reload
Swagger UI: http://127.0.0.1:8000/docs
"""
import logging
import tempfile
from pathlib import Path
from typing import Callable, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

import pylint_script

logger = logging.getLogger("analysis-service")

SERVICE_NAME = "analysis-service"
MAX_CODE_CHARS = 200_000   # request size guard
ANALYSIS_TIMEOUT = 60      # seconds allowed for one Pylint run


# --------------------------------------------------------------------------
# Analyzers. To support a new language, write a function that takes the source
# code and returns a list of issue dicts (line, column, severity, message,
# rule_id, symbol), then add it to ANALYZERS.
# --------------------------------------------------------------------------
def analyze_python(code: str) -> List[dict]:
    """Write code to a temporary file, run Pylint on it, delete the file."""
    # The directory (and the file in it) is removed on exit, even on errors.
    with tempfile.TemporaryDirectory(prefix="analysis_") as tmp_dir:
        source = Path(tmp_dir) / "submission.py"
        source.write_text(code, encoding="utf-8")
        issues = pylint_script.analyze(source, timeout=ANALYSIS_TIMEOUT)["issues"]
        # Never let the internal temp path reach the client.
        for issue in issues:
            if issue.get("message"):
                issue["message"] = issue["message"].replace(tmp_dir, "<code>")
        return issues


ANALYZERS: Dict[str, Callable[[str], List[dict]]] = {"python": analyze_python}


# --------------------------------------------------------------------------
# Request / response models
# --------------------------------------------------------------------------
class AnalyzeRequest(BaseModel):
    language: str = Field(..., min_length=1, max_length=32, examples=["python"])
    code: str = Field(..., max_length=MAX_CODE_CHARS)

    @field_validator("code")
    @classmethod
    def code_must_be_usable(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("code must not be empty")
        if "\x00" in value:
            raise ValueError("code must not contain null characters")
        return value


class Issue(BaseModel):
    line: Optional[int] = None
    column: Optional[int] = None
    severity: Optional[str] = None
    message: Optional[str] = None
    rule_id: Optional[str] = None
    symbol: Optional[str] = None


class Summary(BaseModel):
    issue_count: int
    error_count: int       # severity "error" or "fatal"
    warning_count: int     # severity "warning"
    by_severity: Dict[str, int]  # every category, e.g. convention, refactor


class AnalyzeResponse(BaseModel):
    status: str = "completed"
    summary: Summary
    issues: List[Issue]


class HealthResponse(BaseModel):
    status: str
    service: str


def build_summary(issues: List[dict]) -> Summary:
    by_severity: Dict[str, int] = {}
    for issue in issues:
        key = issue.get("severity") or "unknown"
        by_severity[key] = by_severity.get(key, 0) + 1
    return Summary(
        issue_count=len(issues),
        error_count=by_severity.get("error", 0) + by_severity.get("fatal", 0),
        warning_count=by_severity.get("warning", 0),
        by_severity=by_severity,
    )


# --------------------------------------------------------------------------
# App
# --------------------------------------------------------------------------
app = FastAPI(
    title="MentorLens Analysis Service",
    description="Runs static analysis on submitted code and returns structured findings.",
    version="0.1.0",
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service=SERVICE_NAME)


# A plain `def` endpoint runs in FastAPI's thread pool, so a slow Pylint run
# does not block other requests.
@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    language = request.language.strip().lower()
    analyzer = ANALYZERS.get(language)
    if analyzer is None:
        supported = ", ".join(sorted(ANALYZERS))
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language '{request.language}'. Supported: {supported}.",
        )
    try:
        issues = analyzer(request.code)
    except Exception:  # pylint: disable=broad-exception-caught
        # Full details go to the server log only, never to the client.
        logger.exception("Analysis failed")
        raise HTTPException(status_code=500, detail="Analysis failed.") from None
    return AnalyzeResponse(summary=build_summary(issues), issues=issues)
