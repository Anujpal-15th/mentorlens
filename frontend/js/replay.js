// Synced stepping over two recorded runs. No DOM.
// Runs are aligned by step index, the same way the backend's RunComparer aligns them.
import { formatValue, sameValue } from './format.js';

export function createReplay(yours, correct, firstDifference) {
  const mine = Array.isArray(yours) ? yours : [];
  const theirs = Array.isArray(correct) ? correct : null;
  const total = Math.max(mine.length, theirs ? theirs.length : 0);
  let index = 0;

  let differenceIndex = -1;
  if (firstDifference && theirs && total > 0) {
    const found = mine.findIndex((s) => s.step === firstDifference.step);
    differenceIndex = found >= 0 ? found : Math.min(Math.max(firstDifference.step - 1, 0), total - 1);
  }

  const at = (run, i) => (run && run.length ? run[Math.min(i, run.length - 1)] : null);

  function current() {
    return {
      index,
      step: index + 1,
      total,
      yours: at(mine, index),
      correct: theirs ? at(theirs, index) : null,
      previousYours: index > 0 ? at(mine, index - 1) : null,
      previousCorrect: theirs && index > 0 ? at(theirs, index - 1) : null,
      yoursHeld: index >= mine.length,
      correctHeld: theirs ? index >= theirs.length : false,
      atDifference: index === differenceIndex,
      isFirst: index === 0,
      isLast: index >= total - 1,
    };
  }

  function goTo(i) {
    index = Math.max(0, Math.min(Number.isFinite(i) ? Math.trunc(i) : 0, Math.max(total - 1, 0)));
    return current();
  }

  return {
    total,
    differenceIndex,
    current,
    goTo,
    next: () => goTo(index + 1),
    back: () => goTo(index - 1),
    first: () => goTo(0),
    last: () => goTo(total - 1),
    jumpToDifference: () => (differenceIndex >= 0 ? goTo(differenceIndex) : current()),
  };
}

const vars = (step) => (step && step.variables && typeof step.variables === 'object' ? step.variables : {});

// Names present in both steps whose values differ.
export function differingVariables(a, b) {
  const out = new Set();
  if (!a || !b) return out;
  const va = vars(a);
  const vb = vars(b);
  for (const name of Object.keys(va)) {
    if (name in vb && !sameValue(va[name], vb[name])) out.add(name);
  }
  return out;
}

// Names that are new or changed since the previous step of the same run.
export function changedVariables(prev, cur) {
  const out = new Set();
  if (!prev || !cur) return out;
  const vp = vars(prev);
  for (const [name, value] of Object.entries(vars(cur))) {
    if (!(name in vp) || !sameValue(vp[name], value)) out.add(name);
  }
  return out;
}

export function differenceCallout(fd) {
  if (!fd) return null;
  if (fd.variable == null) {
    return `At step ${fd.step} one run ended while the other kept going. Line ${fd.line} is where they part.`;
  }
  return `At step ${fd.step} your ${fd.variable} is ${formatValue(fd.yours)}, the correct value is ${formatValue(fd.correct)}. Line ${fd.line} caused it.`;
}
