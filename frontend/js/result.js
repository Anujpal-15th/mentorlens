// Result page: waiting state, verdict, side-by-side replay, AI mentor panel.
import { api, el, svg, icon, alertBox, renderTopBar, requireAuth, storeJson, loadJson } from './ui.js';
import {
  readLocation, pollSubmission, progressView, resultView, lineDiff,
  requestNextHint, topLevel, missingLevels, hintsForStorage,
} from './result-model.js';
import { createReplay, differingVariables, changedVariables, differenceCallout } from './replay.js';
import { drawInto, kindOf } from './drawings.js';
import { formatValue } from './format.js';
import {
  buildSampleSubmission, sampleHint, SAMPLE_BANNER, SAMPLE_CODE, SAMPLE_CORRECT_CODE,
  SAMPLE_QUESTION, SAMPLE_INPUT, SAMPLE_EXPECTED,
} from './sample.js';

const $ = (id) => document.getElementById(id);
const HINT_NAMES = ['Nudge', 'Pointer', 'Guided fix', 'Correct version'];

const S = {
  id: null, sample: false, meta: null, result: null, view: null, replay: null,
  studentCode: null, correctCode: null, hints: [], panes: [], timer: null, pauseAtDiff: false,
  hintBusy: false, hintError: null, revealed: 1,
};

/* ---------------- Waiting, failed and error states ---------------- */

function renderStatus(sub) {
  const v = progressView(sub);
  const order = ['queued', 'running', 'done'];
  const at = order.indexOf(v.state);
  const track = el('div', { class: 'steps-track', 'aria-hidden': 'true' },
    ['Queued', 'Running', 'Done'].map((label, i) => el('div', {
      class: `track-step${i < at || v.state === 'done' ? ' is-done' : ''}${i === at && v.state !== 'done' ? ' is-active' : ''}`,
    }, el('span', { class: 'track-dot' }, i < at ? '✓' : String(i + 1)), label)));
  if (v.state === 'failed') {
    $('status').replaceChildren(el('div', { class: 'card progress-card fade-in' },
      el('h1', {}, v.title),
      el('div', { style: { margin: '18px 0' } }, alertBox('error', v.detail)),
      el('div', { class: 'row', style: { justifyContent: 'center' } },
        el('a', { class: 'btn btn-primary', href: 'workspace.html' }, 'New submission'),
        el('a', { class: 'btn', href: 'result.html?sample=1' }, 'See the sample result'))));
    return;
  }
  $('status').replaceChildren(el('div', { class: 'card progress-card' },
    el('span', { class: 'spinner', style: { color: 'var(--accent)', width: '28px', height: '28px' } }),
    el('h1', { style: { marginTop: '14px' } }, v.state === 'queued' ? 'Waiting in the queue' : 'Analysing your solution'),
    track,
    el('p', { class: 'progress-detail' }, v.detail),
    el('p', { class: 'progress-detail', style: { fontSize: '0.8rem', marginTop: '10px' } }, 'You can reload or come back to this page; it keeps checking the same submission.')));
}

function renderError(err, retry) {
  $('status').replaceChildren(el('div', { class: 'card progress-card fade-in' },
    el('h1', {}, err.status === 404 ? 'Submission not found' : 'Could not load this result'),
    el('div', { style: { margin: '18px 0' } }, alertBox('error', err.message || 'Something went wrong.')),
    el('div', { class: 'row', style: { justifyContent: 'center' } },
      err.status === 404 ? null : el('button', { class: 'btn btn-primary', type: 'button', onclick: retry }, 'Try again'),
      el('a', { class: 'btn', href: 'workspace.html' }, 'New submission'))));
}

function renderEmpty() {
  $('status').replaceChildren(el('div', { class: 'card empty fade-in' },
    el('h2', {}, 'No submission selected'),
    el('p', {}, 'Submit a solution to see its replay here, or open the sample result to see how it works.'),
    el('div', { class: 'row' },
      el('a', { class: 'btn btn-primary', href: 'workspace.html' }, 'New submission'),
      el('a', { class: 'btn', href: 'result.html?sample=1' }, 'Try the sample result'))));
}

/* ---------------- Verdict ---------------- */

function renderVerdict() {
  const v = S.view;
  const tonePill = { good: 'pill-good', bad: 'pill-bad', warn: 'pill-warn', neutral: '' }[v.outcome.tone];
  const notes = el('div', { class: 'verdict-notes' });
  if (v.outcome.message) {
    if (v.outcome.code === 'EXCEPTION') {
      notes.append(el('div', { class: 'alert alert-error', role: 'status' }, icon('alert'),
        el('div', {}, el('strong', {}, 'Your code raised an error. '), el('code', {}, v.outcome.message))));
    } else notes.append(alertBox('warn', v.outcome.message));
  }
  if (v.checkTestNote) notes.append(alertBox('good', v.checkTestNote, 'Passed.'));
  if (v.multipleAnswersNote) notes.append(alertBox('info', v.multipleAnswersNote));

  $('verdict').replaceChildren(el('div', { class: 'verdict' },
    el('div', {},
      el('div', { class: 'verdict-title' },
        el('div', { class: `verdict-icon ${v.verdict.tone}` }, icon(v.passed ? 'check' : 'x')),
        el('h1', { id: 'verdict-title' }, v.verdict.title)),
      S.meta?.question ? el('p', { class: 'verdict-question' }, S.meta.question) : null,
      el('div', { class: 'outputs' },
        el('div', { class: `output-box${v.passed ? '' : ' mismatch'}` }, el('span', { class: 'label' }, 'Your output'), el('span', { class: 'mono' }, v.yourOutput)),
        el('div', { class: 'output-box' }, el('span', { class: 'label' }, 'Expected output'), el('span', { class: 'mono' }, v.expectedOutput))),
      notes),
    el('div', { class: 'verdict-side' },
      el('span', { class: `pill ${tonePill}` }, el('span', { class: 'dot' }), v.outcome.label),
      S.meta?.inputText ? el('span', { class: 'pill', title: 'Failing test input' }, el('span', { class: 'mono' }, S.meta.inputText)) : null)));
}

/* ---------------- Code panes ---------------- */

const PY = /(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(\d+(?:\.\d+)?)\b|\b(def|class|return|if|elif|else|while|for|in|not|and|or|is|None|True|False|import|from|as|pass|break|continue|lambda|try|except|finally|raise|with|yield|global|nonlocal|del|assert|self)\b|\b([A-Za-z_]\w*)(?=\()/g;

function highlight(line) {
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of line.matchAll(PY)) {
    if (m.index > last) frag.append(line.slice(last, m.index));
    const cls = m[1] ? 'tok-com' : m[2] ? 'tok-str' : m[3] ? 'tok-num' : m[4] ? 'tok-kw' : 'tok-fn';
    frag.append(el('span', { class: cls }, m[0]));
    last = m.index + m[0].length;
  }
  if (last < line.length) frag.append(line.slice(last));
  return frag;
}

// Code list with line numbers. Unknown source shows line numbers with redacted bars.
function codeList(code, lineCount, marks = {}) {
  const list = el('ol', { class: 'code' });
  const lines = code != null ? code.split(/\r?\n/) : Array.from({ length: lineCount }, () => null);
  const items = lines.map((text, i) => {
    const n = i + 1;
    const src = el('span', { class: 'src' });
    if (text === null) src.append(el('span', { class: 'redacted', style: { width: `${28 + ((n * 37) % 45)}%` } }));
    else src.append(highlight(text));
    const li = el('li', { class: [marks.diffLine === n ? 'is-diff' : '', marks.added?.has(n) ? 'is-added' : ''].join(' ').trim() || null },
      el('span', { class: 'ln' }, String(n)), src);
    list.append(li);
    return li;
  });
  return { list, items };
}

const maxLine = (trace) => (Array.isArray(trace) ? trace : []).reduce((m, s) => Math.max(m, Number(s && s.line) || 0), 1);

function buildPane(side) {
  const mine = side === 'yours';
  const raw = mine ? S.result.studentTrace : S.result.correctTrace;
  const trace = Array.isArray(raw) ? raw : [];
  const code = mine ? S.studentCode : S.correctCode;
  const fd = S.view.firstDifference;
  const { list, items } = codeList(code, maxLine(trace), { diffLine: mine && fd ? fd.line : null });
  const chips = el('div', { class: 'pane-meta' });
  const varsBody = el('tbody');
  const drawings = el('div', { class: 'drawings' });
  const dataSection = el('div', { class: 'pane-section' }, el('h3', {}, 'Data'), drawings);
  let note = null;
  if (code == null) {
    note = el('div', { class: 'pane-note' }, mine
      ? 'Your code is not stored in this browser, so only line numbers are shown.'
      : 'The correct code stays hidden until hint level 4. The lines it ran and its variables are real.');
  }
  const root = el('div', { class: 'pane' },
    el('div', { class: 'pane-head' },
      el('div', { class: 'pane-title' }, el('span', { class: 'swatch', style: { background: mine ? '#818cf8' : '#34d399' } }), mine ? 'Your run' : 'Verified correct run'),
      chips),
    list, note,
    el('div', { class: 'pane-section' }, el('h3', {}, 'Variables'), el('table', { class: 'vars' },
      el('caption', { class: 'sr-only' }, mine ? 'Your variables at this step' : 'Correct run variables at this step'), varsBody)),
    dataSection);
  return { side, root, items, chips, varsBody, drawings, dataSection, drawMap: new Map() };
}

function buildPanes() {
  const side = S.view.compare.mode === 'side-by-side';
  S.panes = [buildPane('yours')];
  if (side) S.panes.push(buildPane('correct'));
  $('panes').className = side ? 'panes' : 'panes single';
  $('panes').replaceChildren(...S.panes.map((p) => p.root));
}

function renderPane(p, c) {
  const mine = p.side === 'yours';
  const step = mine ? c.yours : c.correct;
  const prev = mine ? c.previousYours : c.previousCorrect;
  const held = mine ? c.yoursHeld : c.correctHeld;
  const other = mine ? c.correct : c.yours;
  const diffs = S.panes.length > 1 ? differingVariables(step, other) : new Set();
  const changed = held ? new Set() : changedVariables(prev, step);
  const line = step ? Number(step.line) : null;

  p.items.forEach((li, i) => li.classList.toggle('is-current', i + 1 === line));
  p.chips.replaceChildren(...[
    step && el('span', { class: 'chip-dark' }, `line ${line}`),
    step && el('span', { class: 'chip-dark' }, step.event),
    held && el('span', { class: 'chip-dark warn' }, `ended at step ${step.step}`),
    mine && c.atDifference && el('span', { class: 'chip-dark bad' }, 'first difference'),
  ].filter(Boolean));

  const vars = (step && step.variables) || {};
  const names = Object.keys(vars);
  p.varsBody.replaceChildren(...(names.length ? names.map((n) => el('tr', {
    class: [changed.has(n) ? 'is-changed' : '', diffs.has(n) ? 'is-differs' : ''].join(' ').trim() || null,
  }, el('th', { scope: 'row', title: n }, n), el('td', {}, formatValue(vars[n])))) : [el('tr', {}, el('td', { class: 'vars-empty', colspan: 2 }, 'No variables yet.'))]));

  let drawn = 0;
  for (const n of names) {
    if (['scalar'].includes(kindOf(vars[n]))) continue;
    let box = p.drawMap.get(n);
    if (!box) {
      box = { root: el('div', { class: 'drawing' }), target: el('div', { class: 'drawing-scroll' }) };
      box.root.append(el('div', { class: 'drawing-name' }, n), box.target);
      p.drawMap.set(n, box);
    }
    if (drawInto(box.target, vars[n], { variables: vars, name: n, diffNames: diffs })) {
      if (box.root.parentNode !== p.drawings) p.drawings.append(box.root);
      drawn++;
    } else box.root.remove();
  }
  for (const [n, box] of p.drawMap) if (!(n in vars)) { box.root.remove(); p.drawMap.delete(n); }
  p.dataSection.hidden = drawn === 0;
}

/* ---------------- Replay controls ---------------- */

function render() {
  const c = S.replay.current();
  $('step-counter').textContent = `Step ${c.step} / ${c.total}`;
  const sc = $('scrubber');
  sc.value = String(c.index);
  sc.style.setProperty('--pct', `${c.total > 1 ? (c.index / (c.total - 1)) * 100 : 0}%`);
  sc.setAttribute('aria-valuetext', `Step ${c.step} of ${c.total}`);
  $('btn-first').disabled = $('btn-back').disabled = c.isFirst;
  $('btn-next').disabled = $('btn-last').disabled = c.isLast;
  $('btn-jump').classList.toggle('btn-primary', !c.atDifference);
  for (const p of S.panes) renderPane(p, c);
  const callout = $('callout');
  if (callout) callout.classList.toggle('is-at', c.atDifference);
}

function setPlaying(on) {
  clearInterval(S.timer);
  S.timer = null;
  const b = $('btn-play');
  b.replaceChildren(icon(on ? 'pause' : 'play'));
  b.setAttribute('aria-label', on ? 'Pause' : 'Play');
  b.classList.toggle('is-playing', on);
  if (!on) return;
  if (S.replay.current().isLast) S.replay.first();
  S.pauseAtDiff = S.replay.current().index < S.replay.differenceIndex;
  S.timer = setInterval(() => {
    const c = S.replay.next();
    render();
    if (c.isLast || (S.pauseAtDiff && c.atDifference)) setPlaying(false);
  }, Number($('speed').value));
}

const act = (fn) => () => { setPlaying(false); fn(); render(); };

let wired = false;
function wireControls() {
  if (wired) return;
  wired = true;
  $('btn-first').append(icon('first'));
  $('btn-back').append(icon('back'));
  $('btn-next').append(icon('next'));
  $('btn-last').append(icon('last'));
  setPlaying(false);
  $('btn-first').addEventListener('click', act(() => S.replay.first()));
  $('btn-back').addEventListener('click', act(() => S.replay.back()));
  $('btn-next').addEventListener('click', act(() => S.replay.next()));
  $('btn-last').addEventListener('click', act(() => S.replay.last()));
  $('btn-play').addEventListener('click', () => setPlaying(!S.timer));
  $('speed').addEventListener('change', () => { if (S.timer) setPlaying(true); });
  $('scrubber').addEventListener('input', (e) => { setPlaying(false); S.replay.goTo(Number(e.target.value)); render(); });
  $('btn-jump').addEventListener('click', act(() => S.replay.jumpToDifference()));
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.altKey || e.ctrlKey || e.metaKey || t.closest?.('input, textarea, select, [contenteditable]')) return;
    if ([' ', 'Home', 'End'].includes(e.key) && t.closest?.('button, a')) return;
    const map = {
      ArrowRight: () => S.replay.next(), ArrowLeft: () => S.replay.back(),
      Home: () => S.replay.first(), End: () => S.replay.last(),
      d: () => S.replay.jumpToDifference(), D: () => S.replay.jumpToDifference(),
    };
    if (e.key === ' ') { e.preventDefault(); setPlaying(!S.timer); return; }
    if (map[e.key]) { e.preventDefault(); act(map[e.key])(); }
  });
}

function renderReplay() {
  const r = S.result;
  const trace = Array.isArray(r.studentTrace) ? r.studentTrace : [];
  const side = S.view.compare.mode === 'side-by-side';
  $('replay-mode').textContent = side ? 'Your run vs verified correct run' : 'Your run only';
  if (!trace.length) {
    $('replay-body').replaceChildren(el('div', { class: 'empty' },
      el('h2', {}, 'No steps were recorded'),
      el('p', {}, r.outcome === 'UNSUPPORTED' ? 'This question type cannot be replayed yet.' : 'Your code did not reach any traced line, so there is nothing to replay.')));
    return;
  }
  S.replay = createReplay(trace, side ? r.correctTrace : null, S.view.firstDifference);
  const notes = $('replay-notes');
  notes.replaceChildren();
  const fd = S.view.firstDifference;
  if (fd) {
    notes.append(el('div', { class: 'callout', id: 'callout', role: 'note' }, icon('target'),
      el('div', {}, el('strong', {}, differenceCallout(fd)),
        el('div', { style: { marginTop: '4px', fontSize: '0.85rem', color: '#991b1b' } },
          'Both runs are aligned step by step. Up to this step they match; from here they part.'))));
  } else {
    notes.append(el('div', { style: { margin: '14px 16px 0' } }, alertBox('info', `${S.view.compare.reason} Compare your output with the expected output above.`)));
  }
  const sc = $('scrubber');
  sc.max = String(Math.max(S.replay.total - 1, 0));
  $('scale-end').textContent = String(S.replay.total);
  const jump = $('btn-jump');
  jump.replaceChildren(icon('target'), 'Jump to first difference');
  jump.hidden = S.replay.differenceIndex < 0;
  const marker = $('diff-marker');
  if (S.replay.differenceIndex >= 0 && S.replay.total > 1) {
    const pct = S.replay.differenceIndex / (S.replay.total - 1);
    marker.style.left = `calc(16px + 9px + (100% - 32px - 18px) * ${pct})`;
    marker.dataset.label = `step ${S.replay.differenceIndex + 1}`;
    marker.hidden = false;
  }
  buildPanes();
  wireControls();
  if (S.replay.differenceIndex >= 0) S.replay.jumpToDifference();
  render();
}

/* ---------------- AI mentor panel ---------------- */

function renderExplanation(body) {
  const ex = S.view.explanation;
  if (!ex) {
    body.append(alertBox('info', S.view.noExplanationMessage));
    return;
  }
  const parts = [['What', 'What happened', ex.what], ['Where', 'Where it goes wrong', ex.where], ['Why', 'Why it is wrong', ex.why]];
  const tabs = el('div', { class: 'reveal-steps', role: 'tablist', 'aria-label': 'Explanation steps' });
  const list = el('div', { class: 'explain-list', 'aria-live': 'polite' });
  const more = el('button', { class: 'btn btn-sm', type: 'button' });
  const paint = () => {
    tabs.replaceChildren(...parts.map(([short], i) => el('button', {
      class: 'reveal-tab', type: 'button', role: 'tab', 'aria-selected': String(i < S.revealed),
      disabled: i > S.revealed ? true : null,
      onclick: () => { S.revealed = Math.max(S.revealed, i + 1); paint(); },
    }, el('span', { class: 'n' }, String(i + 1)), short)));
    list.replaceChildren(...parts.slice(0, S.revealed).map(([, title, text]) => el('div', { class: 'explain-item' }, el('h3', {}, title), el('p', {}, text))));
    more.hidden = S.revealed >= 3;
    more.textContent = S.revealed === 1 ? 'Show where' : 'Show why';
  };
  more.addEventListener('click', () => { S.revealed = Math.min(3, S.revealed + 1); paint(); });
  paint();
  body.append(tabs, list, el('div', { style: { marginTop: '12px' } }, more));
}

function hintKey() { return `mentorlens.hints.${S.id}`; }

async function requestHint() {
  if (S.hintBusy) return;
  S.hintBusy = true;
  S.hintError = null;
  paintHints();
  // Sample hints are local; real ones come from GET /api/submissions/{id}/hints/next.
  const sampleApi = { nextHint: async () => sampleHint(Math.min(topLevel(S.hints) + 1, 4)) };
  const out = await requestNextHint(S.sample ? sampleApi : api, S.id, S.hints);
  S.hints = out.hints;
  S.hintError = out.error;
  if (out.correctCode && out.correctCode !== S.correctCode) {
    S.correctCode = out.correctCode;
    if (S.panes.length > 1) { S.panes[1] = buildPane('correct'); $('panes').replaceChildren(...S.panes.map((p) => p.root)); render(); }
  }
  if (!S.sample) storeJson(hintKey(), hintsForStorage(S.hints));
  S.hintBusy = false;
  paintHints();
}

let hintHost = null;
function paintHints() {
  if (!hintHost) return;
  const top = topLevel(S.hints);
  const gap = missingLevels(S.hints);
  const ladder = el('div', { class: 'ladder', role: 'list', 'aria-label': `Hint level ${top} of 4` },
    el('div', { class: 'ladder-fill', style: { width: `${(Math.max(top - 1, 0) / 3) * 75}%` } }),
    HINT_NAMES.map((name, i) => el('div', { class: `rung${i < top ? ' is-on' : ''}`, role: 'listitem' },
      el('span', { class: 'dot' }, String(i + 1)), name)));
  const list = el('div', { class: 'hint-list', 'aria-live': 'polite' }, gap.length ? el('div', { class: 'hint' },
    el('div', { class: 'hint-level' }, `Level${gap.length > 1 ? 's' : ''} ${gap.join(', ')}`),
    el('p', {}, 'Earlier hints were opened on another device or in another session, so they are not shown here.')) : null, S.hints.map((h) => {
    const card = el('div', { class: 'hint' },
      el('div', { class: 'hint-level' }, `Level ${h.level} · ${HINT_NAMES[h.level - 1] || ''}`),
      el('p', {}, h.text));
    if (h.level === 4 && h.correctCode) card.append(fixBlock(h.correctCode));
    else if (h.level === 4) card.append(el('p', { style: { color: 'var(--muted)', fontSize: '0.85rem', marginTop: '6px' } }, 'The correct code is not saved in this browser. Show it again below.'));
    return card;
  }));
  const next = top + 1;
  const again = top >= 4 && !S.correctCode; // level 4 repeats, so the code can be fetched again
  const button = el('button', {
    class: `btn ${top < 4 || again ? 'btn-primary' : ''} btn-block`, type: 'button',
    disabled: S.hintBusy || (top >= 4 && !again) ? true : null, onclick: requestHint,
  }, S.hintBusy ? [el('span', { class: 'spinner' }), 'Loading hint'] : again ? 'Show the correct version again' : top >= 4 ? 'All hints shown' : `Show hint ${next} · ${HINT_NAMES[next - 1]}`);
  hintHost.replaceChildren(...[ladder, list,
    S.hintError && el('div', { style: { marginBottom: '10px' } }, alertBox('error', S.hintError)), button,
    top < 4 && el('p', { style: { color: 'var(--muted)', fontSize: '0.8rem', marginTop: '8px', textAlign: 'center' } }, 'Try each hint before asking for the next one. Level 4 shows the full fix.'),
  ].filter(Boolean));
}

function fixBlock(correct) {
  const known = S.studentCode != null;
  const diff = known ? lineDiff(S.studentCode, correct) : correct.split(/\r?\n/).map((text, i) => ({ n: i + 1, text, changed: false }));
  const added = new Set(diff.filter((d) => d.changed).map((d) => d.n));
  const { list } = codeList(correct, 0, { added });
  return el('div', { class: 'fix-code' },
    el('div', { class: 'pane-head' }, el('span', { class: 'pane-title' }, 'Correct version'),
      el('span', { class: 'pane-meta' }, el('span', { class: 'chip-dark' }, known ? `${added.size} changed line${added.size === 1 ? '' : 's'}` : 'your code not stored here'))),
    list);
}

function renderMentor() {
  const v = S.view;
  const body = el('div', { class: 'card-body' });
  renderExplanation(body);
  const head = el('div', { class: 'card-head' },
    el('div', { class: 'row' }, icon('sparkle'), el('h2', { id: 'mentor-title' }, 'AI mentor')),
    v.mistakeType ? el('span', { class: 'pill pill-accent', title: 'Mistake type' }, v.mistakeType) : null);
  head.firstChild.firstChild.setAttribute('style', 'width:18px;height:18px;color:var(--accent)');
  const sections = [head, body];
  if (v.explanation) {
    hintHost = el('div', { class: 'card-body', style: { borderTop: '1px solid var(--border)' } });
    const stored = S.sample ? null : loadJson(hintKey());
    const valid = Array.isArray(stored) ? stored.filter((h) => h && Number.isInteger(h.level) && h.level >= 1 && h.level <= 4) : [];
    S.hints = valid.length ? hintsForStorage(valid) : v.hint ? [{ level: v.hint.level || 1, text: v.hint.text, correctCode: null }] : [];
    sections.push(el('div', { class: 'card-head', style: { borderTop: '1px solid var(--border)' } }, el('h2', {}, 'Hints')), hintHost);
    paintHints();
  }
  $('mentor').replaceChildren(...sections);
}

function scoreRing(score) {
  const r = 38;
  const len = 2 * Math.PI * r;
  const color = score >= 80 ? 'var(--good)' : score >= 50 ? '#d97706' : 'var(--bad)';
  const value = svg('circle', { class: 'value', cx: 46, cy: 46, r, stroke: color, 'stroke-dasharray': len, 'stroke-dashoffset': len });
  const ring = svg('svg', { class: 'ring', viewBox: '0 0 92 92', role: 'img', 'aria-label': `Code quality score ${score} out of 100` },
    svg('circle', { class: 'track', cx: 46, cy: 46, r }), value,
    svg('text', { x: 46, y: 46, 'text-anchor': 'middle', 'dominant-baseline': 'central' }));
  ring.lastChild.textContent = String(score);
  requestAnimationFrame(() => requestAnimationFrame(() => value.setAttribute('stroke-dashoffset', String(len * (1 - score / 100)))));
  return ring;
}

function renderQuality() {
  const v = S.view;
  const body = el('div', { class: 'card-body metric-list' });
  if (v.showScore) {
    body.append(el('div', { class: 'score' }, scoreRing(v.score),
      el('div', { class: 'score-copy' }, el('h3', {}, 'Code quality'), el('p', {}, 'A guide to readability and structure, not a grade.'))));
  }
  if (v.complexity) {
    if (body.children.length) body.append(el('div', { class: 'divider' }));
    body.append(el('h3', {}, 'Complexity'), el('div', { class: 'metric-row' },
      v.complexity.time ? el('span', { class: 'complexity' }, el('span', {}, 'Time'), el('span', {}, v.complexity.time)) : null,
      v.complexity.space ? el('span', { class: 'complexity' }, el('span', {}, 'Space'), el('span', {}, v.complexity.space)) : null));
  }
  if (v.mistakeType) {
    if (body.children.length) body.append(el('div', { class: 'divider' }));
    body.append(el('h3', {}, 'Mistake type'), el('div', { class: 'metric-row' }, el('span', { class: 'pill pill-accent' }, v.mistakeType)));
  }
  if (!body.children.length) body.append(el('p', { style: { color: 'var(--muted)' } }, 'No quality details are available for this submission.'));
  $('quality').replaceChildren(el('div', { class: 'card-head' }, el('h2', { id: 'quality-title' }, 'Quality')), body);
}

/* ---------------- Boot ---------------- */

function renderResult(sub) {
  S.result = sub.result;
  S.view = resultView(sub.result);
  $('status').replaceChildren();
  $('result').hidden = false;
  renderVerdict();
  renderMentor(); // sets the correct code from a stored level 4 hint before the panes are built
  renderQuality();
  renderReplay();
}

async function loadSample() {
  S.sample = true;
  S.id = 'sample';
  $('banner').replaceChildren(el('div', { class: 'banner', role: 'note' }, icon('flask'), el('div', {}, el('strong', {}, SAMPLE_BANNER))));
  $('banner').hidden = false;
  S.meta = { question: SAMPLE_QUESTION, inputText: SAMPLE_INPUT, expectedText: SAMPLE_EXPECTED };
  S.studentCode = SAMPLE_CODE;
  S.correctCode = SAMPLE_CORRECT_CODE;
  try {
    const [wrong, correct] = await Promise.all(['two_sum_wrong', 'two_sum_correct'].map(async (n) => {
      const res = await fetch(`sample/${n}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }));
    renderResult(buildSampleSubmission(wrong, correct));
  } catch (err) {
    renderError({ message: `Could not load the recorded sample runs (${err.message}). Serve the frontend folder over HTTP, for example with python -m http.server 5173 --directory frontend.` }, loadSample);
  }
}

async function loadSubmission() {
  renderStatus({ status: 'QUEUED', queuePosition: 0 });
  try {
    const sub = await pollSubmission(api, S.id, { onUpdate: (s) => { if (s.status !== 'DONE') renderStatus(s); } });
    if (sub.status === 'DONE' && sub.result) renderResult(sub);
    else renderStatus(sub.status === 'DONE' ? { status: 'FAILED', error: 'The analysis finished without a result.' } : sub);
  } catch (err) {
    if (err.status !== 401) renderError(err, loadSubmission);
  }
}

const loc = readLocation(location.search);
renderTopBar(loc.sample ? 'sample' : null);
if (loc.sample) loadSample();
else if (!loc.id) renderEmpty();
else if (requireAuth()) {
  S.id = loc.id;
  S.meta = loadJson(`mentorlens.sub.${loc.id}`);
  S.studentCode = typeof S.meta?.code === 'string' ? S.meta.code : null;
  loadSubmission();
}
