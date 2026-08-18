import assert from 'node:assert/strict';

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

const requests = [];
const llmState = {
  active_provider: 'codex',
  active_model: 'gpt-5.6-terra',
  codex: {
    configured: true,
    enabled: true,
    model: 'gpt-5.6-terra',
    reasoning_effort: 'high',
    agent_reasoning_effort: null,
    agent_model: null,
    request_timeout_seconds: 3600,
    stream_stall_timeout_seconds: 180,
    retry: { max_retries: 3, base_delay: 1, max_delay: 30 },
    connection_pool: { max_connections: 10, keepalive_timeout: 30 },
    context_compression: { enabled: true, max_context_chars: 750000, keep_recent_iterations: 30 },
  },
  ollama: {
    configured: true,
    enabled: true,
    base_url: 'http://127.0.0.1:11434',
    model: 'llama3',
    max_tokens: 4096,
    timeout: 300,
    has_api_key: false,
  },
  kimi: {
    configured: true,
    enabled: true,
    model: 'kimi-k2',
    max_tokens: 4096,
    timeout: 300,
    has_api_key: true,
  },
  auxiliary: { enabled: false, model: 'gpt-5.6-luna' },
};
const contextWindowsState = {
  utilization: 60,
  max_context_chars: null,
  models: {
    'gpt-5.6-sol': {
      floor: 921601, override: null, active_clamp: null, provenance: 'built-in', clamp_expires_at: null,
      configured: { effective_budget: 921601, primary_chars: 1277400 },
      effective: { effective_budget: 921601, primary_chars: 1277400 },
    },
  },
  clamps: [{ account_key: 'a'.repeat(32), model: 'gpt-5.6-sol', value: 300000, expires_at: '2026-08-19T12:00:00Z' }], evidence: { version: 1, accounts: {} },
};
const globalConfig = {
  discord: {
    allowed_users: ['441'],
    channels: ['100'],
    respond_to_bots: true,
    require_mention: true,
    ignore_bot_ids: [],
  },
};
let guildRevision = 0;
let guildSnapshotAtRequest = false;
const deferred = new Map();
const failed = new Map();
function defer(path) {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  deferred.set(path, { promise, resolve });
  return deferred.get(path);
}
function failNext(path, status = 500) {
  failed.set(path, status);
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function providerConfig(path) {
  if (path.includes('/codex/')) return llmState.codex;
  if (path.includes('/ollama/')) return llmState.ollama;
  return llmState.kimi;
}

globalThis.fetch = async (path, options = {}) => {
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : null;
  requests.push({ method, path, body });
  if (path !== '/api/discord/guilds') {
    const gate = deferred.get(`${method} ${path}`);
    if (gate) {
      deferred.delete(`${method} ${path}`);
      await gate.promise;
    }
  }
  const failureStatus = failed.get(`${method} ${path}`);
  if (failureStatus) {
    failed.delete(`${method} ${path}`);
    return response({ error: 'injected save failure' }, failureStatus);
  }

  if (method === 'POST' && path === '/api/context/windows/clear') return response({ cleared: 1 });
  if (path === '/api/llm/status') return response(llmState);
  if (path === '/api/context/windows') return response(contextWindowsState);
  if (path === '/api/codex/status') return response({ configured: true, accounts: [] });
  if (path === '/api/ollama/status') return response({ configured: true, model: llmState.ollama.model, health: { healthy: true } });
  if (path === '/api/ollama/models') return response({ active_model: llmState.ollama.model, models: [{ name: 'llama3', size: 10 }, { name: 'qwen', size: 20 }] });
  if (path === '/api/kimi/status') return response({ configured: true, model: llmState.kimi.model, health: { healthy: true } });
  if (path === '/api/kimi/models') return response({ models: ['kimi-k2', 'kimi-next'] });
  if (method === 'PUT' && /^\/api\/llm\/(codex|ollama|kimi)\/config$/.test(path)) {
    Object.assign(providerConfig(path), body);
    if (path.includes('/codex/')) {
      if ('context_budget_overrides' in body) {
        contextWindowsState.models['gpt-5.6-sol'].override = body.context_budget_overrides['gpt-5.6-sol'] ?? null;
      }
      if ('context_utilization' in body) contextWindowsState.utilization = body.context_utilization;
    }
    return response({ status: 'updated' });
  }
  if (path === '/api/discord/guilds') {
    const revision = guildSnapshotAtRequest ? guildRevision : null;
    const gate = deferred.get(`${method} ${path}`);
    if (gate) {
      deferred.delete(`${method} ${path}`);
      await gate.promise;
    }
    const visibleRevision = revision ?? guildRevision;
    return response([{
      id: 'g1',
      name: visibleRevision ? 'Refreshed Guild' : 'Original Guild',
      member_count: 1,
      icon_url: null,
      config: {},
      channels: [{
        id: 'c1', name: 'general', category: null, config: {},
        effective: { enabled: true, require_mention: true, respond_to_bots: true },
      }],
    }]);
  }
  if (path === '/api/discord/members') return response([]);
  if (path === '/api/config') return response(globalConfig);
  if (method === 'PUT' && path === '/api/discord/guild/g1/config') {
    guildRevision += 1;
    return response({ guild_id: 'g1', config: body });
  }
  throw new Error(`unexpected request: ${method} ${path}`);
};

const originalWarn = console.warn;
console.warn = message => {
  if (!String(message).includes('no active component instance')) originalWarn(message);
};

const { default: LLMConfigPage } = await import('../ui/js/pages/llm-config.js');
const llm = LLMConfigPage.setup();
await llm.fetchAll();
assert.equal(llm.contextBudgetRows.value[0].primaryChars, 1277400, 'Context target did not come from GET /api/context/windows');
const lateContextRefresh = defer('GET /api/context/windows');
const contextRefresh = llm.fetchContextWindows();
await Promise.resolve();
llm.setContextOverride('gpt-5.6-sol', { target: { value: '800000' } });
llm.setContextUtilization({ target: { value: '72' } });
lateContextRefresh.resolve();
await contextRefresh;
assert.equal(llm.codexForm.value.context_budget_overrides['gpt-5.6-sol'], 800000, 'late context-window GET erased an unsaved override');
assert.equal(llm.codexForm.value.context_utilization, 72, 'late context-window GET erased unsaved utilization');
contextWindowsState.models['gpt-5.6-sol'].effective.primary_chars = 111111;
const olderWindows = defer('GET /api/context/windows');
const olderWindowsRequest = llm.fetchContextWindows();
await Promise.resolve();
const newerWindowsRequest = llm.fetchContextWindows();
await newerWindowsRequest;
assert.equal(llm.contextBudgetRows.value[0].primaryChars, 111111, 'newest context-window response did not render');
contextWindowsState.models['gpt-5.6-sol'].effective.primary_chars = 222222;
olderWindows.resolve();
await olderWindowsRequest;
assert.equal(llm.contextBudgetRows.value[0].primaryChars, 111111, 'older context-window response overwrote newer derivation truth');
contextWindowsState.models['gpt-5.6-sol'].effective.primary_chars = 1277400;
const clearBefore = requests.length;
await llm.clearContextClamp(contextWindowsState.clamps[0]);
const clearRequest = requests.slice(clearBefore).find(request => request.method === 'POST' && request.path === '/api/context/windows/clear');
assert.deepEqual(clearRequest?.body, { account_key: 'a'.repeat(32), model: 'gpt-5.6-sol' }, 'clamp clear lost account/model scope');
assert.equal(requests.slice(clearBefore).some(request => request.method === 'GET' && request.path === '/api/context/windows'), true, 'clamp clear did not refresh derivation truth');
assert.equal(llm.codexForm.value.context_budget_overrides['gpt-5.6-sol'], 800000, 'clamp clear erased an unsaved override');
assert.equal(llm.codexForm.value.context_utilization, 72, 'clamp clear erased unsaved utilization');

const providerCases = [
  {
    name: 'codex',
    draft: () => { llm.codexForm.value.request_timeout_seconds = 9876; },
    changeBasic: () => { llm.codexForm.value.model = 'gpt-5.6-sol'; },
    save: llm.saveCodexConfig,
    saveAdvanced: llm.saveCodexAdvancedConfig,
    advancedKeys: ['request_timeout_seconds', 'stream_stall_timeout_seconds', 'retry', 'connection_pool', 'context_compression', 'context_budget_overrides', 'context_utilization'],
    serverAdvanced: () => llmState.codex.request_timeout_seconds,
    draftAdvanced: () => llm.codexForm.value.request_timeout_seconds,
    oldValue: 3600,
    draftValue: 9876,
  },
  {
    name: 'ollama',
    draft: () => { llm.ollamaForm.value.timeout = 777; },
    changeBasic: () => { llm.ollamaForm.value.model = 'qwen'; },
    save: llm.saveOllamaConfig,
    saveAdvanced: llm.saveOllamaAdvancedConfig,
    advancedKeys: ['timeout'],
    serverAdvanced: () => llmState.ollama.timeout,
    draftAdvanced: () => llm.ollamaForm.value.timeout,
    oldValue: 300,
    draftValue: 777,
  },
  {
    name: 'kimi',
    draft: () => { llm.kimiForm.value.timeout = 666; },
    changeBasic: () => { llm.kimiForm.value.model = 'kimi-next'; },
    save: llm.saveKimiConfig,
    saveAdvanced: llm.saveKimiAdvancedConfig,
    advancedKeys: ['timeout'],
    serverAdvanced: () => llmState.kimi.timeout,
    draftAdvanced: () => llm.kimiForm.value.timeout,
    oldValue: 300,
    draftValue: 666,
  },
];

for (const testCase of providerCases) {
  testCase.draft();
  testCase.changeBasic();
  const before = requests.length;
  await testCase.save();
  const put = requests.slice(before).find(request =>
    request.method === 'PUT' && request.path === `/api/llm/${testCase.name}/config`
  );
  assert.ok(put, `${testCase.name} basic save did not issue its PUT`);
  for (const key of testCase.advancedKeys) {
    assert.equal(key in put.body, false, `${testCase.name} basic save leaked Advanced key ${key}`);
  }
  assert.equal(testCase.serverAdvanced(), testCase.oldValue, `${testCase.name} basic save changed server Advanced state`);
  assert.equal(testCase.draftAdvanced(), testCase.draftValue, `${testCase.name} basic refresh erased the unsaved Advanced draft`);

  const advancedBefore = requests.length;
  await testCase.saveAdvanced();
  const advancedPut = requests.slice(advancedBefore).find(request =>
    request.method === 'PUT' && request.path === `/api/llm/${testCase.name}/config`
  );
  assert.ok(advancedPut, `${testCase.name} explicit Advanced save did not issue its PUT`);
  assert.deepEqual(
    Object.keys(advancedPut.body).sort(),
    [...testCase.advancedKeys].sort(),
    `${testCase.name} explicit Advanced save crossed into basic fields`,
  );
  assert.equal(testCase.serverAdvanced(), testCase.draftValue, `${testCase.name} explicit Advanced save did not update server state`);
}
assert.equal(llmState.codex.context_budget_overrides['gpt-5.6-sol'], 800000, 'Context override was not persisted by the Advanced save');
assert.equal(llmState.codex.context_utilization, 72, 'Context utilization was not persisted by the Advanced save');
assert.equal(llm.contextPolicyDirty.value, false, 'successful unchanged Advanced save did not clear context-policy dirty state');
const postSaveRefresh = defer('GET /api/context/windows');
const postSaveRequest = llm.fetchContextWindows();
await Promise.resolve();
llm.setContextOverride('gpt-5.6-sol', { target: { value: '810000' } });
llm.setContextUtilization({ target: { value: '73' } });
postSaveRefresh.resolve();
await postSaveRequest;
assert.equal(llm.codexForm.value.context_budget_overrides['gpt-5.6-sol'], 810000, 'late post-save GET erased a newer override');
assert.equal(llm.codexForm.value.context_utilization, 73, 'late post-save GET erased newer utilization');


// A response that finishes after a newer edit must not repopulate either axis
// from server truth and erase that edit.
const midFlightCases = [
  {
    name: 'codex',
    start: () => llm.saveCodexConfig(),
    editBasic: () => { llm.codexForm.value.agent_model = 'gpt-5.6-luna'; },
    editAdvanced: () => { llm.codexForm.value.request_timeout_seconds = 5432; },
    basicValue: () => llm.codexForm.value.agent_model,
    advancedValue: () => llm.codexForm.value.request_timeout_seconds,
    expectedBasic: 'gpt-5.6-luna', expectedAdvanced: 5432,
  },
  {
    name: 'ollama',
    start: () => llm.saveOllamaConfig(),
    editBasic: () => { llm.ollamaForm.value.base_url = 'http://new-host:11434'; },
    editAdvanced: () => { llm.ollamaForm.value.timeout = 543; },
    basicValue: () => llm.ollamaForm.value.base_url,
    advancedValue: () => llm.ollamaForm.value.timeout,
    expectedBasic: 'http://new-host:11434', expectedAdvanced: 543,
  },
  {
    name: 'kimi',
    start: () => llm.saveKimiConfig(),
    editBasic: () => { llm.kimiForm.value.max_tokens = 16384; },
    editAdvanced: () => { llm.kimiForm.value.timeout = 432; },
    basicValue: () => llm.kimiForm.value.max_tokens,
    advancedValue: () => llm.kimiForm.value.timeout,
    expectedBasic: 16384, expectedAdvanced: 432,
  },
];
for (const testCase of midFlightCases) {
  const gate = defer(`PUT /api/llm/${testCase.name}/config`);
  const save = testCase.start();
  await Promise.resolve();
  testCase.editBasic();
  testCase.editAdvanced();
  gate.resolve();
  await save;
  assert.equal(testCase.basicValue(), testCase.expectedBasic, `${testCase.name} basic edit made during save was erased`);
  assert.equal(testCase.advancedValue(), testCase.expectedAdvanced, `${testCase.name} Advanced edit made during save was erased`);
}


// A failed provider save must not delete edits made while that request was in
// flight. This is particularly important for write-only API key replacements.
llm.ollamaForm.value.api_key = 'first-key';
llm.ollamaKeyDirty.value = true;
const failedKeySave = defer('PUT /api/llm/ollama/config');
failNext('PUT /api/llm/ollama/config');
const failedSave = llm.saveOllamaConfig();
await Promise.resolve();
llm.ollamaForm.value.api_key = 'second-key';
llm.ollamaKeyDirty.value = true;
failedKeySave.resolve();
await failedSave;
assert.equal(llm.ollamaForm.value.api_key, 'second-key', 'failed Ollama save erased a newer API-key replacement');
assert.equal(llm.ollamaKeyDirty.value, true, 'failed Ollama save marked a newer API-key replacement clean');

const { default: DiscordConfigPage } = await import('../ui/js/pages/discord-config.js');
const discord = DiscordConfigPage.setup();
await discord.fetchAll();
discord.globalDraft.value.require_mention = false;
const draftBefore = JSON.stringify(discord.globalDraft.value);
const requestStart = requests.length;
await discord.setGuildConfig('g1', 'enabled', false);
const overrideRequests = requests.slice(requestStart);
assert.equal(JSON.stringify(discord.globalDraft.value), draftBefore, 'guild override erased the dirty global draft');
assert.equal(discord.guilds.value[0].name, 'Refreshed Guild', 'guild override did not render refreshed guild data');
assert.equal(overrideRequests.some(request => request.path === '/api/config'), false, 'guild override refreshed global config');
assert.equal(overrideRequests.some(request => request.path === '/api/discord/guilds'), true, 'guild override did not refresh guild data');

guildRevision = 0;
guildSnapshotAtRequest = true;
const firstGuildFetch = defer('GET /api/discord/guilds');
const olderRefresh = discord.fetchGuilds({ showLoading: false });
await Promise.resolve();
guildRevision = 1;
await discord.fetchGuilds({ showLoading: false });
const newestGuildName = discord.guilds.value[0].name;
firstGuildFetch.resolve();
await olderRefresh;
guildSnapshotAtRequest = false;
assert.equal(discord.guilds.value[0].name, newestGuildName, 'older guild refresh overwrote newer guild/channel data');

console.warn = originalWarn;
console.log('config-save-boundaries: provider Advanced drafts and Discord global drafts survive unrelated saves');
