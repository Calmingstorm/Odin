import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('ui/js/pages/llm-config.js', 'utf8');
const requests = [];
const mounted = [];
let timerCallback = null;
let timerInterval = null;

const api = {
  async get(path) {
    requests.push(path);
    if (path === '/api/llm/status') return {
      main_model: 'gpt-5.6-sol',
      codex: { enabled: true, model: 'gpt-5.6-sol' },
      ollama: { enabled: true, base_url: 'http://localhost:11434', model: 'local' },
      openai_compatible: {
        enabled: true, base_url: 'https://openrouter.ai/api/v1', model: 'vendor/model',
        model_profiles: {}, openrouter: {},
      },
    };
    if (path === '/api/ollama/status') return { configured: true, model: 'local' };
    if (path === '/api/ollama/models') return { models: [] };
    if (path === '/api/openai-compatible/status') return { configured: true, model: 'vendor/model' };
    if (path === '/api/openai-compatible/models') return { models: [] };
    if (path === '/api/agents/model') return { model: 'auto', auto_model_allowlist: [] };
    if (path === '/api/codex/status') return { configured: true, accounts: [] };
    if (path === '/api/context/windows') return { models: {} };
    if (path === '/api/openrouter/catalogue') return { models: [] };
    throw new Error(`unexpected GET ${path}`);
  },
  async post(path) { requests.push(path); return {}; },
  async put(path) { requests.push(path); return {}; },
  async delete(path) { requests.push(path); return {}; },
};

const context = vm.createContext({
  URL, console, document: { activeElement: null }, setTimeout, clearTimeout,
  window: {
    setInterval(callback, interval) { timerCallback = callback; timerInterval = interval; return 1; },
    clearInterval() {},
  },
});
function synthetic(identifier, exports) {
  return new vm.SyntheticModule(Object.keys(exports), function initialize() {
    for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
  }, { context, identifier });
}
const modules = new Map([
  ['../api.js', synthetic('api', { api })],
  ['../toast.js', synthetic('toast', { toast() {} })],
  ['../confirm.js', synthetic('confirm', { async confirmDialog() { return false; } })],
  ['vue', synthetic('vue', {
    computed(fn) { return { get value() { return fn(); } }; },
    onActivated() {}, onDeactivated() {}, onMounted(fn) { mounted.push(fn); },
    onUnmounted() {}, ref(value) { return { value }; },
  })],
  ['../llm-config-payloads.js', synthetic('payloads', {
    codexAdvancedPayload() { return {}; }, codexBasicPayload() { return {}; },
    openaiCompatibleAdvancedPayload() { return {}; }, openaiCompatibleBasicPayload() { return {}; },
    ollamaAdvancedPayload() { return {}; }, ollamaBasicPayload() { return {}; },
  })],
]);

const page = new vm.SourceTextModule(source, { context, identifier: 'llm-config.js' });
await page.link(async specifier => {
  const dependency = modules.get(specifier);
  if (!dependency) throw new Error(`unexpected import ${specifier}`);
  return dependency;
});
await page.evaluate();
page.namespace.default.setup();
assert.equal(mounted.length, 1, 'LLM config must register one mount callback');
mounted[0]();
for (let attempt = 0; attempt < 20 && !requests.includes('/api/openrouter/catalogue'); attempt += 1) {
  await new Promise(resolve => setTimeout(resolve, 0));
}
assert.equal(typeof timerCallback, 'function', 'mount must arm the live-refresh timer');
assert.equal(timerInterval, 15000, 'live refresh must run no more often than every 15 seconds');
for (let attempt = 0; attempt < 3; attempt += 1) await new Promise(resolve => setTimeout(resolve, 0));
for (const catalogue of ['/api/openrouter/catalogue', '/api/openai-compatible/models', '/api/ollama/models']) {
  assert.equal(requests.filter(path => path === catalogue).length, 1, `${catalogue} must load once on mount`);
}

requests.length = 0;
await timerCallback();
assert.deepEqual(requests, [
  '/api/llm/status', '/api/ollama/status', '/api/openai-compatible/status',
  '/api/agents/model', '/api/codex/status', '/api/context/windows',
], 'one live-refresh cycle must cost exactly six status/config requests');
console.log('LLM config refresh request budget OK');
