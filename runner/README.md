# Runner Service (Python)

Owner: Aryan

## Responsibilities
- Take a bare `Solution` class and add the hidden parts: imports, driver, input conversion and helper types
- Run the code in a Docker sandbox with no network, plus time and memory limits
- Record each step with `sys.settrace`: line, variables and event
- Return the output and steps to the backend as JSON
- Queue runs and limit how many run at once

The request and response format is in `docs/api-contract.md`.

## Build first
A plain script, with no web service or Docker yet, that runs `tests/samples/two_sum_sorted_wrong_pointer.py` and prints its steps as JSON.

Then add these in order:
1. Limits on steps and time, so endless loops stop
2. The Docker sandbox
3. The web service
4. The queue

## Analysis Service (FastAPI)

A small web service that checks submitted code with static-analysis tools and returns the
findings as structured JSON, so the backend and the AI get real findings along with the code.
Python (Pylint) is the only supported language for now. `app.py` keeps an `ANALYZERS`
table, so another language can be added by writing one function and registering it.

### Install and start
```
cd runner
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --reload
```
The service runs at `http://127.0.0.1:8000` (the backend uses 8080).
Swagger UI: `http://127.0.0.1:8000/docs`

### Endpoints

`GET /health` returns `200`:
```json
{"status": "ok", "service": "analysis-service"}
```

`POST /analyze` takes the language and the source code:
```json
{"language": "python", "code": "import os\n\n\ndef add(a, b):\n    return a + b\n"}
```
and returns `200`:
```json
{
  "status": "completed",
  "summary": {
    "issue_count": 3,
    "error_count": 0,
    "warning_count": 1,
    "by_severity": {"convention": 2, "warning": 1}
  },
  "issues": [
    {"line": 1, "column": 0, "severity": "convention", "message": "Missing module docstring",
     "rule_id": "C0114", "symbol": "missing-module-docstring"},
    {"line": 1, "column": 0, "severity": "warning", "message": "Unused import os",
     "rule_id": "W0611", "symbol": "unused-import"},
    {"line": 4, "column": 0, "severity": "convention", "message": "Missing function or method docstring",
     "rule_id": "C0116", "symbol": "missing-function-docstring"}
  ]
}
```
- `severity` is Pylint's category: `convention`, `refactor`, `warning`, `error`, `fatal`.
- `error_count` counts `error` and `fatal`. `warning_count` counts `warning`. `by_severity` counts every category, so nothing is dropped.
- A syntax error in the submitted code is reported as an issue (`syntax-error`), not as an HTTP error.

| Status | When |
| --- | --- |
| `200` | Analysis ran (even if issues were found) |
| `400` | Unsupported `language` (the message lists the supported ones) |
| `422` | Malformed JSON, missing fields, empty or blank `code`, null characters, or code over 200,000 characters |
| `500` | The analysis itself failed or timed out (`{"detail": "Analysis failed."}`). Details go to the server log only |

The code is written to a temporary file that is always deleted, and the file path is never returned in a response.

### Run the tests
```
cd runner
pytest --strict-markers -m "not docker"
```

## Pylint script (command line)
`pylint_script.py` runs Pylint on one Python file and prints the issues as JSON
(`line`, `severity`, `message`, plus `column`, `rule_id`, `symbol`). The API above reuses it.
```
python pylint_script.py samples/sample_code.py
```
On failure (missing file, not a `.py` file, Pylint crash) it prints `{"error": "..."}` and exits 1.

## Run locally
```
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Put your scripts in this folder. The service runs on port 8000 (backend uses 8080).

## Safety
Never run submitted code outside the sandbox on any shared or public server.
