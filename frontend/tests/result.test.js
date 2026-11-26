import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, TOKEN_KEY } from '../js/api.js';
import { readLocation, pollSubmission, progressView, resultView, lineDiff } from '../js/result-model.js';
import { buildSampleSubmission, SAMPLE_CODE, SAMPLE_CORRECT_CODE } from '../js/sample.js';
import { memoryStorage, fakeFetch, trace } from './helpers.js';

const base = 'http://localhost:8080';
const apiWith = (fetch) => createApi({ fetch, storage: memoryStorage({ [TOKEN_KEY]: 't' }), baseUrl: base });
const done = (result) => ({ status: 'DONE', queuePosition: 0, error: null, result });
const baseResult = {
  outcome: 'NORMAL', error: null, passed: false, actualOutput: [], expectedOutput: [1, 2],
  studentTrace: [], correctTrace: [], firstDifference: { step: 8, line: 9, variable: 'left', yours: 1, correct: 0 },
  explanation: { what: 'a', where: 'b', why: 'c' }, mistakeType: 'x',
  complexity: { time: 'O(n)', space: 'O(1)' }, score: 72, hint: { level: 1, text: 'h' },
};

test('pollsUntilDone', async () => {
  const fetch = fakeFetch([
    { status: 200, body: { status: 'QUEUED', queuePosition: 2, error: null, result: null } },
    { status: 200, body: { status: 'RUNNING', queuePosition: 0, error: null, result: null } },
    { status: 200, body: done(baseResult) },
  ]);
  const sleeps = [];
  const states = [];
  const final = await pollSubmission(apiWith(fetch), 'abc', {
    sleep: async (ms) => { sleeps.push(ms); },
    onUpdate: (s) => states.push(progressView(s)),
  });
  assert.equal(final.status, 'DONE');
  assert.equal(fetch.calls.length, 3);
  assert.deepEqual(sleeps, [2000, 2000]);
  assert.deepEqual(states.map((s) => s.state), ['queued', 'running', 'done']);
  assert.match(states[0].detail, /2/);
});

test('reloadUsesIdFromUrlWithoutResubmit', async () => {
  const { id, sample } = readLocation('?id=abc123');
  assert.equal(id, 'abc123');
  assert.equal(sample, false);
  const fetch = fakeFetch([{ status: 200, body: done(baseResult) }]);
  await pollSubmission(apiWith(fetch), id, { sleep: async () => {} });
  assert.ok(fetch.calls.length >= 1);
  for (const c of fetch.calls) {
    assert.equal(c.method, 'GET');
    assert.equal(c.url, `${base}/api/submissions/abc123`);
  }
  assert.equal(readLocation('?sample=1').sample, true);
  assert.equal(readLocation('').id, null);
});

test('failedShowsMessage', () => {
  const v = progressView({ status: 'FAILED', queuePosition: 0, error: 'The runner stopped unexpectedly', result: null });
  assert.equal(v.state, 'failed');
  assert.equal(v.detail, 'The runner stopped unexpectedly');
});

test('nullExplanationShowsNoCheckedExplanation', () => {
  const v = resultView({ ...baseResult, explanation: null });
  assert.equal(v.explanation, null);
  assert.match(v.noExplanationMessage, /No checked explanation is available/);
  const w = resultView({ ...baseResult, explanation: null, score: null, noCheckedExplanation: true });
  assert.match(w.noExplanationMessage, /No checked explanation is available/);
  assert.equal(resultView(baseResult).noExplanationMessage, null);
});

test('nullScoreHidesScore', () => {
  assert.equal(resultView({ ...baseResult, score: null }).showScore, false);
  assert.equal(resultView(baseResult).showScore, true);
});

test('unsupportedShowsMessage', () => {
  const v = resultView({ ...baseResult, outcome: 'UNSUPPORTED' });
  assert.equal(v.outcome.code, 'UNSUPPORTED');
  assert.match(v.outcome.message, /not supported yet/i);
});

test('passedAsksToCheckTest', () => {
  const v = resultView({ ...baseResult, passed: true, actualOutput: [1, 2] });
  assert.match(v.checkTestNote, /failing test/);
  assert.equal(v.multipleAnswersNote, null);
  assert.equal(resultView(baseResult).checkTestNote, null);
  assert.match(resultView(baseResult).multipleAnswersNote, /several valid answers/);
});

test('singlePaneWhenNoCorrectRunOrNoDifference', () => {
  const noRun = resultView({ ...baseResult, correctTrace: null, firstDifference: null });
  assert.equal(noRun.compare.mode, 'single');
  assert.equal(noRun.compare.reason, 'Only your run is shown.');
  assert.match(resultView({ ...baseResult, firstDifference: null }).compare.reason, /different approach/);
  assert.equal(resultView(baseResult).compare.mode, 'side-by-side');
});

test('exceptionShowsErrorText', () => {
  const v = resultView({ ...baseResult, outcome: 'EXCEPTION', error: 'IndexError: list index out of range' });
  assert.equal(v.outcome.message, 'IndexError: list index out of range');
});

test('lineDiffMarksChangedLines', () => {
  assert.deepEqual(lineDiff('a\nb\nc\nd', 'a\nd\nc\nb').map((l) => l.changed), [false, true, false, true]);
  assert.deepEqual(lineDiff('a\nb', 'a\nx\nb').map((l) => l.changed), [false, true, false]);
  assert.deepEqual(lineDiff(SAMPLE_CODE, SAMPLE_CORRECT_CODE).filter((l) => l.changed).map((l) => l.n), [9, 11]);
});

test('sampleIsADoneResultFromTheRecordedRuns', () => {
  const s = buildSampleSubmission(trace('two_sum_wrong'), trace('two_sum_correct'));
  assert.equal(s.status, 'DONE');
  assert.deepEqual(s.result.firstDifference, { step: 8, line: 9, variable: 'left', yours: 1, correct: 0 });
  assert.deepEqual(s.result.actualOutput, []);
  assert.equal(resultView(s.result).compare.mode, 'side-by-side');
});

/* ---- fix round 1 ---- */
import { requestNextHint, applyHint, missingLevels, hintsForStorage } from '../js/result-model.js';

const L1 = [{ level: 1, text: 'nudge', correctCode: null }];

test('nextHintCallsHintsEndpointAndAppendsLevel', async () => {
  const fetch = fakeFetch([{ status: 200, body: { level: 2, text: 'pointer', correctCode: null } }]);
  const out = await requestNextHint(apiWith(fetch), 'abc', L1);
  assert.equal(fetch.calls[0].url, `${base}/api/submissions/abc/hints/next`);
  assert.equal(fetch.calls[0].headers.Authorization, 'Bearer t');
  assert.deepEqual(out.hints.map((h) => h.level), [1, 2]);
  assert.equal(out.error, null);
});

test('correctCodeNeverAppearsBeforeLevel4', async () => {
  const fetch = fakeFetch([
    { status: 200, body: { level: 2, text: 'p', correctCode: 'leaked' } },
    { status: 200, body: { level: 3, text: 'g', correctCode: 'leaked' } },
    { status: 200, body: { level: 4, text: 'fix', correctCode: 'class Solution: pass' } },
  ]);
  const api = apiWith(fetch);
  let hints = L1;
  for (const expected of [null, null]) {
    const out = await requestNextHint(api, 'abc', hints);
    hints = out.hints;
    assert.equal(out.correctCode, expected);
    assert.ok(hints.every((h) => h.correctCode === null));
  }
  const last = await requestNextHint(api, 'abc', hints);
  assert.equal(last.correctCode, 'class Solution: pass');
  assert.equal(last.hints.at(-1).correctCode, 'class Solution: pass');
});

test('level4RepeatsWithoutDuplicating', async () => {
  const hints = [...L1, { level: 2, text: 'p', correctCode: null }, { level: 3, text: 'g', correctCode: null }, { level: 4, text: 'fix', correctCode: null }];
  const fetch = fakeFetch([{ status: 200, body: { level: 4, text: 'fix', correctCode: 'code' } }]);
  const out = await requestNextHint(apiWith(fetch), 'abc', hints);
  assert.equal(out.hints.length, 4);
  assert.equal(out.correctCode, 'code');
});

test('hint404ShowsMessageAndKeepsHints', async () => {
  const fetch = fakeFetch([{ status: 404, body: { error: 'Submission not found' } }]);
  const out = await requestNextHint(apiWith(fetch), 'abc', L1);
  assert.deepEqual(out.hints, L1);
  assert.match(out.error, /Submission not found/);
});

test('skippedHintLevelsAreShownAsAGap', () => {
  const out = applyHint(L1, { level: 3, text: 'g', correctCode: null });
  assert.deepEqual(out.gap, [2]);
  assert.deepEqual(missingLevels(out.hints), [2]);
  assert.equal(applyHint(L1, { level: 2, text: 'p' }).gap, null);
});

test('storedHintsDropCorrectCode', () => {
  const stored = hintsForStorage([{ level: 4, text: 'fix', correctCode: 'code' }]);
  assert.equal(stored[0].correctCode, null);
});

test('transientFetchFailureIsRetried', async () => {
  let n = 0;
  const api = { getSubmission: async () => { n += 1; if (n < 3) { const e = new Error('offline'); e.status = 0; throw e; } return done(baseResult); } };
  const sleeps = [];
  const out = await pollSubmission(api, 'abc', { sleep: async (ms) => { sleeps.push(ms); } });
  assert.equal(out.status, 'DONE');
  assert.deepEqual(sleeps, [2000, 4000]);
  const dead = { getSubmission: async () => { const e = new Error('offline'); e.status = 0; throw e; } };
  await assert.rejects(pollSubmission(dead, 'abc', { sleep: async () => {} }), /offline/);
});

test('unknownStatusStopsPolling', async () => {
  const fetch = fakeFetch([{ status: 200, body: { status: 'WEIRD', queuePosition: 0, error: null, result: null } }]);
  const out = await pollSubmission(apiWith(fetch), 'abc', { sleep: async () => { throw new Error('should not sleep'); } });
  assert.equal(out.status, 'WEIRD');
  assert.equal(fetch.calls.length, 1);
  assert.equal(progressView(out).state, 'failed');
});

test('passedWithNoDifferenceSaysRunsMatched', () => {
  const v = resultView({ ...baseResult, passed: true, firstDifference: null });
  assert.match(v.compare.reason, /matched the verified correct run/);
});
