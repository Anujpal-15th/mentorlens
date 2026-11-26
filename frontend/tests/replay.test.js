import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReplay, differingVariables, changedVariables, differenceCallout } from '../js/replay.js';
import { trace } from './helpers.js';

// Real recorded runs of tests/samples/two_sum_sorted_wrong_pointer.py and its fixed version.
const wrong = trace('two_sum_wrong');
const correct = trace('two_sum_correct');
const fd = { step: 8, line: 9, variable: 'left', yours: 1, correct: 0 };

test('startsAtStepOne', () => {
  const r = createReplay(wrong, correct, fd);
  assert.equal(r.current().step, 1);
  assert.equal(r.current().yours.step, 1);
  assert.equal(r.current().correct.step, 1);
  assert.ok(r.current().isFirst);
});

test('backStopsAtStart', () => {
  const r = createReplay(wrong, correct, fd);
  r.back();
  assert.equal(r.back().step, 1);
});

test('nextStopsAtEnd', () => {
  const r = createReplay(wrong, correct, fd);
  for (let i = 0; i < 50; i++) r.next();
  assert.equal(r.current().step, 20);
  assert.ok(r.current().isLast);
});

test('shorterRunHoldsLastStep', () => {
  const r = createReplay(wrong, correct, fd);
  const c = r.last();
  assert.equal(c.yours.step, 20);
  assert.equal(c.correct.step, 17);
  assert.equal(c.correctHeld, true);
  assert.equal(c.yoursHeld, false);
});

test('jumpGoesToStep8', () => {
  const r = createReplay(wrong, correct, fd);
  const c = r.jumpToDifference();
  assert.equal(c.step, 8);
  assert.ok(c.atDifference);
  assert.equal(c.yours.variables.left, 1);
  assert.equal(c.correct.variables.left, 0);
  assert.deepEqual([...differingVariables(c.yours, c.correct)].sort(), ['left', 'right']);
  assert.deepEqual([...changedVariables(wrong[6], c.yours)], ['left']);
  assert.equal(differenceCallout(fd), 'At step 8 your left is 1, the correct value is 0. Line 9 caused it.');
});

test('noCorrectRunStillPlaysYours', () => {
  const r = createReplay(wrong, null, null);
  assert.equal(r.total, 20);
  assert.equal(r.next().step, 2);
  assert.equal(r.current().correct, null);
  assert.equal(r.jumpToDifference().step, 2);
  assert.equal(r.differenceIndex, -1);
});

test('emptyRunDoesNotCrash', () => {
  const r = createReplay([], null, null);
  assert.equal(r.total, 0);
  assert.equal(r.next().yours, null);
});
