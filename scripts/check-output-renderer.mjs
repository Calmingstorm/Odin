import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { parseOutput, foldText } from '../ui/js/output-format.js';

// Fixtures mirror the actual serializers, not an invented unified envelope.
const tool = { kind: 'tool_output', status: 'succeeded', retention: 'retained', result_id: 'r',
  expires_at: '2026-09-07T00:00:00Z', total_chars: 20000, total_bytes: 20002,
  offset_unit: 'unicode_code_points', start: 0, end: 12, head: 'hello\nworldé',
  tail: { start: 19996, end: 20000, text: 'tail' }, tail_is_context_only: true,
  truncated: true, cursor: 'r:12', retrieval: { tool: 'get_tool_output', arguments: { cursor: 'r:12', limit: 4000 } } };
const toolPage = { ...tool, text: 'page\nline', start: 12, end: 21 };
delete toolPage.head; delete toolPage.tail; delete toolPage.tail_is_context_only;
const failed = { kind: 'tool_output', status: 'unknown', retention: 'failed', error: 'storage unavailable',
  truncated: true, cursor: null, head: 'head\nline', tail: { text: 'tail\nline' } };
const processMeta = { kind: 'process_output', pid: 42, generation: 'g', status: 'running', exit_code: null,
  emitted_bytes: 9000, retained_bytes: 8000, shown_bytes: 6, shown_intervals: [[8994, 9000]],
  capture_limit_loss_bytes: 1000, not_retained_bytes: 1000, capture_error: '', expires_at: null,
  retention_seconds_after_exit: 86400, truncated: true, cursor: 'g:0',
  retrieval: { tool: 'manage_process', arguments: { action: 'poll', pid: 42, cursor: 'g:0', limit: 4000 } } };
const processPreview = `[PID 42] status=running uptime=12s output_bytes=9000\nrecent\n[output retention] ${JSON.stringify(processMeta)}`;
const processPage = { ...processMeta, text: 'a\nb\nc\n', shown_intervals: [[0, 6]], cursor: 'g:6' };
const agent = { id: 'agent-1', label: 'test', status: 'completed', preview: 'é\nresult', original_bytes: 99,
  result_bytes: 90, error_bytes: 9, source_original_bytes: 100, offset: 0, end: 9, truncated: true,
  cursor: 'digest:9', iteration_count: 2, runtime_seconds: 5, tools_used: ['read_file'], tools_omitted: 0 };
const audit = { kind: 'audit_preview', audit_clipped: true, original_chars: 22000, preview: 'short\npreview',
  source: { kind: 'process_output', status: 'running', truncated: false, retention: 'failed', capture_limit_loss_bytes: 13 } };
const fixtures = [[tool, 'tool_output'], [toolPage, 'tool_output'], [failed, 'tool_output'],
  [processPreview, 'process_output'], [processPage, 'process_output'], [agent, 'agent_result'], [audit, 'audit_preview']];
for (const [fixture, kind] of fixtures) {
  assert.equal(parseOutput(typeof fixture === 'string' ? fixture : JSON.stringify(fixture)).kind, kind);
}
assert.equal(parseOutput(tool).sections.length, 2);
assert.match(parseOutput(tool).sections[1].label, /Tail context only.*code points.*not a continuation/);
assert.match(parseOutput(processPreview).sections[0].label, /byte 0.*UTF-8 bytes/);
assert.match(parseOutput(agent).sections[0].label, /UTF-8 bytes/);
assert.ok(parseOutput(audit).header.includes('source truncated: false'));
assert.ok(!parseOutput(audit).header.includes('source truncated: yes'));
assert.equal(parseOutput('plain\\nnot newline').sections[0].text, 'plain\\nnot newline');
assert.equal(parseOutput(JSON.stringify({ x: 1 })).sections[0].text, '{\n  "x": 1\n}');
assert.equal(parseOutput('{invalid json').kind, 'text');
assert.equal(parseOutput({ kind: 'audit_preview', audit_clipped: true }).kind, 'audit_preview');
const emptyProcess = { ...processPage, text: '', emitted_bytes: 0, retained_bytes: 0, shown_bytes: 0, shown_intervals: [], not_retained_bytes: 0, capture_limit_loss_bytes: 0, truncated: false, cursor: null };
assert.equal(parseOutput(emptyProcess).kind, 'process_output');
for (const invalid of [{ kind: 'tool_output', text: 'fake' }, { ...tool, end: 30000 },
  { ...tool, tail: { ...tool.tail, end: 30000 } }, { ...tool, head: {} },
  { ...processPage, shown_intervals: [[0, 9000]] }, { ...agent, end: 100 },
  { ...agent, original_bytes: '99' }, { ...audit, audit_clipped: 'true' }]) assert.equal(parseOutput(invalid).kind, 'json');
assert.equal(parseOutput(processPreview.replace('[PID 42]', '[PID 43]')).kind, 'text');
assert.equal(foldText('x\n'.repeat(100)).text.split('\n').length, 30);
assert.equal(foldText('.'.repeat(100000)).text.length, 6000);
assert.equal([...foldText('𝄞'.repeat(10000)).text].length, 6000);
assert.equal(foldText('short').folded, false);
assert.equal(foldText('x', 0).text, '');
console.log('output-format: real envelope schemas, malformed fallbacks, offset units, audit/source separation, Unicode + line folding pass');

const server = await createServer({ configFile: false, root: process.cwd(), appType: 'custom',
  resolve: { alias: { vue: 'vue/dist/vue.esm-bundler.js' } },
  define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  server: { host: '127.0.0.1', port: 0, watch: null } });
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body { margin: 0; } * { box-sizing: border-box; }</style></head><body><div id="app"></div>
<script type="module">
import '/ui/css/style.css'; import '/ui/css/foundation.css'; import '/ui/css/tailwind.css';
import { createApp, h, ref, nextTick } from 'vue';
import ToolOutput from '/ui/js/tool-output.js';
import Execution from '/ui/js/pages/execution.js';
import Agents from '/ui/js/pages/agents.js';
import { ws } from '/ui/js/api.js';
const value = ref(''), mode = ref('output'), view = ref(null);
const handlers = new Map(); ws.on = (key, fn) => handlers.set(key, fn); ws.off = key => handlers.delete(key);
window.emitExecution = event => handlers.get('events')?.(event);
window.setOutput = async v => { mode.value = 'output'; value.value = v; await nextTick(); };
window.setMode = async m => { mode.value = m; await nextTick(); window.view = view.value; };
createApp({ render: () => mode.value === 'output' ? h(ToolOutput, { value: value.value }) : h(mode.value === 'execution' ? Execution : Agents, { ref: view }) })
  .component('odin-icon', { template: '<span></span>' }).directive('modal-focus', {}).mount('#app');
window.ready = true;
</script></body></html>`;
server.middlewares.use(async (req, res, next) => {
  if (req.url !== '/__output_test__.html') return next();
  res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml(req.url, html));
});
let browser;
try {
  await server.listen();
  const executablePath = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find(p => fs.existsSync(p));
  assert.ok(executablePath, 'output renderer browser regression requires Chrome/Chromium');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let allRequests = 0; page.on('request', () => allRequests++);
  let requests = 0;
  await page.route('**/api/**', route => { requests++; return route.fulfill({ contentType: 'application/json', body: '[]' }); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__output_test__.html`);
  await page.waitForFunction(() => window.ready);
  await page.evaluate(() => { window.copiedText = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedText = text; } } }); });
  for (const [fixture, kind] of fixtures) {
    await page.evaluate(v => window.setOutput(v), typeof fixture === 'string' ? fixture : JSON.stringify(fixture));
    assert.equal(await page.locator('.output-summary strong').textContent(), kind);
    assert.ok((await page.locator('pre').allTextContents()).some(s => s.includes('\n') || s === 'recent'));
  }
  const hostile = '<img src=x onerror="window.pwned=true">\n<script>window.pwned=true</script>\nliteral \\n\n' + '𝄞'.repeat(18000);
  const largeTool = { ...tool, head: hostile, end: 18000, tail: { start: 19996, end: 20000, text: 'TAIL' } };
  const raw = JSON.stringify(largeTool);
  await page.evaluate(v => window.setOutput(v), raw);
  assert.equal(await page.locator('.output-renderer img, .output-renderer script').count(), 0);
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  assert.ok((await page.locator('pre').allTextContents()).reduce((n, s) => n + [...s].length, 0) <= 6000);
  const before = requests;
  const beforeAll = allRequests;
  await page.getByRole('button', { name: 'Expand received text', exact: true }).click();
  assert.equal(await page.locator('pre').first().textContent(), hostile);
  assert.equal(await page.locator('pre').nth(1).textContent(), 'TAIL');
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  assert.ok((await page.evaluate(() => window.copiedText)).includes(hostile));
  await page.getByRole('button', { name: 'Wrap', exact: true }).click();
  assert.equal(await page.locator('pre').first().evaluate(el => getComputedStyle(el).whiteSpace), 'pre');
  const widths = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(widths.scroll <= widths.client, `raw pre widened mobile: ${JSON.stringify(widths)}`);
  await page.getByRole('button', { name: 'Raw', exact: true }).click();
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  assert.equal(await page.evaluate(() => window.copiedText), raw, 'raw copy includes exact full received value even folded');
  assert.equal(requests, before, 'expansion, raw, wrap, copy never retrieve');
  assert.equal(allRequests, beforeAll, 'local controls trigger no network requests of any kind');
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('denied'); }; });
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  assert.match(await page.getByRole('status').textContent(), /Copy unavailable/);
  await page.evaluate(() => setOutput('line\n'.repeat(100)));
  assert.equal((await page.locator('pre').textContent()).split('\n').length, 30);

  // Real Operations page, not a duplicate test view: agent/call correlation.
  await page.evaluate(() => setMode('execution'));
  await page.evaluate(result => {
    for (const agent_id of ['a', 'b']) emitExecution({ type: 'loop_tool_start', action: 'read_file', agent_id, call_id: 'same', tool_input: { path: '/example' } });
    emitExecution({ type: 'loop_tool', action: 'read_file', agent_id: 'b', call_id: 'same', detail: result, duration_ms: 12 });
    emitExecution({ tool_name: 'read_file', audit_observer: true, result_summary: result });
    emitExecution({ type: 'tool_start', action: 'read_file', metadata: { call_id: 'main' } });
    emitExecution({ type: 'loop_tool', action: 'read_file', detail: 'legacy loop must not close main' });
  }, JSON.stringify(tool));
  const states = await page.evaluate(() => view.activeTasks.map(t => [t.agentId, t.status]));
  assert.deepEqual(states, [['', 'running'], ['b', 'success'], ['a', 'running']]);
  assert.equal(await page.locator('[aria-label="Tool result"] .output-summary strong').textContent(), 'tool_output');
  assert.equal(await page.locator('summary').filter({ hasText: 'Arguments' }).count(), 2);
  await page.waitForFunction(() => view.recentHistory.length === 1);
  assert.equal(await page.locator('[aria-label="Recent tool result"] .output-summary strong').textContent(), 'tool_output');
  assert.equal(await page.locator('summary').filter({ hasText: 'Arguments' }).count(), 2, 'completed agent arguments remain visible');
  await page.evaluate(() => emitExecution({ type: 'loop_tool', action: 'read_file', agent_id: 'a', call_id: 'same', metadata: { status: 'denied' } }));
  assert.equal(await page.evaluate(() => view.activeTasks.find(t => t.agentId === 'a').status), 'error');
  await page.evaluate(() => setMode('agents'));
  await page.evaluate(result => { view.detailId = 'agent-1'; view.detail = { id: 'agent-1', label: 'test', status: 'completed', result, goal: 'goal', tools_used: [] }; }, JSON.stringify(agent));
  assert.equal(await page.locator('[aria-label="Agent result"] .output-summary strong').textContent(), 'agent_result');
  assert.deepEqual(errors, []);
  console.log('output-renderer browser: all contracts, safe multiline DOM, local controls/copy, combined folding budget, mobile overflow, Operations correlation + agent modal pass');
} finally {
  if (browser) await browser.close();
  await server.close();
}
