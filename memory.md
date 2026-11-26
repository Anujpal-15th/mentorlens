# MentorLens Project Memory

Read this first to pick the project back up. Update it after every finished task.

Last updated: 26 Nov 2026

## What this is
MentorLens helps students whose LeetCode-style code fails. They paste the question, their `Solution` code and the failing test. It really runs the code, shows it step by step beside a verified correct version, stops at the first difference, and explains the mistake with hints before the answer.

The repo explainer, developer code review and users' own API keys are for later.

## Where to find things
| What | Where |
|---|---|
| Design (wins if documents disagree) | `docs/superpowers/specs/2026-11-04-mentorlens-design.md` |
| Task plan | `docs/superpowers/plans/2026-11-04-mentorlens-alpha.md` |
| JSON formats | `docs/api-contract.md` |
| Architecture | `docs/architecture.md` |
| Team rules | `docs/team-rules.md` |

## Team
| Person | Work | Tasks |
|---|---|---|
| Anuj (leader) | Backend, AI feedback, reviews and merges pull requests | 1, 5, 6, 7, 8, 9, 14 |
| Aryan | Python runner and sandbox | 2, 3, 4 |
| Abhi | Pages, visualization, consent checkbox | 10, 11, 12, frontend of 14 |
| Rudra | Samples, dashboard, docs | 13, 15 |

## Working rules
- All parts communicate through JSON over HTTP.
- Each task uses subagents to build and review, and goes in its own branch and pull request.
- After each task: update this file, explain the task to Anuj, and ask before starting the next.
- Only Anuj merges. Claude reviews teammates' pull requests when told they are open.
- Never add a `Co-Authored-By` line to commits. 15 older commits on `main` still have one, and removing them is on hold.
- Dates are not decided, so do not assume deadlines.
- Never put API keys or passwords in the repo.

## Tech
Frontend: HTML, CSS, JavaScript, Monaco. Backend: Java 17 target, Spring Boot 4, Maven Wrapper, PostgreSQL (H2 in tests). Runner: Python, FastAPI, `sys.settrace`, Docker. AI: Gemini first, key in `AI_API_KEY`.

## Work done
| Work | Pull request | Result |
|---|---|---|
| New README and docs | 1, 2 | Merged |
| Task 1: design, plan, docs synced | 3 | Merged |
| Task 5: login, submissions, queue with 4 workers | 4 | Merged |
| Task 6: first difference between two runs | 5 | Merged |
| Task 7: Gemini client with validated JSON | 6 | Merged |
| Task 8: submission pipeline and score | 7 | Merged |
| Automatic checks: tests, CodeQL, Dependabot | 8 | Merged |
| GitHub Actions version updates | 9, 10, 11, 12 | Merged |
| Task 9: hints by level | 13 | Merged |
| Task 14 backend: consent and pilot groups | 14 | Merged |
| Final backend fixes from the whole-backend review | 15 | Merged |
| Dependabot updates (CodeQL v4, Maven 3.10.1) | 16, 17 | Merged |
| Aryan: Pylint script with JSON output | 18 | Merged |
| Aryan: FastAPI analysis service (`/health`, `/analyze`) | 19 | Merged into the wrong branch, so not on `main` |
| Aryan's service brought to `main` | 20 | Merged |
| Memory and Anuj's tasks | 21 | Merged |
| Frontend (Tasks 10-12): login, workspace, result replay, hints, sample mode | anuj-frontend | **Open, waiting for Anuj's merge** |

Also done:
- `main` has a `protect-main` ruleset: pull requests required, `backend-tests`, `runner-tests` and `frontend-tests` must pass, 0 approvals, no force pushes or deletion.
- Aryan has Write access. Abhi and Rudra aren't collaborators yet.
- 19 Nov: the team was told their tasks in the WhatsApp group "Circle".

## System test, 19 Nov
Run on latest `main` with a temporary PostgreSQL, the real backend and Aryan's service:
- Backend tests: 123 passed. Aryan's tests: 5 on `main`, 29 on pull request 20.
- Sign-up requires consent, login works, submitting without a token gives 401, and another student's submission gives 404.
- **A real submission ends `FAILED`, "code runner is unavailable"**, because the backend calls `POST /run` and only `/health` and `/analyze` exist.
- Pylint on the Two Sum sample found only style noise, not the real bug.

## Anuj's tasks
Backend tasks are done. Remaining, in order:
1. Merge pull request 20 once its checks pass.
2. Add Abhi and Rudra as collaborators with Write access.
3. Follow up daily with Aryan on the runner (`POST /run`), the top blocker.
4. Decide the team split: should Aryan's service also do analysis?
5. Get a Gemini API key and set `AI_API_KEY` to test real AI feedback.
6. Decide who pays for the AI and the server.
7. Agree alpha and pilot dates.
8. Get Dr. Shukla's approval of the new scope, update the synopsis, and re-export its PDF.
9. Learn the backend code well enough to explain it in the viva.
10. When the runner is ready: test the full flow end to end and fix mismatches.
11. If Aryan does analysis: make the backend call `/analyze`.

## Frontend, 26 Nov
Anuj chose to have Claude build the frontend (originally Abhi's). Run with `python -m http.server 5173 --directory frontend`; the backend only allows CORS from port 5173. `result.html?sample=1` replays the real recorded Two Sum runs with example hint text, clearly labelled, for demos. 35 `node --test` tests. Tested live against the real backend on PostgreSQL: sign-up with consent, submit, then FAILED "runner unavailable" as expected. The project report is `D:/Download/pdf/MentorLens_Project_Report_v2`.

## Open review points for Aryan
- Disable Pylint rules `C0103`, `C0114`, `C0115`, `C0116` and `R0903`, which flag names LeetCode forces on students.
- Errors use `{"detail": ...}`; the contract uses `{"error": ...}`.
- No limit on Pylint runs at the same moment.

## Not built
- Runner (Tasks 2-4): no `POST /run` yet. Only the Pylint analysis exists.
- Samples (Task 13): only `two_sum_sorted_wrong_pointer` exists.
- Dashboard (Task 15): `GET /api/students/me/progress` doesn't exist.

## Open decisions
1. **Team split, waiting for Anuj.** Proposal: Anuj keeps the backend, JSON passing and the AI call. Aryan's Python service takes the runner and analysis (`/analyze`: Pylint findings, measured complexity, first difference, score). This would move Java code to Python and change the design, plan and contract. Fallback: move only Pylint and measured complexity.
2. Who pays for AI and the server, and the budget.
3. Alpha and pilot dates.
4. Dr. Shukla's approval of the new scope. The synopsis still describes the old design, and its PDF has only the cover page.

## Known limits
- Never run end to end with a real runner or real Gemini.
- Team chat is the WhatsApp group "Circle". Claude drafts messages, and Anuj approves each before it's sent.
- Failed AI calls count toward the daily limit of 20, which can overshoot by 3.
- `1.0` and `1` count as different. Questions with several valid answers can be wrongly marked as failing.
- Docker sandbox tests don't run in automatic checks.
- Assign pilot groups before students start, because unassigned students see the comparison.

## Check in Aryan's pull requests
- Student code can't fake the reply, including by printing JSON.
- `/run` isn't reachable from the internet.
- Variables exclude `self` and memory addresses, and every step's `line` is an integer.
- `output` holds the changed input for in-place questions.
- `runner/requirements.txt` is added with the first test.
