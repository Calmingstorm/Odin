// Config undo/redo keyboard ownership (deep-dive 6.1).
//
// The Config page's document-level Ctrl+Z/Y listener was mount-scoped, but
// the System tabs live inside <keep-alive>: switching away only deactivates,
// so the hidden page kept capturing undo/redo on sibling tabs and silently
// mutated concealed drafts. Ownership now follows activation. These
// assertions drive the REAL setup's arm/disarm surface against a recording
// document, and pin the lifecycle wiring in source.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
const listeners = [];
globalThis.document = {
  createElement() { return {}; },
  querySelectorAll() { return []; },
  addEventListener(type, fn) { listeners.push({ type, fn }); },
  removeEventListener(type, fn) {
    const idx = listeners.findIndex(l => l.type === type && l.fn === fn);
    if (idx >= 0) listeners.splice(idx, 1);
  },
};
globalThis.window = {
  matchMedia() { return { matches: false }; },
  setInterval, clearInterval, setTimeout, clearTimeout,
  location: { hash: '#dashboard' },
};
globalThis.location = { protocol: 'http:', host: 'localhost', hash: '#dashboard' };
globalThis.fetch = async () => new Response(JSON.stringify({}), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

const quietWarn = console.warn;
console.warn = () => {};
const { default: configPage } = await import('../ui/js/pages/config.js');
const state = configPage.setup();
console.warn = quietWarn;

const armed = () => listeners.filter(l => l.type === 'keydown').length;

// Arming is idempotent (initial keep-alive mount fires BOTH onMounted and
// onActivated); disarm releases; the cycle re-arms cleanly.
assert.equal(armed(), 0, 'setup armed a listener outside the lifecycle');
state.armKeydown();
state.armKeydown();
assert.equal(armed(), 1, 'double arm registered a duplicate listener');
state.disarmKeydown();
assert.equal(armed(), 0, 'disarm left the global listener attached');
state.disarmKeydown();
assert.equal(armed(), 0, 'double disarm went negative or re-registered');
state.armKeydown();
assert.equal(armed(), 1, 'rearm after disarm failed');
state.disarmKeydown();

// The lifecycle wiring itself: keyboard ownership must follow activation.
const source = readFileSync(join(here, '../ui/js/pages/config.js'), 'utf8');
assert.match(source, /onActivated\(armKeydown\)/,
  'onActivated no longer arms the keyboard listener');
assert.match(source, /onDeactivated\(disarmKeydown\)/,
  'onDeactivated no longer disarms the keyboard listener');
const registrations = source.match(/document\.addEventListener\('keydown'/g) || [];
assert.equal(registrations.length, 1,
  'a keydown registration exists outside the guarded arm');
assert.match(source, /function armKeydown\(\) \{[\s\S]{0,160}?document\.addEventListener\('keydown'/,
  'the single keydown registration no longer lives inside armKeydown');

console.log('config-keydown: activation-scoped keyboard ownership pinned');
process.exit(0);
