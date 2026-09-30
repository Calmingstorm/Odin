import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

// Native Vue lifecycle and Chromium input, on an ephemeral loopback fixture.
// No installed Odin server, desktop session, or production API is contacted.
const server = await createServer({
  configFile: false, root: process.cwd(), appType: 'custom',
  resolve: { alias: { vue: 'vue/dist/vue.esm-bundler.js' } },
  define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  server: { host: '127.0.0.1', port: 0, watch: null },
});
const html = `<!doctype html><div id="app"></div><script type="module">
import { createApp, h, ref, KeepAlive, nextTick } from 'vue';
import { api, ws } from '/ui/js/api.js';
import LLM from '/ui/js/pages/llm-config.js';
import MCP from '/ui/js/pages/mcp-servers.js';
import Health from '/ui/js/pages/health.js';
import Resources from '/ui/js/pages/resources.js';
import Processes from '/ui/js/pages/processes.js';
import Agents from '/ui/js/pages/agents.js';
import Loops from '/ui/js/pages/loops.js';
import Schedules from '/ui/js/pages/schedules.js';
import Internals from '/ui/js/pages/internals.js';
import Logs from '/ui/js/pages/logs.js';
import Sessions from '/ui/js/pages/sessions.js';
import Skills, { highlightPython } from '/ui/js/pages/skills.js';
import Traces from '/ui/js/pages/traces.js';
import Execution from '/ui/js/pages/execution.js';
import { DiscordIdentity } from '/ui/js/discord-identity.js';
import { DiscordUserCombobox } from '/ui/js/discord-user-combobox.js';
const pages = { LLM, MCP, Health, Resources, Processes, Agents, Loops, Schedules, Internals, Logs, Sessions, Skills, Traces, Execution };
const listeners = new Map(), states = new Set();
ws.subscribe = ws.on = (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); };
ws.unsubscribe = ws.off = (name, fn) => listeners.get(name)?.delete(fn);
ws.onState = fn => { states.add(fn); return () => states.delete(fn); };
window.emit = (name, payload) => { for (const fn of listeners.get(name) || []) fn(payload); };
window.connection = state => { for (const fn of states) fn(state); };
window.defer = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const normal = path => {
  if (path === '/api/llm/status') return { main_model: window.savedModel || 'gpt-6-luna', model_selection: { main: window.savedModel || 'gpt-6-luna' }, codex: { enabled: true }, ollama: { enabled: false }, openai_compatible: { enabled: false } };
  if (path === '/api/schedules/status') return { available: true, actions: { workflow: true, reminder: true, check: true } };
  if (path === '/api/mcp/status') return { enabled: true, servers: [{ name: 's', enabled: false, state: 'disabled' }] };
  if (path.includes('models') || path.includes('catalogue')) return { models: [] };
  if (path === '/api/agents/model') return { model: 'auto', auto_model_allowlist: [] };
  if (path === '/api/context/windows') return { models: {} };
  if (['/api/agents','/api/loops','/api/schedules','/api/processes','/api/sessions','/api/skills','/api/discord/members'].includes(path)) return [];
  if (path === '/api/resource-usage') return {};
  return {};
};
window.normal = normal;
window.resetAPI = () => { api.get = async path => normal(path); api.put = api.post = api.del = async () => ({}); };
window.resetAPI();
// A deterministic clock exercises reactive computed invalidation without sleeps.
const realNow = Date.now; let now = realNow(); Date.now = () => now;
const timers = new Map(); let timerId = 0;
window.setInterval = (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; };
window.clearInterval = id => timers.delete(id);
window.tick = async ms => { now += ms; for (const timer of [...timers.values()]) if (timer.ms === 1000) timer.fn(); await nextTick(); };
window.clockTimerCount = () => [...timers.values()].filter(timer => timer.ms === 1000).length;
let app = null, visible;
window.mount = async name => {
  app?.unmount(); window.resetAPI();
  const Page = pages[name]; visible = ref(true);
  const Wrapper = { setup() { window.state = Page.setup(); return () => h('div'); } };
  app = createApp({ render: () => h(KeepAlive, null, { default: () => visible.value ? h(Wrapper) : h('div') }) });
  app.mount('#app'); await nextTick(); await window.flush();
};
window.hide = async () => { visible.value = false; await nextTick(); };
window.show = async () => { visible.value = true; await nextTick(); await window.flush(); };
window.flush = async () => { for (let i=0;i<20;i++) await Promise.resolve(); await nextTick(); };
window.unmount = () => { app?.unmount(); app = null; };
window.api = api; window.highlightPython = highlightPython;
window.identityMount = async () => {
  app?.unmount(); window.resetAPI();
  window.identityId = ref('123456789012345671'); window.identityView = ref(null);
  app = createApp({ render: () => h(DiscordIdentity, { ref: window.identityView, userId: window.identityId.value }) });
  app.mount('#app'); await nextTick();
};
window.comboMount = async () => {
  app?.unmount(); window.selected = [];
  app = createApp({ render: () => h(DiscordUserCombobox, { optionsId: 'test-options', showAddButton: true,
    members: [{ id:'12345678901234567', display_name:'Alice', username:'alice' }], onSelect: id => window.selected.push(id) }) });
  app.mount('#app'); await nextTick();
};
window.ready = true;
</script>`;
server.middlewares.use(async (req, res, next) => {
  if (req.url !== '/fixture.html') return next();
  res.setHeader('Content-Type', 'text/html');
  res.end(await server.transformIndexHtml(req.url, html));
});
let browser;
try {
  await server.listen();
  const executablePath = process.env.CHROMIUM_PATH || ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(p => fs.existsSync(p));
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/fixture.html`);
  await page.waitForFunction(() => window.ready);

  // #517 latest draft drains serially, even if changed multiple times during PUT.
  await page.evaluate(async () => {
    await mount('LLM'); window.puts = []; const gate = defer();
    api.put = async (path, body) => { puts.push(body.model); if (puts.length === 1) await gate.promise; window.savedModel = body.model; return {}; };
    state.modelSelection.value.main = 'gpt-6-luna'; const first = state.saveMainModel();
    await flush(); state.modelSelection.value.main = 'gpt-6-sol'; await state.saveMainModel();
    state.modelSelection.value.main = 'gpt-6.1-sol'; await state.saveMainModel();
    gate.resolve(); await first; await flush();
  });
  assert.deepEqual(await page.evaluate(() => puts), ['gpt-6-luna', 'gpt-6.1-sol']);
  assert.equal(await page.evaluate(() => savedModel), 'gpt-6.1-sol');
  assert.equal(await page.evaluate(() => state.modelSelection.value.main), 'gpt-6.1-sol');

  // #518 routes, spinner and failures belong to the selected model/request.
  const routeResult = await page.evaluate(async () => {
    const gates = []; api.get = path => { if (path.endsWith('/endpoints')) { const g=defer(); gates.push(g); return g.promise; } return Promise.resolve(normal(path)); };
    const a=state.prepareOpenRouterModel({ id:'author/A' }); const b=state.prepareOpenRouterModel({ id:'author/B' });
    gates[1].resolve({ endpoints:[{ tag:'B' }] }); await b;
    gates[0].resolve({ endpoints:[{ tag:'A' }] }); await a;
    const result = [state.openRouterPendingModel.value.id, state.openRouterPendingEndpoints.value[0].tag, state.openRouterPendingLoading.value];
    const c=state.prepareOpenRouterModel({ id:'author/C' }); state.cancelOpenRouterPending(); gates[2].reject(new Error('stale')); await c;
    return { result, cancelled: state.openRouterPendingModel.value === null && !state.openRouterPendingLoading.value };
  });
  assert.deepEqual(routeResult, { result:['author/B','B',false], cancelled:true });

  // #519 an old GET cannot resurrect the server after acknowledged disable.
  assert.equal(await page.evaluate(async () => {
    await mount('MCP'); const old=defer(); let reads=0;
    api.get=()=>++reads===1 ? old.promise : Promise.resolve(normal('/api/mcp/status'));
    const poll=state.refreshAll(); api.post=async()=>normal('/api/mcp/status');
    const toggle=state.toggleServerEnabled({ name:'s', enabled:true }, { target:{checked:false} });
    await flush(); api.get=async()=>normal('/api/mcp/status');
    old.resolve({ enabled:true, servers:[{name:'s',enabled:true}] });
    await Promise.all([poll,toggle]); return state.status.value.servers[0].enabled;
  }), false);

  // #520 every affected real page: reverse completions, stale errors and
  // hidden completion. Lifecycle-owned requests include partial internals failures.
  for (const [name, method, data, path] of [
    ['Health','fetchHealth','data','/api/health/components'], ['Resources','refresh','data','/api/resource-usage'],
    ['Processes','fetchProcesses','processes','/api/processes'], ['Agents','fetchAgents','agents','/api/agents'],
    ['Loops','fetchLoops','loops','/api/loops'], ['Schedules','fetchSchedules','schedules','/api/schedules'],
    ['Internals','retry','startup','/api/startup'],
  ]) {
    const result = await page.evaluate(async ({name,method,data,path}) => {
      await mount(name); const gates=[];
      if (name==='Internals') path=state.endpoints[0].path;
      api.get = p => { if(p===path) {const g=defer(); gates.push(g); return g.promise;} return Promise.resolve(normal(p)); };
      const old=state[method](); const newer=state[method]();
      const value = label => ['processes','agents','loops','schedules'].includes(data) ? [{ marker:label }] : {marker:label};
      gates[1].resolve(value('new')); await newer; await flush();
      gates[0].resolve(value('old')); await old; await flush();
      const marker = () => (Array.isArray(state[data].value) ? state[data].value[0] : state[data].value)?.marker;
      const adopted=marker(); const errorRequest=state[method](); const successful=state[method]();
      gates[3].resolve(value('latest')); await successful; await flush(); gates[2].reject(new Error('obsolete')); await errorRequest; await flush();
      const staleError=state.error.value; const hidden=state[method](); await hide();
      gates[4].resolve(value('hidden')); await hidden; await flush();
      const hiddenMarker=marker();
      await show(); gates[5].resolve(value('reactivated')); await flush();
      return { adopted, marker:hiddenMarker, reactivated:marker(), staleError, loading:state.loading.value };
    }, {name,method,data,path});
    assert.equal(result.adopted,'new',name); assert.equal(result.marker,'latest',name);
    assert.equal(result.reactivated,'reactivated',name);
    assert.ok(!result.staleError, `${name}: stale error ignored`); assert.equal(result.loading,false,name);
  }

  // #521 props reused A -> B, B resolves first; original A is never shown with B.
  const identity = await page.evaluate(async () => {
    await identityMount(); await flush(); const gates={};
    api.get=path=>{const g=defer(); gates[path.split('/').pop()]=g;return g.promise;};
    identityId.value='123456789012345672'; await flush(); identityId.value='123456789012345673'; await flush();
    gates['123456789012345673'].resolve({user:{id:'123456789012345673',display_name:'B'}}); await flush();
    gates['123456789012345672'].resolve({user:{id:'123456789012345672',display_name:'A'}}); await flush();
    return document.querySelector('#app').textContent;
  });
  assert.ok(identity.includes('B')); assert.ok(!identity.includes('A')); assert.ok(identity.includes('123456789012345673'));

  // #522 native Enter, Space and pointer clicks on the explicit Add button.
  await page.evaluate(() => comboMount());
  for (const key of ['Enter','Space',null]) {
    await page.locator('input').fill('Alice');
    if (key) { await page.getByRole('button',{name:'Add',exact:true}).focus(); await page.keyboard.press(key); }
    else await page.getByRole('button',{name:'Add',exact:true}).click();
  }
  assert.deepEqual(await page.evaluate(()=>selected), Array(3).fill('12345678901234567'));

  // #523 exact source text after DOM parsing, including HTML-like Python strings.
  assert.equal(await page.evaluate(() => {
    const code='class Demo:\n    s = "str # class <b>& hello</b>"\n    # return 123\n    print(s)\n';
    const pre=document.createElement('pre'); pre.innerHTML=highlightPython(code); return pre.textContent===code;
  }),true);
  // #531 mixed lifecycle records count only loaded skills.
  assert.equal(await page.evaluate(async()=>{await mount('Skills');state.skills.value=[{status:'loaded'},{status:'disabled'},{status:'error'}];return state.enabledCount.value;}),1);

  // #524 long pause remains capped and loss is visible; bounded resume.
  const paused = await page.evaluate(async()=>{
    await mount('Logs'); state.togglePause();
    for(let i=0;i<10001;i++) emit('logs',{type:'log',line:JSON.stringify({timestamp:new Date(Date.now()).toISOString(),level:'INFO',message:'row '+i})});
    const result={buffer:state.pauseBuffer.value.length,dropped:state.pauseDropped.value};
    state.togglePause(); result.rows=state.logs.value.length; return result;
  });
  assert.deepEqual(paused,{buffer:2000,dropped:8001,rows:2000});
  assert.deepEqual(await page.evaluate(()=>{
    state.clearLogs(); state.togglePause();
    for(let i=0;i<10001;i++) emit('logs',{payload:{type:'tool_start',tool_name:'run_command',call_id:'reused',agent_id:'agent',iteration:1,message:'phase '+i}});
    return [state.pauseBuffer.value.length,state.pauseDropped.value];
  }),[2000,8001], 'raw correlated pause records cannot accumulate inside one merged row');
  await page.evaluate(()=>{state.clearLogs();state.togglePause();for(let i=0;i<2000;i++)emit('logs',{type:'log',line:JSON.stringify({timestamp:new Date(Date.now()).toISOString(),message:'idle '+i})});});

  // #525 idle clock invalidation, KeepAlive cleanup and activation refresh.
  assert.deepEqual(await page.evaluate(async()=>{
    state.timeRange.value='last_5m'; const before=state.filteredLogs.value.length; await tick(600000);
    const after=state.filteredLogs.value.length; await hide(); const hiddenTimers=clockTimerCount(); await show(); const shownTimers=clockTimerCount();
    return {before,after,hiddenTimers,shownTimers};
  }),{before:2000,after:0,hiddenTimers:0,shownTimers:1});
  assert.deepEqual(await page.evaluate(async()=>{
    await mount('Sessions'); state.sessions.value=[{channel_id:'idle',last_active:Date.now()/1000,message_count:1}];
    state.activePreset.value='active'; const before=state.filteredSessions.value.length; await tick(86400000); return [before,state.filteredSessions.value.length];
  }),[1,0]);

  // #526 run an adversarial valid pattern through actual filtering, timed by
  // the browser. RE2 is linear and rejects unsupported lookaround/backrefs.
  const regex = await page.evaluate(async()=>{
    await mount('Logs'); state.textFilter.value='(a+)+$'; state.useRegex.value=true;
    emit('logs',{type:'log',line:JSON.stringify({message:'a'.repeat(5000)+'!',level:'INFO'})});
    const start=performance.now(); const count=state.filteredLogs.value.length; const elapsed=performance.now()-start;
    state.textFilter.value='(?=a)'; const unsupported=state.regexError.value;
    return {count,elapsed,unsupported};
  });
  assert.equal(regex.count,0); assert.ok(regex.elapsed<1000,JSON.stringify(regex)); assert.ok(regex.unsupported);

  // #527 selected file sends all filters to server before the result limit.
  assert.equal(await page.evaluate(async()=>{
    await mount('Traces'); let requested='';api.get=async path=>{requested=path;return {entries:[{tools_used:['target'],is_error:true,channel_id:'c',user_id:'u'}]};};
    state.selectedFile.value='2026-09-29.jsonl'; state.filters.value={tool_name:'target',errors_only:true,channel_id:'c',user_id:'u',limit:1};
    await state.fetchTraces();const params=new URL(requested,location.origin).searchParams;
    return params.get('tool_name')==='target' && params.get('errors_only')==='true' && params.get('channel_id')==='c' && params.get('user_id')==='u' && state.entries.value.length===1;
  }),true);

  // #528 validates and submits the existing steps contract, including condition.
  const workflow=await page.evaluate(async()=>{
    await mount('Schedules');let posted=null;api.post=async(path,payload)=>{posted=payload;return {};};
    Object.assign(state.form.value,{action:'workflow',description:'test',channel_id:'c',cron:'0 * * * *',steps_str:'[]'});
    await state.doCreate(); const invalid=!!state.createError.value && !posted;
    state.form.value.steps_str=JSON.stringify([{tool_name:'run_command',tool_input:{host:'fixture',command:'uptime'},condition:'OK',on_failure:'continue'}]);
    await state.doCreate(); return {invalid,steps:posted?.steps,error:state.createError.value};
  });
  assert.equal(workflow.invalid,true); assert.equal(workflow.error,null); assert.equal(workflow.steps[0].condition,'OK');

  // #529 evidence gaps retire running cards as UNKNOWN, not fabricated success.
  // #530 independent channels, agents and iterations reuse model-local call IDs.
  const execution=await page.evaluate(async()=>{
    await mount('Execution');
    const event=(type,channel,agent='',iteration=1,extra={})=>({payload:{type,action:'run_command',channel_id:channel,call_id:'same',agent_id:agent,iteration,...extra}});
    emit('events',event('tool_start','A'));emit('events',event('tool_start','B'));
    emit('events',event('tool_stream','A','',1,{tool_name:'run_command',chunk:'alpha'}));
    emit('events',event('tool_stream','B','',1,{tool_name:'run_command',chunk:'beta'}));
    const separate=state.activeTasks.value.map(t=>[t.channel,state.streamOutput.value[t.id]]);
    emit('events',event('tool_end','A')); const terminal=state.activeTasks.value.map(t=>[t.channel,t.status]);
    emit('events',event('tool_start','B','agent',1));emit('events',event('tool_start','B','agent',2));
    emit('events',event('tool_end','B','agent',1));
    const iterations=state.activeTasks.value.filter(t=>t.agentId==='agent').map(t=>[t.iteration,t.status]);
    await hide();const hidden=state.recentHistory.value.map(t=>t.status);await show();
    emit('events',event('tool_start','C'));connection('reconnecting');const disconnected=state.recentHistory.value.find(t=>t.channel==='C')?.status;
    return {separate,terminal,iterations,hidden,disconnected,remaining:state.activeTasks.value.filter(t=>t.status==='running').length};
  });
  assert.deepEqual(execution.separate,[['B','beta'],['A','alpha']]);
  assert.deepEqual(execution.terminal,[['B','running'],['A','success']]);
  assert.deepEqual(execution.iterations,[[2,'running'],[1,'success']]);
  assert.ok(execution.hidden.every(status=>status==='unknown')); assert.equal(execution.disconnected,'unknown'); assert.equal(execution.remaining,0);
  assert.deepEqual(await page.evaluate(()=>{
    emit('events',{payload:{type:'tool_start',action:'check',channel_id:'D',call_id:'duplicate',metadata:{originating_turn_id:'turn-A',iteration:1}}});
    emit('events',{payload:{type:'tool_start',action:'check',channel_id:'D',call_id:'duplicate',metadata:{originating_turn_id:'turn-B',iteration:1}}});
    emit('events',{payload:{type:'tool_end',action:'check',channel_id:'D',call_id:'duplicate',audit_metadata:{originating_turn_id:'turn-A',iteration:1}}});
    return state.activeTasks.value.filter(t=>t.channel==='D').map(t=>[t.turnId,t.status]);
  }),[['turn-B','running'],['turn-A','success']]);
  assert.deepEqual(await page.evaluate(()=>{
    for (const loop of ['loop-A','loop-B']) emit('events',{payload:{type:'loop_tool_start',action:'check',channel_id:'L',call_id:'same',loop_id:loop,iteration:1}});
    emit('events',{payload:{type:'loop_tool',action:'check',channel_id:'L',call_id:'same',loop_id:'loop-A',iteration:1}});
    return state.activeTasks.value.filter(t=>t.channel==='L').map(t=>[t.loopId,t.status]);
  }),[['loop-B','running'],['loop-A','success']]);
  assert.deepEqual(errors,[]);
  console.log('v410-webui: #517-531 realistic Vue/Chromium regressions passed');
} finally { await browser?.close(); await server.close(); }
