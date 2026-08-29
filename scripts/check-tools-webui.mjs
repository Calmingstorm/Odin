import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { baseParse } from '@vue/compiler-dom';

// Node stubs so the real Vue page setup() runs headlessly (same harness
// shape as check-mcp-webui).
class MemoryStorage {
  getItem() { return null; }
  setItem() {}
  removeItem() {}
}
globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
globalThis.document = { createElement() { return {}; } };
globalThis.window = {
  matchMedia() { return { matches: false }; },
  setInterval, clearInterval, setTimeout, clearTimeout,
  location: { hash: '#tools' },
};

const { default: toolsPage } = await import('../ui/js/pages/tools.js');
const page = readFileSync('ui/js/pages/tools.js', 'utf8');

// ---------------------------------------------------------------------------
// Source pins: the switch contract (config-gated built-ins).
// ---------------------------------------------------------------------------
assert.match(page, /Enabled for model/);
assert.match(page, /@change="toggleBuiltinTool\(t, \$event\)"/);
assert.match(page, /:aria-busy="togglePending\.has\(t\.name\)/);
assert.match(page, /Disabled by operator/);
assert.match(page, /Unavailable — required backend is not configured/);
assert.match(page, /Global tools disabled/);
assert.match(page, /Core capability\. Disabling it may cause automation, recovery, or stored workflows that depend on it to fail\./);
assert.match(page, /Disabling a tool removes it from future model requests and causes stored jobs that call it to fail\. Already-running calls are not cancelled\./);
// Switches are BUILT-IN only — skills/MCP rows never render one.
assert.match(page, /v-if="t\.source === 'builtin'" class="tl-tool-switch"/);
// The toggle never opens a confirmation dialog.
assert.doesNotMatch(page, /confirmDialog/);

// ---------------------------------------------------------------------------
// AST pin: every switch is a real <label> containing its checkbox (the
// pointer-clickability class from PR #290 — a div/span wrapper must fail).
// ---------------------------------------------------------------------------
const ast = baseParse(toolsPage.template);
function staticAttribute(node, name) {
  return node.props?.find(p => p.type === 6 && p.name === name)?.value?.content || '';
}
function collect(node, predicate, out = []) {
  if (node.type === 1 && predicate(node)) out.push(node);
  for (const child of node.children || []) collect(child, predicate, out);
  return out;
}
const switches = collect(ast, n => staticAttribute(n, 'class').split(/\s+/).includes('tl-tool-switch'));
assert.ok(switches.length >= 2, 'card and table views each render the switch');
for (const node of switches) {
  assert.equal(node.tag, 'label', 'tool switch must label its checkbox');
  assert.ok(
    collect(node, c => c.tag === 'input' && staticAttribute(c, 'type') === 'checkbox').length === 1,
    'switch label must contain exactly one checkbox',
  );
}

// ---------------------------------------------------------------------------
// Behavioral pins: drive the real setup() through a stubbed network.
// ---------------------------------------------------------------------------
const fetchCalls = [];
function jsonResponse(payload) {
  return { status: 200, ok: true, json: async () => payload };
}
const inventory = {
  global_enabled: true,
  disabled_count: 0,
  tools: [
    { name: 'kubectl', description: 'k8s', is_core: false, enabled: true, state: 'available' },
    { name: 'run_command', description: 'sh', is_core: true, enabled: true, state: 'available' },
  ],
};
globalThis.fetch = async (path, opts = {}) => {
  fetchCalls.push({ path, method: opts.method || 'GET' });
  if (path === '/api/tools/builtins/kubectl/enabled') {
    return jsonResponse({
      ...inventory,
      disabled_count: 1,
      tools: inventory.tools.map(t =>
        t.name === 'kubectl' ? { ...t, enabled: false, state: 'disabled' } : t,
      ),
    });
  }
  if (path === '/api/tools') return jsonResponse([{ name: 'mcp_X_probe', description: 'm' }]);
  return jsonResponse({});
};

const savedWarn = console.warn;
console.warn = () => {};
const state = toolsPage.setup();
console.warn = savedWarn;

// stateBadge truth table: built-ins only; 'available' renders no badge.
assert.equal(state.stateBadge({ source: 'builtin', state: 'available' }), '');
assert.equal(state.stateBadge({ source: 'builtin', state: 'disabled' }), 'Disabled by operator');
assert.equal(
  state.stateBadge({ source: 'builtin', state: 'global_disabled' }),
  'Global tools disabled',
);
assert.equal(state.stateBadge({ source: 'mcp', state: 'disabled' }), '');

// One dedicated POST; canonical inventory adoption (no optimistic state).
state.tools.value = inventory.tools.map(t => ({ ...t, source: 'builtin' }));
await state.toggleBuiltinTool(state.tools.value[0], { target: { checked: false } });
const posts = fetchCalls.filter(c => c.method === 'POST');
assert.equal(posts.length, 1);
assert.equal(posts[0].path, '/api/tools/builtins/kubectl/enabled');
const kubectlRow = state.tools.value.find(t => t.name === 'kubectl');
assert.equal(kubectlRow.enabled, false);
assert.equal(kubectlRow.state, 'disabled');
// Non-builtin rows from /api/tools carry no switch eligibility.
assert.equal(state.tools.value.find(t => t.name === 'mcp_X_probe').source, 'mcp');

// Exact committed-truth interleaving: POST succeeds, then the best-effort
// visible-catalog GET fails. The canonical POST inventory must remain adopted
// and the switch must not be restored to its stale pre-commit state.
state.tools.value = inventory.tools.map(t => ({ ...t, source: 'builtin' }));
globalThis.fetch = async (path, opts = {}) => {
  if ((opts.method || 'GET') === 'POST') {
    return jsonResponse({
      ...inventory,
      disabled_count: 1,
      tools: inventory.tools.map(t =>
        t.name === 'kubectl' ? { ...t, enabled: false, state: 'disabled' } : t,
      ),
    });
  }
  throw new Error(`secondary refresh failed: ${path}`);
};
const committedInput = { checked: false };
const savedWarnAfterCommit = console.warn;
console.warn = () => {};
await state.toggleBuiltinTool(
  state.tools.value.find(t => t.name === 'kubectl'),
  { target: committedInput },
);
console.warn = savedWarnAfterCommit;
const committedKubectl = state.tools.value.find(t => t.name === 'kubectl');
assert.equal(committedKubectl.enabled, false);
assert.equal(committedKubectl.state, 'disabled');
assert.equal(committedInput.checked, false);
assert.equal(state.error.value, null);

// A failed toggle restores the prior switch position.
globalThis.fetch = async () => {
  throw new Error('down');
};
const failInput = { checked: true };
await state.toggleBuiltinTool(
  { name: 'kubectl', enabled: false, source: 'builtin' },
  { target: failInput },
);
assert.equal(failInput.checked, false);

console.log('tools-webui: built-in switches, states, label association, and canonical adoption pinned');
process.exit(0);
