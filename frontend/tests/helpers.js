import { readFileSync } from 'node:fs';

export function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

// Fake fetch: answers each call with the next queued reply (the last one repeats) and records the request.
export function fakeFetch(replies) {
  const calls = [];
  const queue = [...replies];
  const fn = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    const r = queue.length > 1 ? queue.shift() : queue[0];
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => (r.body === undefined ? '' : JSON.stringify(r.body)),
    };
  };
  fn.calls = calls;
  return fn;
}

export function trace(name) {
  return JSON.parse(readFileSync(new URL(`../sample/${name}.json`, import.meta.url), 'utf8'));
}
