import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindOf, pointersFor } from '../js/drawings.js';

test('kindOfRecognisesDataShapes', () => {
  assert.equal(kindOf([2, 7, 11, 15]), 'array');
  assert.equal(kindOf('abc'), 'string');
  assert.equal(kindOf({ a: 1, b: 2 }), 'dict');
  assert.equal(kindOf([[1, 2], [3, 4]]), 'matrix');
  assert.equal(kindOf({ val: 1, next: { val: 2, next: null } }), 'linked');
  assert.equal(kindOf({ val: 1, left: { val: 2, left: null, right: null }, right: null }), 'tree');
  assert.equal(kindOf([{ val: 1 }, { val: 2 }]), 'nodes');
  assert.equal(kindOf(9), 'scalar');
  assert.equal(kindOf({ a: { deep: [1] } }), 'json');
});

test('integerIndexesBecomePointers', () => {
  const vars = { numbers: [2, 7, 11, 15], target: 9, left: 1, right: 3, total: 17, flag: true };
  assert.deepEqual(pointersFor(vars.numbers, vars, 'numbers'), [{ name: 'left', index: 1 }, { name: 'right', index: 3 }]);
});
