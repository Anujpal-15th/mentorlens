// Result page logic without the DOM: URL parsing, polling, and the view-model the page renders.
import { formatValue } from './format.js';

export const POLL_MS = 2000;

export function readLocation(search) {
  const p = new URLSearchParams(search || '');
  const id = (p.get('id') || '').trim();
  return { id: id || null, sample: p.get('sample') === '1' };
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Reads the submission until it is DONE or FAILED. It only ever GETs: a reload never resubmits.
export async function pollSubmission(api, id, { onUpdate = () => {}, sleep = defaultSleep, interval = POLL_MS, isCancelled = () => false } = {}) {
  for (;;) {
    const sub = await api.getSubmission(id);
    onUpdate(sub);
    if (!sub || sub.status === 'DONE' || sub.status === 'FAILED' || isCancelled()) return sub;
    await sleep(interval);
  }
}

export function progressView(sub) {
  switch (sub && sub.status) {
    case 'QUEUED': {
      const n = sub.queuePosition;
      return {
        state: 'queued',
        title: 'Queued',
        detail: n > 0 ? `Position ${n} in the queue. Your run starts when a runner is free.` : 'Waiting for a free runner.',
      };
    }
    case 'RUNNING':
      return { state: 'running', title: 'Running', detail: 'Recording your run step by step and checking it against a verified correct run.' };
    case 'DONE':
      return { state: 'done', title: 'Done', detail: 'Analysis complete.' };
    case 'FAILED':
      return { state: 'failed', title: 'Analysis failed', detail: (sub && sub.error) || 'The analysis could not be completed.' };
    default:
      return { state: 'failed', title: 'Unexpected reply', detail: 'The server sent a status this page does not recognise.' };
  }
}

const OUTCOMES = {
  NORMAL: { label: 'Finished normally', tone: 'neutral', message: null },
  EXCEPTION: { label: 'Crashed', tone: 'bad', message: null },
  TIMED_OUT: { label: 'Timed out', tone: 'bad', message: 'Your code ran past the time limit. That usually means a loop that never ends. The replay shows the steps recorded before it stopped.' },
  TRUNCATED: { label: 'Trace cut short', tone: 'warn', message: 'Your run took more steps than can be recorded, so the replay shows only the first part.' },
  UNSUPPORTED: { label: 'Not supported yet', tone: 'warn', message: 'This question type is not supported yet, so there is no step-by-step replay. MentorLens currently handles single-method Python solutions on lists, strings and dictionaries.' },
};

export const NO_EXPLANATION = 'No checked explanation is available for this submission. Your real run and the output comparison are still shown.';

export function humanize(slug) {
  if (!slug || typeof slug !== 'string') return null;
  const s = slug.replace(/[-_]+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : null;
}

export function resultView(r) {
  const code = OUTCOMES[r.outcome] ? r.outcome : 'NORMAL';
  const o = OUTCOMES[code];
  const outcome = {
    code,
    label: o.label,
    tone: o.tone,
    message: code === 'EXCEPTION' ? (r.error || 'Your code raised an error.') : o.message,
  };
  const passed = r.passed === true;
  const hasCorrect = Array.isArray(r.correctTrace);
  const fd = r.firstDifference || null;

  let compare;
  if (hasCorrect && fd) compare = { mode: 'side-by-side', reason: null };
  else if (!hasCorrect) compare = { mode: 'single', reason: 'No verified correct run is available for this submission, so only your run is shown.' };
  else compare = { mode: 'single', reason: 'Your run and the verified correct run could not be lined up step by step (they likely take a different approach), so only your run is shown.' };

  const explanation = !r.noCheckedExplanation && r.explanation && (r.explanation.what || r.explanation.where || r.explanation.why)
    ? { what: r.explanation.what || '', where: r.explanation.where || '', why: r.explanation.why || '' }
    : null;

  return {
    passed,
    verdict: passed
      ? { tone: 'good', title: 'Your code passed this test' }
      : { tone: 'bad', title: 'Your code failed this test' },
    yourOutput: formatValue(r.actualOutput),
    expectedOutput: formatValue(r.expectedOutput),
    outcome,
    checkTestNote: passed ? 'Your output matches the expected output. Check that you pasted the failing test exactly as the platform shows it.' : null,
    multipleAnswersNote: passed ? null : 'Some questions accept several valid answers. If yours is a different valid answer, the platform may still accept it.',
    compare,
    firstDifference: compare.mode === 'side-by-side' ? fd : null,
    explanation,
    noExplanationMessage: explanation ? null : NO_EXPLANATION,
    showScore: Number.isFinite(r.score),
    score: Number.isFinite(r.score) ? Math.max(0, Math.min(100, Math.round(r.score))) : null,
    complexity: r.complexity && (r.complexity.time || r.complexity.space) ? r.complexity : null,
    mistakeType: humanize(r.mistakeType),
    hint: explanation && r.hint && r.hint.text ? r.hint : null,
  };
}

// Marks lines of `after` that differ from `before`. Same line count: compare line by line,
// which keeps a swap visible as two changed lines. Otherwise: longest common subsequence.
export function lineDiff(before, after) {
  const a = String(before ?? '').split(/\r?\n/);
  const b = String(after ?? '').split(/\r?\n/);
  if (a.length === b.length) return b.map((text, i) => ({ n: i + 1, text, changed: text !== a[i] }));

  // ponytail: O(n*m) table, fine for solution-sized code.
  const m = a.length, n = b.length;
  const t = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) {
    t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  }
  const keep = new Set();
  for (let i = 0, j = 0; i < m && j < n;) {
    if (a[i] === b[j]) { keep.add(j); i++; j++; } else if (t[i + 1][j] >= t[i][j + 1]) i++; else j++;
  }
  return b.map((text, j) => ({ n: j + 1, text, changed: !keep.has(j) }));
}
