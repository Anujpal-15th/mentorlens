import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, ApiError, TOKEN_KEY } from '../js/api.js';
import { memoryStorage, fakeFetch } from './helpers.js';

const base = 'http://localhost:8080';

test('sendsTokenHeader', async () => {
  const fetch = fakeFetch([{ status: 200, body: { status: 'QUEUED', queuePosition: 1, error: null, result: null } }]);
  const api = createApi({ fetch, storage: memoryStorage({ [TOKEN_KEY]: 'tok-123' }), baseUrl: base });
  await api.getSubmission('abc');
  assert.equal(fetch.calls[0].url, `${base}/api/submissions/abc`);
  assert.equal(fetch.calls[0].headers.Authorization, 'Bearer tok-123');
});

test('surfacesErrorMessage', async () => {
  const fetch = fakeFetch([{ status: 429, body: { error: 'You already have 3 active submissions' } }]);
  const api = createApi({ fetch, storage: memoryStorage({ [TOKEN_KEY]: 't' }), baseUrl: base });
  await assert.rejects(api.submit({ language: 'python', code: 'x' }), (e) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.status, 429);
    assert.equal(e.message, 'You already have 3 active submissions');
    return true;
  });
});

test('unauthorizedClearsTokenAndRedirects', async () => {
  const storage = memoryStorage({ [TOKEN_KEY]: 'old' });
  let redirected = false;
  const api = createApi({
    fetch: fakeFetch([{ status: 401, body: { error: 'bad token' } }]),
    storage, baseUrl: base, onUnauthorized: () => { redirected = true; },
  });
  await assert.rejects(api.getSubmission('x'));
  assert.equal(storage.getItem(TOKEN_KEY), null);
  assert.ok(redirected);
});

test('loginStoresTokenAndWrongPasswordDoesNotRedirect', async () => {
  const storage = memoryStorage();
  const ok = createApi({ fetch: fakeFetch([{ status: 200, body: { token: 'new' } }]), storage, baseUrl: base });
  await ok.login('a@b.com', 'password1');
  assert.equal(storage.getItem(TOKEN_KEY), 'new');

  let redirected = false;
  const bad = createApi({
    fetch: fakeFetch([{ status: 401, body: { error: 'Invalid email or password' } }]),
    storage: memoryStorage(), baseUrl: base, onUnauthorized: () => { redirected = true; },
  });
  await assert.rejects(bad.login('a@b.com', 'nope'), /Invalid email or password/);
  assert.equal(redirected, false);
});

test('registerSendsConsent', async () => {
  const fetch = fakeFetch([{ status: 200, body: { token: 't' } }]);
  await createApi({ fetch, storage: memoryStorage(), baseUrl: base }).register('a@b.com', 'password1', true);
  assert.equal(fetch.calls[0].url, `${base}/api/auth/register`);
  assert.deepEqual(JSON.parse(fetch.calls[0].body), { email: 'a@b.com', password: 'password1', consent: true });
});

test('networkErrorExplainsBackendIsUnreachable', async () => {
  const api = createApi({ fetch: async () => { throw new TypeError('Failed to fetch'); }, storage: memoryStorage(), baseUrl: base });
  await assert.rejects(api.getSubmission('x'), (e) => e.status === 0 && /localhost:8080/.test(e.message));
});
