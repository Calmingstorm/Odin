import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MCPFormError,
  buildMCPServerPayload,
  mcpConnectionEditNeedsConfirmation,
  mcpToolMatches,
  normalizeMCPState,
} from '../ui/js/mcp-config-policy.js';

const page = readFileSync('ui/js/pages/mcp-servers.js', 'utf8');
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
assert.equal(mcpConnectionEditNeedsConfirmation(form({ command: '' }), 'stdio'), false);
assert.equal(mcpConnectionEditNeedsConfirmation(form({ command: '/new/path' }), 'stdio'), true);
assert.equal(mcpConnectionEditNeedsConfirmation(form({ transport: 'http', command: '', url: 'https://mcp.example/mcp' }), 'stdio'), true);

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
assert.match(page, /mcpConnectionEditNeedsConfirmation[\s\S]*Save and reconnect/);
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

console.log('mcp-webui: payload honesty, owner routing, state vocabulary, routes, confirmations, and docs pinned');
