import { BASE_KEY, DEFAULT_BASE, readKey, writeKey, createApi } from './api.js';
import { renderTopBar, brandMark, alertBox, safeNext } from './ui.js';

let storage = null;
try { storage = localStorage; } catch { storage = null; }

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let mode = 'login';

function setMode(next) {
  mode = next;
  const register = mode === 'register';
  $('tab-login').setAttribute('aria-selected', String(!register));
  $('tab-register').setAttribute('aria-selected', String(register));
  $('consent-row').hidden = !register;
  $('password-help').hidden = !register;
  $('password').autocomplete = register ? 'new-password' : 'current-password';
  $('auth-submit').textContent = register ? 'Create account' : 'Log in';
  $('auth-message').replaceChildren();
}

function show(kind, text) {
  $('auth-message').replaceChildren(alertBox(kind, text));
}

async function onSubmit(e) {
  e.preventDefault();
  const email = $('email').value.trim();
  const password = $('password').value;
  if (!email || !$('email').checkValidity()) return show('error', 'Enter a valid email address.');
  if (!password) return show('error', 'Enter your password.');
  if (mode === 'register') {
    if (password.length < 8) return show('error', 'Use a password of at least 8 characters.');
    if (!$('consent').checked) return show('error', 'Please agree to the AI provider notice to create an account.');
  }

  const button = $('auth-submit');
  const label = button.textContent;
  button.disabled = true;
  button.replaceChildren(Object.assign(document.createElement('span'), { className: 'spinner' }), mode === 'register' ? 'Creating account' : 'Logging in');
  try {
    const api = createApi();
    if (mode === 'register') await api.register(email, password, true);
    else await api.login(email, password);
    location.assign(safeNext(params.get('next')));
  } catch (err) {
    show('error', err.message || 'Something went wrong. Please try again.');
    button.disabled = false;
    button.textContent = label;
  }
}

renderTopBar('login');
$('hero-mark').append(brandMark());
$('tab-login').addEventListener('click', () => setMode('login'));
$('tab-register').addEventListener('click', () => setMode('register'));
$('auth-form').addEventListener('submit', onSubmit);
if (params.get('expired')) show('warn', 'Your session ended. Please log in again.');

$('api-base').value = readKey(storage, BASE_KEY) || '';
$('api-base').placeholder = DEFAULT_BASE;
$('api-save').addEventListener('click', () => {
  const v = $('api-base').value.trim();
  if (v && !/^https?:\/\/[^\s]+$/.test(v)) return show('error', 'The backend URL must start with http:// or https://.');
  writeKey(storage, BASE_KEY, v || null);
  show('good', `Backend set to ${v || DEFAULT_BASE}.`);
});
