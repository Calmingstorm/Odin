import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { baseParse, compile, NodeTypes } from '@vue/compiler-dom';
import * as Vue from 'vue';

// Compile the production modal against both historical and additive records.
async function checkAgentRecordRendering() {
  const { default: page } = await import('../ui/js/pages/agents.js');
  const savedWarn = console.warn;
  console.warn = () => {};
  try {
    const state = page.setup();
    const render = new Function('Vue', compile(page.template, { mode: 'function' }).code)(Vue);
    const text = node => {
      if (typeof node === 'string') return node;
      if (Array.isArray(node)) return node.map(text).join(' ');
      return node && typeof node === 'object' ? text(node.children) : '';
    };
    state.loading.value = false;
    state.detailId.value = 'fixture';
    const legacy = {id: 'fixture', label: 'worker', status: 'completed', result: 'legacy result',
      goal: 'goal', error: '', iteration_count: 2, runtime_seconds: 1, tools_used: []};
    state.detail.value = legacy;
    let output = text(render(Vue.proxyRefs(state), []));
    assert.match(output, /legacy result/);
    assert.match(output, /Not recorded/);
    state.detail.value = {...legacy, result: 'native result', activity: 'waiting for children for 180s',
      tool_execution_count: 4, pending_inbox_count: 2, last_consumed_sequence: 3};
    output = text(render(Vue.proxyRefs(state), []));
    assert.match(output, /native result/);
    assert.match(output, /waiting for children for 180s/);
    assert.match(output, /2 queued; consumed sequence 3/);
    assert.doesNotMatch(output, /\[object Object\]/);
  } finally {
    console.warn = savedWarn;
  }
}

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
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (...args) => {
  const timer = realSetTimeout(...args);
  timer.unref?.();
  return timer;
};
globalThis.document = {
  createElement() { return {}; },
  querySelectorAll() { return []; },
};
globalThis.window = {
  matchMedia() { return { matches: false }; },
  setInterval, clearInterval, setTimeout: globalThis.setTimeout, clearTimeout,
  location: { hash: '#dashboard' },
};
globalThis.location = { protocol: 'http:', host: 'localhost', hash: '#dashboard' };
await checkAgentRecordRendering();

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function tick() {
  return new Promise(resolve => setImmediate(resolve));
}

function staticClass(node) {
  return node.props?.find(prop => prop.type === NodeTypes.ATTRIBUTE && prop.name === 'class')?.value?.content || '';
}

function hasClass(node, name) {
  return staticClass(node).split(/\s+/).includes(name);
}

function directive(node, name) {
  return node.props?.find(prop => prop.type === NodeTypes.DIRECTIVE && prop.name === name);
}

function descendants(node, predicate, out = []) {
  if (node.type === NodeTypes.ELEMENT && predicate(node)) out.push(node);
  for (const child of node.children || []) descendants(child, predicate, out);
  return out;
}

const quietWarn = console.warn;
console.warn = () => {};
const [
  { default: toolsPage },
  { default: knowledgePage },
  { default: dashboardPage },
  { default: chatPage },
  { default: llmPage },
  { default: discordPage },
] = await Promise.all([
  import('../ui/js/pages/tools.js'),
  import('../ui/js/pages/knowledge.js'),
  import('../ui/js/pages/dashboard.js'),
  import('../ui/js/pages/chat.js'),
  import('../ui/js/pages/llm-config.js'),
  import('../ui/js/pages/discord-config.js'),
]);
console.warn = quietWarn;

// ---------------------------------------------------------------------------
// Tools truth: absent admin inventory means UNKNOWN provenance. Source-specific
// counts and switches disappear, and both views carry schema parameters.
// ---------------------------------------------------------------------------
{
  globalThis.fetch = async () => response({});
  console.warn = () => {};
  const state = toolsPage.setup();
  console.warn = quietWarn;
  state.applyInventory(null, [
    { name: 'kubectl', description: 'looks builtin', is_core: false },
    { name: 'mcp_X_probe', description: 'looks MCP', is_core: false },
    { name: 'run_command', description: 'core-looking', is_core: true },
  ]);
  assert.equal(state.inventoryAvailable.value, false);
  assert.equal(state.globalEnabled.value, null);
  assert.deepEqual(new Set(state.tools.value.map(tool => tool.source)), new Set(['unknown']));
  assert.equal(state.coreCount.value, 0);
  assert.equal(state.skillCount.value, 0);
  assert.equal(state.tools.value.some(tool => tool.enabled !== undefined), false);

  const schema = {
    properties: { command: { type: 'string' } },
    required: ['command'],
  };
  state.applyInventory({
    global_enabled: true,
    tools: [{ name: 'run_command', is_core: true, enabled: true, state: 'available', input_schema: schema }],
  }, []);
  assert.equal(state.inventoryAvailable.value, true);
  assert.deepEqual(state.tools.value[0].input_schema, schema);

  const ast = baseParse(toolsPage.template);
  const statCards = descendants(ast, node => hasClass(node, 'tl-stat-card'));
  const sourceCards = statCards.filter(node => {
    const text = node.loc.source;
    return text.includes('Core Tools') || text.includes('Skill Tools');
  });
  assert.equal(sourceCards.length, 2);
  for (const card of sourceCards) {
    assert.equal(directive(card, 'if')?.exp?.content, 'inventoryAvailable');
  }
  const switches = descendants(ast, node => hasClass(node, 'tl-tool-switch'));
  assert.ok(switches.length >= 2);
  for (const node of switches) {
    assert.equal(directive(node, 'if')?.exp?.content, "t.source === 'builtin'");
  }
  const card = descendants(ast, node => hasClass(node, 'tl-tool-card'))[0];
  const tableDetail = descendants(ast, node => hasClass(node, 'tool-detail-row'))[0];
  assert.ok(descendants(card, node => hasClass(node, 'tl-tool-params')).length === 1,
    'card expanded detail lost Parameters');
  assert.ok(descendants(tableDetail, node => hasClass(node, 'tl-tool-params')).length === 1,
    'table expanded detail lost Parameters');
}

// ---------------------------------------------------------------------------
// Knowledge: concurrent source loads own independent spinners and completion;
// failed loads cache no empty list, then collapse/re-expand retries.
// ---------------------------------------------------------------------------
{
  const pending = new Map();
  const calls = [];
  globalThis.fetch = path => {
    calls.push(path);
    const gate = deferred();
    pending.set(path, gate);
    return gate.promise;
  };
  console.warn = () => {};
  const state = knowledgePage.setup();
  console.warn = quietWarn;
  const alphaPath = '/api/knowledge/alpha/chunks';
  const betaPath = '/api/knowledge/beta/chunks';
  const alpha = state.toggleSource('alpha');
  const beta = state.toggleSource('beta');
  assert.equal(state.loadingChunks.value.alpha, true);
  assert.equal(state.loadingChunks.value.beta, true);

  pending.get(alphaPath).resolve(response([{ chunk_id: 'a', chunk_index: 0, char_count: 1, content: 'A' }]));
  await alpha;
  assert.equal(state.loadingChunks.value.alpha, undefined);
  assert.equal(state.loadingChunks.value.beta, true, 'alpha completion cross-cleared beta spinner');
  assert.equal(state.sourceChunks.value.alpha[0].content, 'A');

  pending.get(betaPath).resolve(response({ error: 'beta failed' }, 500));
  await beta;
  assert.equal(state.loadingChunks.value.beta, undefined);
  assert.match(state.chunkErrors.value.beta, /beta failed/);
  assert.equal(Object.hasOwn(state.sourceChunks.value, 'beta'), false, 'failure cached fabricated empty chunks');

  await state.toggleSource('beta'); // collapse
  const retry = state.toggleSource('beta'); // expand + retry
  assert.equal(calls.filter(path => path === betaPath).length, 2);
  pending.get(betaPath).resolve(response([]));
  await retry;
  assert.deepEqual(state.sourceChunks.value.beta, []);
  assert.equal(state.chunkErrors.value.beta, undefined);

  // Same-source collapse/re-expand while held must reuse the in-flight request.
  const gammaPath = '/api/knowledge/gamma/chunks';
  const gamma = state.toggleSource('gamma');
  await state.toggleSource('gamma');
  const gammaAgain = state.toggleSource('gamma');
  assert.equal(calls.filter(path => path === gammaPath).length, 1);
  pending.get(gammaPath).resolve(response([]));
  await Promise.all([gamma, gammaAgain]);
}

// ---------------------------------------------------------------------------
// Dashboard: a failed REST error fetch never suppresses a newer live error.
// Detail uses the real `error` field and the template renders retained rows.
// ---------------------------------------------------------------------------
{
  globalThis.fetch = async path => {
    if (path.startsWith('/api/audit')) return response({ error: 'audit unavailable' }, 500);
    return response([]);
  };
  console.warn = () => {};
  const state = dashboardPage.setup();
  console.warn = quietWarn;
  await state.fetchErrors();
  assert.equal(state.errorsError.value, true);
  state.onEvent({ payload: {
    tool_name: 'run_command', timestamp: '2026-08-29T17:00:00Z', error: 'live failure',
  } });
  assert.equal(state.errorsError.value, false);
  assert.equal(state.errors.value[0].error, 'live failure');

  const ast = baseParse(dashboardPage.template);
  const loadFailure = descendants(ast, node => hasClass(node, 'dash-load-failed'))[0];
  assert.equal(directive(loadFailure, 'if')?.exp?.content, 'errors.length === 0 && errorsError');
  const detail = descendants(ast, node => hasClass(node, 'dash-error-msg'))[0];
  assert.equal(directive(detail, 'if')?.exp?.content, 'e.error');
  assert.match(detail.loc.source, /\{\{ e\.error \}\}/);
  assert.match(dashboardPage.template, /Refresh failed — showing known errors/);
}

// ---------------------------------------------------------------------------
// Chat: 404 is the legitimate no-session case; other failures persist visibly.
// ---------------------------------------------------------------------------
{
  async function run(status) {
    globalThis.fetch = async path => {
      if (path === '/api/auth/session') return response({ channel_id: 'web-1' });
      if (path === '/api/sessions/web-1') return response({ error: status === 404 ? 'not found' : 'database down' }, status);
      return response({});
    };
    console.warn = () => {};
    const state = chatPage.setup();
    console.warn = quietWarn;
    await state.loadHistory();
    return state.historyError.value;
  }
  assert.equal(await run(404), '');
  assert.match(await run(500), /earlier messages may be missing/i);
}

// ---------------------------------------------------------------------------
// LLM truth: each request has its own named failure flag and retains its last
// successful payload. Initial aggregate failure gets only an unknown shape.
// Codex Retry invokes the returned fetcher and clears its displayed error.
// ---------------------------------------------------------------------------
{
  const queues = new Map();
  function enqueue(path, ...items) { queues.set(path, items); }
  globalThis.fetch = async path => {
    const queue = queues.get(path) || [];
    assert.ok(queue.length, `unexpected LLM request ${path}`);
    const item = queue.shift();
    return item instanceof Response ? item : response(item.body, item.status);
  };
  const aggregate = {
    active_provider: 'codex', active_model: 'gpt-5.6-terra',
    codex: { configured: true, enabled: true, model: 'gpt-5.6-terra' },
    ollama: { configured: true, enabled: true, model: 'llama3' },
    kimi: { configured: true, enabled: true, model: 'kimi-k2' },
    auxiliary: { enabled: false, model: 'gpt-5.6-luna' },
  };
  enqueue('/api/llm/status', { body: aggregate, status: 200 }, { body: { error: 'down' }, status: 500 });
  console.warn = () => {};
  const state = llmPage.setup();
  console.warn = quietWarn;
  await state.fetchLLMStatus();
  assert.equal(state.llmStatus.value.active_model, 'gpt-5.6-terra');
  await state.fetchLLMStatus();
  assert.equal(state.llmStatusLoadFailed.value, true);
  assert.equal(state.llmStatus.value.active_model, 'gpt-5.6-terra', 'aggregate failure erased last good status');

  enqueue('/api/ollama/status',
    { body: { configured: true, model: 'llama3' }, status: 200 },
    { body: { error: 'down' }, status: 500 });
  enqueue('/api/ollama/models', { body: { models: [] }, status: 200 });
  await state.fetchOllamaStatus();
  await state.fetchOllamaStatus();
  assert.equal(state.ollamaStatusLoadFailed.value, true);
  assert.equal(state.ollamaStatus.value.configured, true);
  assert.equal(state.ollamaStatus.value.model, 'llama3');

  enqueue('/api/kimi/status',
    { body: { configured: true, model: 'kimi-k2' }, status: 200 },
    { body: { error: 'down' }, status: 500 });
  enqueue('/api/kimi/models', { body: { models: [] }, status: 200 });
  await state.fetchKimiStatus();
  await state.fetchKimiStatus();
  assert.equal(state.kimiStatusLoadFailed.value, true);
  assert.equal(state.kimiStatus.value.configured, true);
  assert.equal(state.kimiStatus.value.model, 'kimi-k2');

  enqueue('/api/codex/status',
    { body: { error: 'first failed' }, status: 500 },
    { body: { configured: true, account_count: 1, current_index: 0, accounts: [] }, status: 200 });
  await state.fetchCodexStatus();
  assert.match(state.codexError.value, /first failed/);
  await state.fetchCodexStatus();
  assert.equal(state.codexError.value, '');
  assert.equal(state.codexData.value.configured, true);

  // A brand-new page has no good aggregate to retain: failure is explicitly
  // unknown, never false/not-configured.
  enqueue('/api/llm/status', { body: { error: 'initial down' }, status: 500 });
  console.warn = () => {};
  const fresh = llmPage.setup();
  console.warn = quietWarn;
  await fresh.fetchLLMStatus();
  assert.equal(fresh.llmStatusLoadFailed.value, true);
  assert.equal(fresh.llmStatus.value.codex.configured, null);
  assert.equal(fresh.llmStatus.value.ollama.configured, null);
  assert.equal(fresh.llmStatus.value.kimi.configured, null);

  const ast = baseParse(llmPage.template);
  const retryButtons = descendants(ast, node => node.tag === 'button'
    && directive(node, 'on')?.arg?.content === 'click'
    && directive(node, 'on')?.exp?.content === 'fetchCodexStatus');
  assert.equal(retryButtons.length, 1, 'Codex Retry is not wired to fetchCodexStatus');

  // Compile the real template, find the rendered Retry control, and invoke its
  // actual onClick handler. This is click-through coverage rather than merely
  // proving that setup() exports a same-named function.
  state.loading.value = false;
  state.codexError.value = 'retry me';
  state.codexLoading.value = false;
  enqueue('/api/codex/status', {
    body: { configured: true, account_count: 2, current_index: 0, accounts: [] },
    status: 200,
  });
  const savedVueWarn = console.warn;
  console.warn = () => {};
  const render = new Function('Vue', compile(llmPage.template, { mode: 'function' }).code)(Vue);
  const vnode = render(Vue.proxyRefs(state), []);
  console.warn = savedVueWarn;
  function flattenVnodes(node, out = []) {
    if (!node) return out;
    if (Array.isArray(node)) {
      for (const child of node) flattenVnodes(child, out);
      return out;
    }
    if (typeof node !== 'object') return out;
    out.push(node);
    flattenVnodes(node.children, out);
    return out;
  }
  const renderedRetries = flattenVnodes(vnode)
    .filter(node => node.type === 'button' && node.children === 'Retry');
  assert.equal(renderedRetries.length, 1, 'Codex Retry did not render in the failure state');
  assert.equal(typeof renderedRetries[0].props?.onClick, 'function');
  await renderedRetries[0].props.onClick();
  assert.equal(state.codexError.value, '');
  assert.equal(state.codexData.value.account_count, 2);
}

// ---------------------------------------------------------------------------
// Discord guild controls: labels may contain inputs, never other labels.
// ---------------------------------------------------------------------------
{
  const ast = baseParse(discordPage.template);
  const labels = descendants(ast, node => node.tag === 'label');
  assert.ok(labels.length > 0);
  for (const label of labels) {
    const nested = descendants(label, node => node !== label && node.tag === 'label');
    assert.equal(nested.length, 0, `nested label remains: ${label.loc.source.slice(0, 100)}`);
  }
  const guildToggles = labels.filter(label => label.loc.source.includes('setGuildConfig'));
  assert.equal(guildToggles.length, 3);
  for (const label of guildToggles) {
    assert.equal(descendants(label, node => node.tag === 'input').length, 1);
  }
}

console.log('w1-webui: truth, failure, retry, concurrency, click-through, and markup contracts pinned');
process.exit(0);
