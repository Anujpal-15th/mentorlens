// Backend client. No DOM access, so it runs under `node --test` with a fake fetch.

export const TOKEN_KEY = 'mentorlens.token';
export const EMAIL_KEY = 'mentorlens.email';
export const BASE_KEY = 'mentorlens.apiBase';
export const DEFAULT_BASE = 'http://localhost:8080';

function browserStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

// Storage can be missing or throw (private mode, blocked site data), so every access is guarded.
export function readKey(storage, key) {
  try { return storage ? storage.getItem(key) : null; } catch { return null; }
}
export function writeKey(storage, key, value) {
  try {
    if (!storage) return;
    if (value === null || value === undefined) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch { /* storage unavailable: the session just won't persist */ }
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function defaultUnauthorized() {
  const loc = globalThis.location;
  if (!loc) return;
  // Come back to the same page (for example result.html?id=...) after logging in again.
  const here = loc.pathname.split('/').pop() + loc.search;
  loc.assign(`login.html?expired=1&next=${encodeURIComponent(here)}`);
}

export function createApi({
  fetch = globalThis.fetch?.bind(globalThis),
  storage = browserStorage(),
  baseUrl,
  onUnauthorized = defaultUnauthorized,
} = {}) {
  const base = (baseUrl || readKey(storage, BASE_KEY) || DEFAULT_BASE).replace(/\/+$/, '');

  async function request(method, path, body) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = readKey(storage, TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError(0, `Can't reach the MentorLens server at ${base}. Check that the backend is running.`);
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }

    if (!res.ok) {
      const message = (data && typeof data.error === 'string' && data.error) || `Request failed (HTTP ${res.status}).`;
      // A 401 on login is a wrong password, not an expired session.
      if (res.status === 401 && !path.startsWith('/api/auth/')) {
        writeKey(storage, TOKEN_KEY, null);
        onUnauthorized();
      }
      throw new ApiError(res.status, message);
    }
    return data;
  }

  async function authenticate(path, body) {
    const data = await request('POST', path, body);
    if (!data || typeof data.token !== 'string') throw new ApiError(500, 'The server did not return a session token.');
    writeKey(storage, TOKEN_KEY, data.token);
    writeKey(storage, EMAIL_KEY, body.email);
    return data;
  }

  return {
    baseUrl: base,
    login: (email, password) => authenticate('/api/auth/login', { email, password }),
    register: (email, password, consent) => authenticate('/api/auth/register', { email, password, consent }),
    submit: (payload) => request('POST', '/api/submissions', payload),
    getSubmission: (id) => request('GET', `/api/submissions/${encodeURIComponent(id)}`),
    nextHint: (id) => request('GET', `/api/submissions/${encodeURIComponent(id)}/hints/next`),
    token: () => readKey(storage, TOKEN_KEY),
    email: () => readKey(storage, EMAIL_KEY),
    logout() {
      writeKey(storage, TOKEN_KEY, null);
      writeKey(storage, EMAIL_KEY, null);
    },
  };
}
