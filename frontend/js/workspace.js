import { api, renderTopBar, requireAuth, alertBox, storeJson } from './ui.js';
import { SAMPLE_QUESTION, SAMPLE_CODE, SAMPLE_INPUT, SAMPLE_EXPECTED } from './sample.js';

const MONACO = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min';
const $ = (id) => document.getElementById(id);
let editor = null; // Monaco instance once loaded; the textarea is the fallback

function loadMonaco() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 12000);
    // Workers must be same-origin, so start them from a data: URL that imports the CDN worker.
    window.MonacoEnvironment = {
      getWorkerUrl: () => `data:text/javascript;charset=utf-8,${encodeURIComponent(
        `self.MonacoEnvironment={baseUrl:'${MONACO}/'};importScripts('${MONACO}/vs/base/worker/workerMain.js');`)}`,
    };
    const s = document.createElement('script');
    s.src = `${MONACO}/vs/loader.js`;
    s.onerror = () => { clearTimeout(timer); reject(new Error('loader failed')); };
    s.onload = () => {
      window.require.config({ paths: { vs: `${MONACO}/vs` } });
      window.require(['vs/editor/editor.main'], () => { clearTimeout(timer); resolve(window.monaco); },
        (err) => { clearTimeout(timer); reject(err); });
    };
    document.head.append(s);
  });
}

async function startEditor() {
  const fallback = $('code-fallback');
  try {
    const monaco = await loadMonaco();
    monaco.editor.defineTheme('mentorlens', {
      base: 'vs-dark', inherit: true, rules: [],
      colors: { 'editor.background': '#0f1420', 'editor.lineHighlightBackground': '#161d2e', 'editorLineNumber.foreground': '#5d6a85' },
    });
    $('editor-host').hidden = false;
    editor = monaco.editor.create($('editor-host'), {
      value: fallback.value, language: 'python', theme: 'mentorlens', automaticLayout: true,
      fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 13.5, lineHeight: 22,
      minimap: { enabled: false }, scrollBeyondLastLine: false, tabSize: 4, insertSpaces: true,
      padding: { top: 12 }, renderLineHighlight: 'all', ariaLabel: 'Your solution code',
    });
    fallback.hidden = true;
    $('editor-status').textContent = 'Monaco editor';
  } catch {
    $('editor-status').textContent = 'Plain editor (Monaco could not load)';
    fallback.addEventListener('keydown', (e) => { // keep Tab for indentation in the plain editor
      if (e.key !== 'Tab' || e.shiftKey) return;
      e.preventDefault();
      fallback.setRangeText('    ', fallback.selectionStart, fallback.selectionEnd, 'end');
    });
  }
}

const code = () => (editor ? editor.getValue() : $('code-fallback').value);

function show(kind, text, title) {
  $('submit-message').replaceChildren(alertBox(kind, text, title));
}

async function onSubmit(e) {
  e.preventDefault();
  const payload = {
    language: 'python',
    question: $('question').value.trim(),
    code: code(),
    failingTest: { inputText: $('input-text').value.trim(), expectedText: $('expected-text').value.trim() },
  };
  const missing = [
    !payload.code.trim() && 'your code',
    !payload.question && 'the question',
    !payload.failingTest.inputText && 'the failing test input',
    !payload.failingTest.expectedText && 'the expected output',
  ].filter(Boolean);
  if (missing.length) return show('error', `Please add ${missing.join(', ')}.`);

  const btn = $('submit-btn');
  btn.disabled = true;
  btn.replaceChildren(Object.assign(document.createElement('span'), { className: 'spinner' }), 'Submitting');
  try {
    const reply = await api.submit(payload);
    const id = reply && (typeof reply.id === 'string' || typeof reply.id === 'number') ? String(reply.id) : '';
    if (!id) throw new Error('The server accepted the submission but did not return its id. Please try again.');
    // The result API does not return the code, so keep it in this browser for the replay panes.
    storeJson(`mentorlens.sub.${id}`, { code: payload.code, question: payload.question, ...payload.failingTest });
    location.assign(`result.html?id=${encodeURIComponent(id)}`);
  } catch (err) {
    if (err.status === 429) show('warn', `${err.message} Wait for one of your submissions to finish, then try again.`, 'Too many active submissions.');
    else if (err.status === 400) show('error', err.message, 'Please check your submission.');
    else show('error', err.message || 'Something went wrong. Please try again.');
    btn.disabled = false;
    btn.textContent = 'Analyse my solution';
  }
}

if (requireAuth()) {
  renderTopBar('workspace');
  $('question').value = SAMPLE_QUESTION;
  $('code-fallback').value = SAMPLE_CODE;
  $('input-text').value = SAMPLE_INPUT;
  $('expected-text').value = SAMPLE_EXPECTED;
  $('submit-form').addEventListener('submit', onSubmit);
  startEditor();
}
