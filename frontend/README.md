# Frontend

Plain HTML, CSS and JavaScript ES modules. No build step, no framework, no npm dependencies.
Monaco Editor (pinned `monaco-editor@0.52.2`) loads from jsDelivr; if it can't load, the workspace falls back to a plain code box.

## Run

```bash
# backend on http://localhost:8080 (it only allows CORS from http://localhost:5173)
python -m http.server 5173 --directory frontend
```

Open http://localhost:5173/login.html.

The login token (JWT) and your email are kept in `localStorage` (`mentorlens.token`, `mentorlens.email`) and cleared by Log out or any 401 reply. Monaco (cdn.jsdelivr.net) and the Inter and JetBrains Mono fonts (Google Fonts) load from CDNs, so the pages need internet access for those. Without it, the editor falls back to a plain code box and the fonts fall back to system fonts.

The backend URL defaults to `http://localhost:8080`. To change it, open **Server settings** on the login page (stored in `localStorage` as `mentorlens.apiBase`).

## Pages

| Page | What it does |
| --- | --- |
| `login.html` | Log in or sign up in one card. Sign-up needs the consent box (code is sent to Google Gemini) and sends `"consent": true`. |
| `workspace.html` | Question, Monaco editor (prefilled with the Two Sum sample), failing test input and expected output, the third-party AI notice. Submits `POST /api/submissions` and goes to `result.html?id=<id>`. Shows 400 and 429 messages. |
| `result.html?id=<id>` | Polls `GET /api/submissions/{id}` every 2 seconds (Queued with position, Running, Done, Failed). Reload-safe: it only reads the id from the URL and never resubmits. Shows the verdict, the side-by-side replay, the AI mentor panel (What / Where / Why, hint ladder 1 to 4 via `GET /api/submissions/{id}/hints/next`) and score, complexity and mistake type. |
| `result.html?sample=1` | Sample mode, no login or backend needed. Built from the two real recorded traces in `sample/` (copies of `backend/src/test/resources/traces/`). The explanation and hints are example text, and the page says so. Hints are local. |

### Replay

- Both runs are aligned by step index, as the backend's `RunComparer` does. The shorter run holds its last step.
- Controls: first, back, play/pause with speed, next, last, a scrubber with a red marker at the first difference, and "Jump to first difference". Keyboard: arrows, Space, Home, End, D.
- The page opens at the first difference; playing from the start pauses there.
- Variables flash when they change and are highlighted where the two runs differ.
- Drawings: arrays as boxes with integer variables that are valid indexes shown as sliding pointers, strings as character boxes, dicts as tables, 2D lists as grids, linked lists (`{val, next}`) and trees (`{val, left, right}`) as nodes. Anything else falls back to JSON.
- When `correctTrace` or `firstDifference` is null, only your run is shown, with the reason.
- The correct code is only shown at hint level 4 (or in sample mode). Before that the correct pane shows line numbers and variables without source.

The result API does not return the submitted code, so the workspace keeps it in `localStorage` (`mentorlens.sub.<id>`) for the replay panes. On another browser the panes show line numbers only. Revealed hint texts are kept as `mentorlens.hints.<id>`; the level 4 correct code is never stored, and the page offers to fetch it again (level 4 repeats).

## Code layout

| File | Role |
| --- | --- |
| `js/api.js` | Backend client: token header, `{error}` messages, 401 clears the token and goes to login. No DOM. |
| `js/replay.js` | `createReplay(yours, correct, firstDifference)`, variable diffing, the first-difference sentence. No DOM. |
| `js/result-model.js` | URL parsing, polling with retry, progress and result view-models, hint ladder, line diff. No DOM. |
| `js/format.js`, `js/sample.js` | Value formatting; sample code, hints and result. No DOM. |
| `js/drawings.js` | `draw(value)` and in-place updates for pointer animation. |
| `js/ui.js` | DOM helpers, icons, top bar, auth guard. |
| `js/login.js`, `js/workspace.js`, `js/result.js` | Page scripts. |

All server and user text is rendered with `textContent`; nothing uses `innerHTML`.

## Tests

```bash
cd frontend
node --test
```

Uses a fake `fetch` and the real recorded traces. Covers the API client, replay stepping, result states and the sample.
