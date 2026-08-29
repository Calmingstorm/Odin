import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { baseParse } from '@vue/compiler-dom';

// Import the actual Vue page setup in Node. Runtime-dom only needs a document
// creation stub at import time; the navigation fixture below supplies the
// modal DOM queried by the action itself.
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
  location: { hash: '#capabilities?tab=mcp-servers' },
};

import {
  MCPFormError,
  buildMCPServerPayload,
  mcpConnectionEditNeedsConfirmation,
  mcpToolMatches,
  normalizeMCPState,
} from '../ui/js/mcp-config-policy.js';
import { MCP_EDITOR_GROUPS, scrollMCPFormSection } from '../ui/js/mcp-editor-navigation.js';
const { default: mcpServersPage } = await import('../ui/js/pages/mcp-servers.js');

const page = readFileSync('ui/js/pages/mcp-servers.js', 'utf8');
const navigation = readFileSync('ui/js/mcp-editor-navigation.js', 'utf8');
const config = readFileSync('ui/js/pages/config.js', 'utf8');
const capabilities = readFileSync('ui/js/pages/capabilities.js', 'utf8');
const template = readFileSync('config.yml', 'utf8');
const docs = readFileSync('docs/configuration.md', 'utf8');

function form(overrides = {}) {
  return {
    name: 'local_tools', enabled: true, transport: 'stdio',
    command: '/usr/bin/mcp', argsText: '--flag\nvalue', cwd: '/srv/mcp',
    url: '', timeoutSeconds: 120, allowlistText: 'search\nlookup',
    replaceArgs: false, replaceCwd: false, replaceTimeout: false, replaceAllowlist: false,
    headerRows: [], envRows: [], headersRemove: [], envRemove: [],
    ...overrides,
  };
}

// Add sends the complete public contract and explicit secret patch operations.
const add = buildMCPServerPayload(form({
  headerRows: [{ key: 'Authorization', value: 'opaque-secret' }],
  envRows: [{ key: 'API_KEY', value: 'also-secret' }],
}), { mode: 'add' });
assert.deepEqual(add, {
  name: 'local_tools', enabled: true, transport: 'stdio',
  command: '/usr/bin/mcp', args: ['--flag', 'value'], cwd: '/srv/mcp',
  timeout_seconds: 120, tool_allowlist: ['search', 'lookup'],
  headers_set: { Authorization: 'opaque-secret' }, env_set: { API_KEY: 'also-secret' },
});

// Edit never fabricates command/args/cwd/url/timeout/allowlist values the API did not return.
const edit = buildMCPServerPayload(form({
  name: 'saved', command: '', argsText: '', cwd: '', allowlistText: '',
  replaceArgs: false, replaceCwd: false, replaceTimeout: false, replaceAllowlist: false,
  headersRemove: ['OLD_HEADER'], envRemove: ['OLD_ENV'],
}), { mode: 'edit', originalTransport: 'stdio' });
assert.deepEqual(edit, {
  enabled: true, transport: 'stdio',
  headers_remove: ['OLD_HEADER'], env_remove: ['OLD_ENV'],
});
const savedStdio = { enabled: true, transport: 'stdio' };
const savedHttp = { enabled: true, transport: 'http' };
function editNeedsConfirmation(overrides = {}, original = savedStdio) {
  const payload = buildMCPServerPayload(form({
    name: 'saved', command: '', argsText: '', cwd: '', allowlistText: '',
    ...overrides,
  }), { mode: 'edit', originalTransport: original.transport });
  return mcpConnectionEditNeedsConfirmation(payload, original);
}
assert.equal(editNeedsConfirmation(), false);
// Every effective edit class replaces the runtime and therefore confirms.
for (const [label, overrides, original] of [
  ['enabled', { enabled: false }, savedStdio],
  ['transport', { transport: 'http', url: 'https://mcp.example/mcp' }, savedStdio],
  ['command', { command: '/new/path' }, savedStdio],
  ['url', { transport: 'http', url: 'https://replacement.example/mcp' }, savedHttp],
  ['args', { replaceArgs: true, argsText: '--new' }, savedStdio],
  ['cwd', { replaceCwd: true, cwd: '/new/cwd' }, savedStdio],
  ['timeout', { replaceTimeout: true, timeoutSeconds: 30 }, savedStdio],
  ['allowlist', { replaceAllowlist: true, allowlistText: 'echo' }, savedStdio],
  ['header set', { headerRows: [{ key: 'Authorization', value: 'new' }] }, savedStdio],
  ['header remove', { headersRemove: ['Authorization'] }, savedStdio],
  ['environment set', { envRows: [{ key: 'API_KEY', value: 'new' }] }, savedStdio],
  ['environment remove', { envRemove: ['API_KEY'] }, savedStdio],
]) assert.equal(editNeedsConfirmation(overrides, original), true, `${label} must confirm`);

// HTTP edit fields are honest: blank preserves an existing endpoint, while
// create and stdio-to-HTTP transitions require a replacement URL.
const preserveEndpoint = buildMCPServerPayload(form({
  name: 'saved_http', transport: 'http', command: '', url: '',
}), { mode: 'edit', originalTransport: 'http' });
assert.equal(Object.hasOwn(preserveEndpoint, 'url'), false);
assert.throws(
  () => buildMCPServerPayload(form({ name: 'saved_stdio', transport: 'http', command: '', url: '' }), { mode: 'edit', originalTransport: 'stdio' }),
  error => error instanceof MCPFormError && error.field === 'url',
);
assert.throws(
  () => buildMCPServerPayload(form({ transport: 'http', command: '', url: '' }), { mode: 'add' }),
  error => error instanceof MCPFormError && error.field === 'url',
);

// Replacement controls intentionally allow clearing lists and cwd.
const clear = buildMCPServerPayload(form({
  name: 'saved', command: '', argsText: '', cwd: '', allowlistText: '',
  replaceArgs: true, replaceCwd: true, replaceAllowlist: true,
  replaceTimeout: false,
}), { mode: 'edit', originalTransport: 'stdio' });
assert.deepEqual(clear.args, []);
assert.equal(clear.cwd, '');
assert.deepEqual(clear.tool_allowlist, []);
assert.equal(Object.hasOwn(clear, 'timeout_seconds'), false);

// Secret set/remove ambiguity and malformed transport data fail client-side.
assert.throws(
  () => buildMCPServerPayload(form({ headerRows: [{ key: 'AUTH', value: 'new' }], headersRemove: ['AUTH'] }), { mode: 'add' }),
  MCPFormError,
);
assert.throws(() => buildMCPServerPayload(form({ name: 'bad-name' }), { mode: 'add' }), MCPFormError);
assert.throws(() => buildMCPServerPayload(form({ transport: 'http', url: 'file:///tmp/mcp' }), { mode: 'add' }), MCPFormError);
assert.throws(() => buildMCPServerPayload(form({ timeoutSeconds: 0 }), { mode: 'add' }), MCPFormError);

for (const state of ['disabled', 'connecting', 'connected', 'stale', 'error', 'blocked']) {
  assert.equal(normalizeMCPState(state), state);
  assert.match(page, new RegExp(`${state}: '${state[0].toUpperCase()}${state.slice(1)}'`));
}
assert.equal(normalizeMCPState('invented'), 'error');
assert.equal(mcpToolMatches({ original_name: 'search_code' }, 'code'), true);
assert.equal(mcpToolMatches({ published_name: 'mcp_git_search' }, 'git'), true);
assert.equal(mcpToolMatches({ exclusion_reason: 'allowlist denied' }, 'denied'), true);
assert.equal(mcpToolMatches({ original_name: 'search_code' }, 'weather'), false);

// P4 routes are consumed directly and reconnect stays distinct from refresh-tools.
for (const route of [
  '/api/mcp/status', '/api/mcp/servers', '/api/mcp/enabled',
  '/reconnect', '/refresh-tools', '/tools',
]) assert.ok(page.includes(route), `MCP page lost route ${route}`);
assert.match(page, /confirmDialog\([\s\S]*Disable MCP tool publication/);
assert.match(page, /confirmDialog\([\s\S]*Remove server/);
assert.match(page, /mcpConnectionEditNeedsConfirmation\(payload, editingServer\.value\)[\s\S]*Save and reconnect/);
assert.match(page, /Saving this configuration replaces the server runtime\./);
assert.match(page, /Any current connection will be retired and its tools unpublished; enabled servers reconnect/);

// Section shortcuts are buttons, not hash routes. Exercise all four actions
// against a modal fixture and prove route/modal state survives each click.
assert.match(page, /<button v-for="group in editorGroups"[^>]*type="button"[^>]*@click="jumpToEditorGroup\(group\.id\)"/);
assert.doesNotMatch(page, /mcp-editor-nav[\s\S]{0,300}<a\b/);
assert.match(page, /:aria-controls="'mcp-form-' \+ group\.id"/);
assert.match(navigation, /prefers-reduced-motion: reduce/);
const navigationCalls = [];
let focused = 0;
const heading = { focus(options) { focused++; assert.deepEqual(options, { preventScroll: true }); } };
const targets = Object.fromEntries(MCP_EDITOR_GROUPS.map(group => [group.id, {
  scrollIntoView(options) { navigationCalls.push({ id: group.id, options }); },
  querySelector(selector) { assert.equal(selector, '[data-mcp-form-heading]'); return heading; },
}]));
const scroller = { querySelector(selector) { return targets[selector.replace('#mcp-form-', '')] || null; } };
const root = { querySelector(selector) { assert.equal(selector, '.mcp-editor-groups'); return scroller; } };
globalThis.document.querySelector = selector => root.querySelector(selector);
const savedWarn = console.warn;
console.warn = () => {}; // setup() outside a mounted component is intentional here.
const pageState = mcpServersPage.setup();
console.warn = savedWarn;
pageState.openAdd();
for (const group of MCP_EDITOR_GROUPS) {
  pageState.jumpToEditorGroup(group.id);
  assert.equal(window.location.hash, '#capabilities?tab=mcp-servers');
  assert.equal(pageState.editorOpen.value, true);
}
assert.equal(navigationCalls.length, 4);
assert.equal(focused, 4);
for (const call of navigationCalls) {
  assert.deepEqual(call.options, { behavior: 'smooth', block: 'start', inline: 'nearest' });
}
assert.equal(scrollMCPFormSection('limits', { root, reducedMotion: true }), true);
assert.equal(navigationCalls.at(-1).options.behavior, 'auto');

assert.match(page, /header_keys/);
assert.match(page, /env_keys/);
assert.doesNotMatch(page, /server\.headers|server\.env/);
assert.match(page, /last_refresh_age_seconds/);
assert.match(page, /stderr_tail/);
assert.match(page, /blocked_reason/);
assert.match(page, /original_name/);
assert.match(page, /published_name/);
assert.match(page, /exclusion_reason/);
assert.match(page, /mcpToolMatches/);
assert.match(page, /ws\.subscribe\('events', onRuntimeEvent\)/);
assert.match(page, /ws\.unsubscribe\('events', onRuntimeEvent\)/);
assert.match(page, /POLL_MS = 10000/);
assert.match(page, /Replace endpoint URL/);
assert.match(page, /Leave blank to keep the saved endpoint/);
assert.match(page, /The current endpoint remains unchanged unless a replacement is entered\./);
assert.match(page, /A new endpoint is required when switching to HTTP\./);
assert.match(page, /:required="endpointRequired"/);
assert.doesNotMatch(page, /server\.(url|endpoint)/);

// One owner per truth: dedicated Capabilities tab, read-only Config summary + link.
assert.match(capabilities, /id: 'mcp-servers'.*MCP Servers/);
assert.match(config, /section === 'mcp'/);
assert.match(config, /Managed in MCP Servers/);
assert.match(config, /tab: 'mcp-servers'/);
assert.match(config, /one editor for durable and runtime truth/);

// Template and documentation expose both transports and write-only/static-auth limits.
assert.match(template, /transport: stdio/);
assert.match(template, /transport: http/);
assert.match(template, /\$\{MCP_API_KEY\}/);
assert.match(template, /\$\{MCP_HTTP_TOKEN\}/);
assert.match(docs, /write-only/i);
assert.match(docs, /Interactive OAuth[\s\S]*not supported/i);
assert.match(docs, /2026-07-28/);
assert.match(docs, /blocked[\s\S]*not partially[\s\S]*published/i);

// ---------------------------------------------------------------------------
// Per-server card toggle + masked endpoint display (post-v3.78.0 R1/R2).
// ---------------------------------------------------------------------------
assert.match(page, /:checked="server\.enabled"/);
assert.match(page, /@change="toggleServerEnabled\(server, \$event\)"/);

// Pin the rendered control association, not merely its handler. The visual
// slider is pointer-clickable because the card control is a real <label>
// containing its checkbox; changing this wrapper back to a div/span must fail.
const mcpTemplateAst = baseParse(mcpServersPage.template);
function staticAttribute(node, name) {
  return node.props?.find(prop => prop.type === 6 && prop.name === name)?.value?.content || '';
}
function findElement(node, predicate) {
  if (node.type === 1 && predicate(node)) return node;
  for (const child of node.children || []) {
    const match = findElement(child, predicate);
    if (match) return match;
  }
  return null;
}
const cardSwitchLabel = findElement(
  mcpTemplateAst,
  node => staticAttribute(node, 'class').split(/\s+/).includes('mcp-card-switch'),
);
assert.ok(cardSwitchLabel, 'card switch control must exist');
assert.equal(cardSwitchLabel.tag, 'label', 'card switch must label its checkbox');
assert.ok(
  findElement(
    cardSwitchLabel,
    node => node.tag === 'input' && staticAttribute(node, 'type') === 'checkbox',
  ),
  'card switch label must contain its checkbox',
);
assert.match(page, /:aria-busy="togglePending\.has\(server\.name\)/);
assert.match(page, /Takes effect immediately and changes tool availability\./);
assert.match(page, /Currently set — masked display/);
assert.match(page, /recognition only and is not the literal saved URL/);
assert.match(page, /editingServer\?\.url_display/);

// The display field never round-trips: the payload builder does not know it,
// so no update patch can ever carry it back.
const policySource = readFileSync('ui/js/mcp-config-policy.js', 'utf8');
assert.doesNotMatch(policySource, /url_display/);

// Modal enabled flips (concealed behind Save) still require confirmation.
assert.equal(
  mcpConnectionEditNeedsConfirmation(
    { enabled: false, transport: 'http' },
    { enabled: true, transport: 'http' },
  ),
  true,
);

// The card toggle performs exactly ONE dedicated enabled mutation — never the
// broad PUT — and opens no confirmation modal.
const toggleSource = page.slice(
  page.indexOf('async function toggleServerEnabled'),
  page.indexOf('async function setMasterEnabled'),
);
assert.ok(toggleSource.length > 0, 'toggleServerEnabled must precede setMasterEnabled');
assert.doesNotMatch(toggleSource, /confirmDialog/);

const fetchCalls = [];
globalThis.fetch = async (path, opts) => {
  fetchCalls.push({ path, opts });
  return {
    status: 200,
    ok: true,
    json: async () => ({
      enabled: true,
      connected_count: 0,
      servers: [{ name: 'dw', enabled: false, state: 'disabled' }],
    }),
  };
};
pageState.status.value = {
  enabled: true,
  connected_count: 1,
  servers: [{ name: 'dw', enabled: true, state: 'connected' }],
};
await pageState.toggleServerEnabled(pageState.status.value.servers[0], {
  target: { checked: false },
});
assert.equal(fetchCalls.length, 1);
assert.equal(fetchCalls[0].path, '/api/mcp/servers/dw/enabled');
assert.equal(fetchCalls[0].opts.method, 'POST');
assert.deepEqual(JSON.parse(fetchCalls[0].opts.body), { enabled: false });
// The canonical returned payload is adopted — no optimistic state invented.
assert.equal(pageState.status.value.servers[0].enabled, false);
assert.equal(pageState.status.value.servers[0].state, 'disabled');

// A failed toggle restores the prior configured switch state.
globalThis.fetch = async () => {
  throw new Error('network down');
};
const failedInput = { checked: true };
await pageState.toggleServerEnabled(
  { name: 'dw', enabled: false, state: 'disabled' },
  { target: failedInput },
);
assert.equal(failedInput.checked, false);

// The two disabled causes stay textually distinguishable.
pageState.status.value = { enabled: true, connected_count: 0, servers: [] };
assert.equal(
  pageState.stateLabel({ enabled: false, state: 'disabled' }),
  'Disabled — server switch off',
);
pageState.status.value = { enabled: false, connected_count: 0, servers: [] };
assert.equal(
  pageState.stateLabel({ enabled: true, state: 'disabled' }),
  'Disabled — global MCP is off',
);

console.log('mcp-webui: modal navigation, endpoint honesty, payloads, routes, confirmations, card toggle, and masked endpoint pinned');
process.exit(0);
