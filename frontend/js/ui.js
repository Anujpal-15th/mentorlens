// Shared DOM helpers and the top bar. All text goes through textContent, never innerHTML.
import { createApi } from './api.js';

export const api = createApi();

// el('div', { class: 'x', onclick: fn }, 'text', childNode, [more])
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  for (const c of children.flat()) if (c) node.append(c);
  return node;
}

// Static icon shapes (24x24, stroke based).
const ICONS = {
  first: [['path', { d: 'M18 19 9 12l9-7z' }], ['path', { d: 'M6 5v14' }]],
  back: [['path', { d: 'm15 18-6-6 6-6' }]],
  next: [['path', { d: 'm9 18 6-6-6-6' }]],
  last: [['path', { d: 'm6 5 9 7-9 7z' }], ['path', { d: 'M18 5v14' }]],
  play: [['path', { d: 'm7 4 13 8-13 8z' }]],
  pause: [['path', { d: 'M8 5v14M16 5v14' }]],
  target: [['circle', { cx: 12, cy: 12, r: 9 }], ['circle', { cx: 12, cy: 12, r: 4 }], ['path', { d: 'M12 1v4M12 19v4M1 12h4M19 12h4' }]],
  alert: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 7.5v5.5M12 16.5h.01' }]],
  info: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 11v5.5M12 7.5h.01' }]],
  check: [['path', { d: 'M5 12.5 10 17.5 19 7' }]],
  x: [['path', { d: 'M6 6l12 12M18 6 6 18' }]],
  shield: [['path', { d: 'M12 3 4.5 6v5.5c0 4.5 3.2 8.2 7.5 9.5 4.3-1.3 7.5-5 7.5-9.5V6z' }], ['path', { d: 'm9 12 2 2 4-4' }]],
  sparkle: [['path', { d: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6' }]],
  flask: [['path', { d: 'M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3' }], ['path', { d: 'M7.5 14h9' }]],
  logout: [['path', { d: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10' }]],
  arrow: [['path', { d: 'M5 12h14M13 6l6 6-6 6' }]],
  lock: [['rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }], ['path', { d: 'M8 11V7a4 4 0 0 1 8 0v4' }]],
};

export function icon(name) {
  return svg('svg', {
    viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
  }, (ICONS[name] || []).map(([t, a]) => svg(t, a)));
}

export function brandMark(cls = 'brand-mark') {
  return svg('svg', { class: cls, viewBox: '0 0 32 32', 'aria-hidden': 'true' },
    svg('defs', {}, svg('linearGradient', { id: `g-${cls}`, x1: 0, y1: 0, x2: 1, y2: 1 },
      svg('stop', { offset: '0', 'stop-color': '#6366f1' }), svg('stop', { offset: '1', 'stop-color': '#8b5cf6' }))),
    svg('rect', { width: 32, height: 32, rx: 8, fill: `url(#g-${cls})` }),
    svg('circle', { cx: 14, cy: 14, r: 7, fill: 'none', stroke: '#fff', 'stroke-width': 2.4 }),
    svg('path', { d: 'M19.2 19.2 25 25', stroke: '#fff', 'stroke-width': 2.6, 'stroke-linecap': 'round' }),
    svg('path', { d: 'M10.5 12.5h7M10.5 15.5h4', stroke: '#fff', 'stroke-width': 1.8, 'stroke-linecap': 'round', opacity: 0.85 }));
}

export function alertBox(kind, text, title) {
  return el('div', { class: `alert alert-${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    icon(kind === 'good' ? 'check' : kind === 'info' ? 'info' : 'alert'),
    el('div', {}, title ? el('strong', {}, title, ' ') : null, text));
}

export function renderTopBar(active) {
  const host = document.getElementById('topbar');
  if (!host) return;
  const link = (href, label, key) => el('a', { href, 'aria-current': active === key ? 'page' : null }, label);
  const email = api.email();
  const signedIn = Boolean(api.token());
  const account = el('div', { class: 'account' });
  if (signedIn) {
    account.append(
      el('span', { class: 'account-email', title: email || '' }, email || 'Signed in'),
      el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: () => { api.logout(); location.assign('login.html'); },
      }, icon('logout'), 'Log out'),
    );
  } else if (active !== 'login') {
    account.append(el('a', { class: 'btn btn-sm', href: 'login.html' }, 'Log in'));
  }
  host.className = 'topbar';
  host.replaceChildren(el('div', { class: 'topbar-inner' },
    el('a', { class: 'brand', href: signedIn ? 'workspace.html' : 'login.html', 'aria-label': 'MentorLens home' }, brandMark(), el('span', {}, 'MentorLens')),
    el('nav', { class: 'nav', 'aria-label': 'Main' },
      link('workspace.html', 'New submission', 'workspace'),
      link('result.html?sample=1', 'Sample', 'sample')),
    account));
}

// Sends the visitor to login, then back to `next` (a page in this app) after signing in.
export function requireAuth() {
  if (api.token()) return true;
  const next = location.pathname.split('/').pop() + location.search;
  location.replace(`login.html?next=${encodeURIComponent(next)}`);
  return false;
}

// Only same-app pages are allowed as a post-login destination.
export function safeNext(value) {
  return /^[a-z]+\.html(\?[\w=&%.-]*)?$/i.test(value || '') ? value : 'workspace.html';
}

export function storeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not persisted */ }
}
export function loadJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
