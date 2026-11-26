// Draws trace values: arrays with index pointers, strings, dicts, matrices, linked lists and trees.
// `kindOf` is pure; the draw functions need a DOM. Anything unrecognised falls back to JSON.
import { formatValue } from './format.js';

const MAX_CELLS = 60;
const MAX_NODES = 63;
const isPrim = (v) => v === null || ['number', 'string', 'boolean'].includes(typeof v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nodeVal = (o) => ('val' in o ? o.val : o.value);
const looksTree = (o) => isObj(o) && ('val' in o || 'value' in o) && ('left' in o || 'right' in o);
const looksLinked = (o) => isObj(o) && ('val' in o || 'value' in o) && 'next' in o;

export function kindOf(v) {
  if (typeof v === 'string') return v.length > 0 && v.length <= MAX_CELLS ? 'string' : 'scalar';
  if (Array.isArray(v)) {
    if (v.length === 0) return 'array';
    if (v.length <= MAX_CELLS && v.every(isPrim)) return 'array';
    if (v.length <= 20 && v.every((r) => Array.isArray(r) && r.length <= 20 && r.every(isPrim))) return 'matrix';
    if (v.length <= MAX_CELLS && v.every((n) => isObj(n) && ('val' in n || 'value' in n))) return 'nodes';
    return 'json';
  }
  if (isObj(v)) {
    if (looksTree(v)) return 'tree';
    if (looksLinked(v)) return 'linked';
    const entries = Object.values(v);
    return entries.length <= 40 && entries.every(isPrim) ? 'dict' : 'json';
  }
  return 'scalar';
}

// Integer variables that are valid indexes of `arr` become pointers under it.
export function pointersFor(arr, variables, ownName) {
  if (!Array.isArray(arr) && typeof arr !== 'string') return [];
  const out = [];
  for (const [name, v] of Object.entries(variables || {})) {
    if (name !== ownName && Number.isInteger(v) && v >= 0 && v < arr.length) out.push({ name, index: v });
  }
  return out;
}

const h = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const short = (v) => (typeof v === 'string' ? JSON.stringify(v) : formatValue(v));

function drawCells(items, pointers, { chars = false, diffNames = new Set() } = {}) {
  const wrap = h('div', chars ? 'arr chars' : 'arr');
  const cells = h('div', 'arr-cells');
  const pointed = new Set(pointers.map((p) => p.index));
  items.forEach((item, i) => {
    const text = chars ? item : short(item);
    const c = h('div', `cell${text.length > 4 ? ' wide' : ''}${pointed.has(i) ? ' is-pointed' : ''}`);
    c.append(h('span', '', text), h('span', 'idx', String(i)));
    cells.append(c);
  });
  if (!items.length) cells.append(h('div', 'cell wide', 'empty'));
  wrap.append(cells);
  if (pointers.length) wrap.append(drawPointers(pointers, diffNames));
  wrap.dataset.sig = `${chars ? 's' : 'a'}:${items.length}:${items.map((x) => String(x).length > 4 ? 'w' : 'n').join('')}`;
  return wrap;
}

function drawPointers(pointers, diffNames) {
  const row = h('div', 'ptrs');
  const stack = {};
  for (const p of pointers) {
    const level = (stack[p.index] = (stack[p.index] ?? -1) + 1);
    const ptr = h('div', `ptr${diffNames.has(p.name) ? ' is-diff' : ''}`, p.name);
    ptr.dataset.name = p.name;
    ptr.style.transform = `translate(calc(${p.index} * (var(--cell) + var(--gap))), ${level * 22}px)`;
    row.append(ptr);
  }
  row.style.height = `${24 + Math.max(0, ...Object.values(stack)) * 22}px`;
  return row;
}

function drawDict(obj) {
  const t = h('table', 'dict');
  const body = h('tbody');
  for (const [k, v] of Object.entries(obj)) {
    const tr = h('tr');
    tr.append(h('td', '', JSON.stringify(k)), h('td', '', short(v)));
    body.append(tr);
  }
  if (!body.children.length) { const tr = h('tr'); tr.append(h('td', '', '{}')); body.append(tr); }
  t.append(body);
  return t;
}

function drawMatrix(rows) {
  const t = h('table', 'matrix');
  const body = h('tbody');
  for (const r of rows) {
    const tr = h('tr');
    for (const v of r) tr.append(h('td', '', short(v)));
    body.append(tr);
  }
  t.append(body);
  return t;
}

function drawChain(values, truncated) {
  const c = h('div', 'chain');
  values.forEach((v, i) => {
    if (i) c.append(h('span', 'arrow', '→'));
    c.append(h('div', 'node', short(v)));
  });
  c.append(h('span', 'arrow', '→'), h('span', 'null', truncated ? '…' : 'None'));
  return c;
}

function linkedValues(head) {
  const out = [];
  let n = head;
  while (looksLinked(n) && out.length < MAX_NODES) { out.push(nodeVal(n)); n = n.next; }
  if (isObj(n) && ('val' in n || 'value' in n) && out.length < MAX_NODES) out.push(nodeVal(n));
  return { values: out, truncated: out.length >= MAX_NODES };
}

function drawTree(node, budget = { left: MAX_NODES }, depth = 0) {
  if (!isObj(node) || budget.left <= 0 || depth > 7) return h('div', 'tree-empty');
  budget.left -= 1;
  const t = h('div', 'tree');
  t.append(h('div', 'node', short(nodeVal(node))));
  const kids = [node.left, node.right].filter((k) => k !== undefined);
  if (kids.some((k) => isObj(k))) {
    const row = h('div', 'tree-kids');
    for (const k of [node.left, node.right]) row.append(isObj(k) ? drawTree(k, budget, depth + 1) : h('div', 'tree-empty'));
    t.append(row);
  }
  return t;
}

// Returns an element for `value`, or null when a scalar is better shown in the variables table.
export function draw(value, { variables = {}, name = '', diffNames = new Set() } = {}) {
  try {
    switch (kindOf(value)) {
      case 'array': return drawCells(value, pointersFor(value, variables, name), { diffNames });
      case 'string': return drawCells([...value], pointersFor(value, variables, name), { chars: true, diffNames });
      case 'dict': return drawDict(value);
      case 'matrix': return drawMatrix(value);
      case 'nodes': return drawChain(value.map(nodeVal), false);
      case 'linked': { const { values, truncated } = linkedValues(value); return drawChain(values, truncated); }
      case 'tree': return drawTree(value);
      case 'json': return h('pre', 'json', JSON.stringify(value, null, 2));
      default: return null;
    }
  } catch {
    return h('pre', 'json', formatValue(value));
  }
}

// Updates `container` to show `value`. When an array keeps its shape, cells and pointers are
// updated in place so the pointers slide to their new index instead of jumping.
export function drawInto(container, value, opts) {
  const next = draw(value, opts);
  const prev = container.firstElementChild;
  if (!next) { container.replaceChildren(); return false; }
  if (prev && prev.dataset.sig && prev.dataset.sig === next.dataset.sig) {
    const oldCells = prev.querySelectorAll('.cell');
    next.querySelectorAll('.cell').forEach((c, i) => {
      const o = oldCells[i];
      if (!o) return;
      if (o.firstChild.textContent !== c.firstChild.textContent) { o.classList.remove('is-flash'); void o.offsetWidth; o.classList.add('is-flash'); }
      o.firstChild.textContent = c.firstChild.textContent;
      o.classList.toggle('is-pointed', c.classList.contains('is-pointed'));
    });
    const oldRow = prev.querySelector('.ptrs');
    const newRow = next.querySelector('.ptrs');
    if (!newRow) { oldRow?.remove(); return true; }
    if (!oldRow) { prev.append(newRow); return true; }
    const seen = new Set();
    for (const p of newRow.children) {
      seen.add(p.dataset.name);
      const o = [...oldRow.children].find((x) => x.dataset.name === p.dataset.name);
      if (o) { o.style.transform = p.style.transform; o.className = p.className; } else oldRow.append(p.cloneNode(true));
    }
    for (const o of [...oldRow.children]) if (!seen.has(o.dataset.name)) o.remove();
    oldRow.style.height = newRow.style.height;
    return true;
  }
  container.replaceChildren(next);
  return true;
}
