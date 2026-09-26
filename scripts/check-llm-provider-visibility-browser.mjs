import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

// Real Vue DOM against an isolated API fixture; no live settings or server calls.
const server = await createServer({ configFile:false, root:process.cwd(), appType:'custom',
  resolve:{alias:{vue:'vue/dist/vue.esm-bundler.js'}},
  define:{__VUE_OPTIONS_API__:'true',__VUE_PROD_DEVTOOLS__:'false',__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:'false'},
  server:{host:'127.0.0.1',port:0,watch:null} });
const html = `<!doctype html><html><body><div id="app"></div><script type="module">
import {createApp,h,ref,nextTick} from 'vue';
import Llm from '/ui/js/pages/llm-config.js';
import {ConfirmHost} from '/ui/js/confirm.js';
const view=ref(null);createApp({render:()=>h('div',[h(Llm,{ref:view}),h(ConfirmHost)])}).directive('modal-focus',{}).component('odin-icon',{template:'<span></span>'}).mount('#app');
await nextTick();window.view=view.value;</script></body></html>`;
server.middlewares.use(async(req,res,next)=>{
  if(req.url!=='/__llm_visibility__.html')return next();
  res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,html));
});
const compat={enabled:false,configured:true,base_url:'https://openrouter.ai/api/v1',model:'vendor/alpha',model_profiles:{},openrouter:{}};
const ollama={enabled:false,configured:true,base_url:'http://localhost:11434',model:'quartz'};
const codex={enabled:true,configured:true,model:'gpt-6-sol',reasoning_effort:'high'};
const entries=['compat:vendor/alpha',{model:'ollama:quartz',thinking_mode:'enabled'},'gpt-6-sol'];
const agents={model:'compat:vendor/alpha',auto_model_allowlist:entries,model_selection_hints:{'compat:vendor/alpha':'First for code'}};
let main='compat:vendor/alpha';
let failSave=false,holdCatalogue=null;
const writes=[];
const catalog=()=>({
  codex:['gpt-6-astra','gpt-6-sol','gpt-6-luna','gpt-5.6-sol'].map(name=>({ref:name,name,provider:'codex',available:true,capability:'reasoning'})),
  compat:[{ref:'compat:vendor/alpha',name:'vendor/alpha',provider:'compat',available:compat.enabled,unavailable_reason:compat.enabled?'':'disabled',capability:'reasoning',agent_available:true}],
  ollama:[{ref:'ollama:quartz',name:'quartz',provider:'ollama',available:ollama.enabled,unavailable_reason:ollama.enabled?'':'disabled',capability:'none',agent_available:true}],
});
const requests=[],errors=[],unexpected=[];
let browser;
try{
  await server.listen();
  const executablePath=[process.env.CHROME_PATH,'/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean).find(fs.existsSync);
  assert.ok(executablePath,'Chromium is required');
  browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    requests.push(`${req.method()} ${path}`);
    let body={};
    if(req.method()==='GET'){
      if(path==='/api/llm/status')body={main_model:main,codex:structuredClone(codex),openai_compatible:structuredClone(compat),ollama:structuredClone(ollama),auxiliary:{enabled:true,model:'ollama:quartz'},model_catalogue:catalog()};
      else if(path==='/api/ollama/status')body={configured:true,model:'quartz',health:{healthy:false}};
      else if(path==='/api/ollama/models')body={models:[{name:'quartz'}]};
      else if(path==='/api/openai-compatible/status')body={configured:true,model:'vendor/alpha',health:{healthy:false}};
      else if(path==='/api/openai-compatible/models')body={models:[{name:'vendor/alpha'}]};
      else if(path==='/api/agents/model')body=structuredClone(agents);
      else if(path==='/api/codex/status')body={configured:true,accounts:[]};
      else if(path==='/api/context/windows')body={models:{}};
      else if(path==='/api/openrouter/catalogue'){
        if(holdCatalogue)await holdCatalogue;
        body={models:[{id:'vendor/alpha',name:'Alpha Display Name',vendor:'vendor',supports_tools:true,supports_reasoning:true,supported_efforts:['high'],agent_eligible:true,variant:'standard',profile:{total_window_tokens:131072,max_output_tokens:8192}}]};
      }
      else unexpected.push(`${req.method()} ${path}`);
    }else if(req.method()==='PUT'){
      const payload=req.postDataJSON();writes.push({path,payload});
      if(failSave)body={error:'fixture save failure'};
      else if(path==='/api/openai-compatible/config')Object.assign(compat,payload);
      else if(path==='/api/llm/ollama/config')Object.assign(ollama,payload);
      else if(path==='/api/agents/model')Object.assign(agents,payload);
      else if(path==='/api/llm/main-model')main=payload.model;
      else unexpected.push(`${req.method()} ${path}`);
    }else unexpected.push(`${req.method()} ${path}`);
    await route.fulfill({status:failSave&&req.method()==='PUT'?503:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__llm_visibility__.html`);
  await page.waitForFunction(()=>window.view&&!view.loading);
  assert.deepEqual(errors,[],'component must render without runtime errors');
  const mainSelect=page.locator('label').filter({hasText:'Main model'}).first().locator('select').first();
  const agentSelect=page.locator('label').filter({hasText:'Agent model'}).first().locator('select').first();
  const auxSelect=page.locator('label').filter({hasText:'Auxiliary model'}).first().locator('select').first();
  const selectors=[mainSelect,agentSelect,auxSelect];
  assert.equal(await page.evaluate(()=>view.savedProviderEnabled('compat')),false);
  async function checkDisabled(){
    for(const [selector,value] of [[mainSelect,'compat:vendor/alpha'],[agentSelect,'compat:vendor/alpha'],[auxSelect,'ollama:quartz']]){
      assert.equal(await selector.inputValue(),value,'saved selection survives disabling');
      const option=selector.locator(`option[value="${value}"]`);
      assert.equal(await option.count(),1,'selected-disabled sentinel appears exactly once');
      assert.equal(await option.evaluate(el=>el.disabled),true,'selected sentinel itself is disabled');
      assert.match(await option.innerText(),/configured:.*provider disabled/i);
    }
    for(const [index,selector] of selectors.entries()){
      assert.equal(await selector.locator('optgroup[label="OpenAI-compatible"], optgroup[label="Ollama"]').count(),0);
      assert.equal(await selector.locator('option[value="compat:vendor/alpha"]').count(),index===2?0:1);
      assert.equal(await selector.locator('option[value="ollama:quartz"]').count(),index===2?1:0);
    }
  }
  await checkDisabled();
  assert.equal(requests.filter(x=>x==='GET /api/openrouter/catalogue').length,0,'disabled compat must not fetch OpenRouter');
  await page.getByRole('button',{name:'Configure agent allowlist'}).click();
  const dialog=page.getByRole('dialog');
  assert.match(await dialog.innerText(),/excluded: provider disabled/i);
  assert.match(await dialog.innerText(),/configured.*effective/i);
  assert.deepEqual(await page.evaluate(()=>view.effectiveAllowlist),['compat:vendor/alpha','ollama:quartz','gpt-6-sol']);
  await dialog.getByRole('button',{name:'Close'}).click();
  await page.evaluate(()=>{view.modelSelectorSearch='quartz';});
  await checkDisabled();
  assert.equal(await agentSelect.locator('option[value="auto"]').count(),1);
  assert.equal(await agentSelect.locator('option[value=""]').count(),1);
  assert.equal(await auxSelect.locator('option[value=""]').count(),1);
  assert.equal(await page.getByRole('textbox',{name:'Search model catalogue'}).count(),0);
  await page.evaluate(()=>{view.compatibleForm.enabled=true;view.ollamaForm.enabled=true;});
  await checkDisabled(); // unsaved drafts are not authoritative
  // The plain Codex-only list must not disappear on an arbitrary stale search query.
  assert.equal(await mainSelect.locator('optgroup').count(),0);
  assert.equal(await mainSelect.locator('option[value="gpt-6-sol"]').count(),1);
  assert.equal(await agentSelect.locator('option[value="gpt-6-astra"]').count(),1);
  // Explicit successful save can change provider visibility, preserving unrelated advanced drafts.
  await page.evaluate(()=>{view.compatibleForm.model_profiles={other:{supports_reasoning:true}};});
  await page.evaluate(async()=>await view.saveCompatibleConfig());
  await page.evaluate(()=>{view.modelSelectorSearch='';});
  assert.equal(compat.enabled,true);
  assert.equal(await mainSelect.locator('option[value="compat:vendor/alpha"]').count(),1);
  assert.deepEqual(await page.evaluate(()=>view.disableWarningRoles('compat')),['Main','Agent']);
  await page.evaluate(()=>{view.agentsConfig.model='';});
  assert.deepEqual(await page.evaluate(()=>view.disableWarningRoles('compat')),['Main','Agent'],
    'an inherited Agent also depends on Main');
  await page.evaluate(()=>{view.agentsConfig.model='compat:vendor/alpha';});
  assert.deepEqual(await page.evaluate(()=>view.compatibleForm.model_profiles),{other:{supports_reasoning:true}});
  assert.equal(requests.filter(x=>x==='GET /api/openrouter/catalogue').length,1);
  // A failed disable cannot hide saved-compatible choices; the operator's pending draft survives.
  failSave=true;
  await page.evaluate(()=>{view.compatibleForm.enabled=false;});
  const warning=page.getByRole('dialog',{name:'Disable OpenAI-compatible?'});
  const failedSave=page.evaluate(async()=>await view.saveCompatibleConfig());
  await warning.waitFor();
  assert.match(await warning.innerText(),/Main.*Agent/);
  await warning.getByRole('button',{name:'Disable provider'}).click();
  await failedSave;
  assert.equal(compat.enabled,true);
  assert.equal(await mainSelect.locator('option[value="compat:vendor/alpha"]').count(),1);
  assert.equal(await page.evaluate(()=>view.compatibleForm.enabled),false);
  failSave=false;
  const successfulDisable=page.evaluate(async()=>await view.saveCompatibleConfig());
  await warning.waitFor();
  await warning.getByRole('button',{name:'Disable provider'}).click();
  await successfulDisable;
  await page.waitForFunction(()=>!view.savingCompatible);
  assert.equal(compat.enabled,false);
  await checkDisabled();
  // Empty allowlist catalogue and an unknown saved ref must not silently replace the fixed selection.
  const originalEntries=structuredClone(agents.auto_model_allowlist);
  agents.model='compat:future/model';
  agents.auto_model_allowlist=['compat:future/model'];
  await page.evaluate(async()=>await view.fetchAll());
  assert.equal(await agentSelect.locator('option[value="compat:future/model"]').count(),1);
  assert.equal(await agentSelect.inputValue(),'compat:future/model');
  assert.match(await agentSelect.locator('option[value="compat:future/model"]').innerText(),/configured:.*provider disabled/i);
  assert.equal(await page.evaluate(()=>view.effectiveAutoAllowlistCount),0,'disabled-only Agent Auto has no effective choices');
  agents.model='auto';
  await page.evaluate(async()=>await view.fetchAll());
  assert.match(await page.getByText(/1 configured, 0 effective models/).first().innerText(),/1 configured, 0 effective models/);
  compat.enabled=true;
  await page.evaluate(async()=>await view.fetchLLMStatus());
  const autoWarning=await page.evaluate(()=>view.disableWarningRoles('compat'));
  assert.ok(autoWarning.includes('Agent Auto (zero effective choices)'),
    'disabling the last Agent Auto provider warns before saving');
  assert.ok(!autoWarning.includes('Agent'),'Auto is not a fixed provider reference');
  compat.enabled=false;
  await page.evaluate(async()=>await view.fetchLLMStatus());
  agents.model='compat:vendor/alpha';agents.auto_model_allowlist=originalEntries;
  await page.evaluate(async()=>await view.fetchAll());
  // Enabling both providers by status (health remains unreachable) exposes their disabled options.
  compat.enabled=true;ollama.enabled=true;
  await page.evaluate(async()=>await view.fetchLLMStatus());
  await page.evaluate(()=>{view.modelSelectorSearch='';});
  await page.waitForFunction(()=>view.modelGroups.some(g=>g.id==='compat')&&view.modelGroups.some(g=>g.id==='ollama'));
  for(const selector of selectors){
    assert.equal(await selector.locator('optgroup[label="OpenAI-compatible"]').count(),1);
    assert.equal(await selector.locator('optgroup[label="Ollama"]').count(),1);
  }
  assert.equal(await mainSelect.locator('option[value="compat:vendor/alpha"]').count(),1);
  assert.equal(await auxSelect.locator('option[value="ollama:quartz"]').count(),1);
  assert.deepEqual(agents.auto_model_allowlist,entries);
  // Saved provider is enabled but health is false: preserve current server-marked availability.
  assert.equal(await mainSelect.locator('option[value="compat:vendor/alpha"]').evaluate(el=>el.disabled),false);
  assert.equal(await page.evaluate(()=>view.savedProviderEnabled('compat')),true);
  assert.equal(await page.evaluate(()=>view.savedProviderEnabled('ollama')),true);
  await page.evaluate(async()=>await view.fetchAll());
  await page.waitForFunction(()=>view.openRouterCatalogue?.models?.length);
  await page.evaluate(()=>{
    view.llmStatus.model_catalogue.compat[0].capability='none';
    view.llmStatus.model_catalogue.compat[0].efforts=['low'];
  });
  for(const selector of selectors){
    assert.match(await selector.locator('option[value="compat:vendor/alpha"]').innerText(),/^Alpha Display Name/,
      'enabled provider retains the OpenRouter display name');
  }
  assert.deepEqual(await page.evaluate(()=>{
    const model=view.modelCatalog.find(m=>m.ref==='compat:vendor/alpha');
    return [model.name,model.capability,model.efforts,model.agent_available];
  }),['Alpha Display Name','reasoning',['high'],true],'presentation metadata retains catalogue precedence');
  // Bare unknown Codex names remain Codex selections, not mistaken for provider IDs.
  codex.enabled=false;agents.model='auto';
  await page.evaluate(async()=>await view.fetchAll());
  assert.equal(await agentSelect.inputValue(),'auto');
  assert.equal(await agentSelect.locator('option[value="auto"]').count(),1,'Auto has only its fixed option');
  assert.equal(await page.evaluate(()=>view.configuredDisabledSelection('agent')),false);
  assert.equal(await page.getByText(/Agent model is configured on a disabled provider/).count(),0);
  assert.ok(!(await page.evaluate(()=>view.disableWarningRoles('codex'))).includes('Agent'),
    'disabling Codex must not claim Agent Auto is a fixed Codex selection');
  agents.model='gpt-7-future';
  await page.evaluate(async()=>await view.fetchAll());
  const future=agentSelect.locator('option[value="gpt-7-future"]');
  assert.equal(await future.count(),1);
  assert.match(await future.innerText(),/configured:.*provider disabled/i);
  assert.equal(await future.evaluate(el=>el.disabled),true);
  assert.equal(await agentSelect.locator('optgroup[label="Codex"]').count(),0);
  codex.enabled=true;agents.model='compat:vendor/alpha';
  await page.evaluate(async()=>await view.fetchAll());
  // Health is separate from saved enablement: server-marked unreachable entries remain listed.
  await page.evaluate(()=>{
    for(const provider of ['compat','ollama']){
      view.llmStatus.model_catalogue[provider][0].available=false;
      view.llmStatus.model_catalogue[provider][0].unavailable_reason='unreachable';
    }
  });
  assert.equal(await mainSelect.locator('optgroup[label="OpenAI-compatible"] option').count(),1);
  assert.match(await mainSelect.locator('option[value="compat:vendor/alpha"]').innerText(),/unreachable/);
  assert.equal(await mainSelect.locator('option[value="compat:vendor/alpha"]').evaluate(el=>el.disabled),true);
  await page.waitForFunction(()=>view.openRouterCatalogue?.models?.length);
  await page.evaluate(()=>{view.llmStatus.model_catalogue.compat[0].agent_available=false;});
  for(const selector of selectors){
    assert.match(await selector.locator('option[value="compat:vendor/alpha"]').innerText(),/^Alpha Display Name \(unreachable\)/,
      'display name survives a server-unavailable verdict');
  }
  assert.deepEqual(await page.evaluate(()=>{
    const model=view.modelCatalog.find(m=>m.ref==='compat:vendor/alpha');
    return [model.available,model.unavailable_reason,model.agent_available,model.name,model.capability,model.efforts];
  }),[false,'unreachable',false,'Alpha Display Name','reasoning',['high']],
  'catalogue metadata cannot upgrade server availability or agent admission');
  // Cached OpenRouter metadata cannot give disabled compat an eligible model.
  await page.evaluate(async()=>await view.fetchAll());
  assert.ok(await page.evaluate(()=>view.openRouterCatalogue?.models?.length));
  compat.enabled=false;
  await page.evaluate(async()=>await view.fetchLLMStatus());
  assert.equal(await page.evaluate(()=>view.openRouterCatalogueActive),false);
  assert.equal(await page.evaluate(()=>view.autoAllowlistModels.some(m=>m.provider==='compat')),false);
  assert.equal(await page.evaluate(()=>view.openRouterResults.length),0);
  assert.equal(await page.getByRole('dialog').count(),0);
  assert.equal(await mainSelect.locator('option[value="compat:vendor/alpha"]').count(),1);
  // A delayed response from the old endpoint is discarded after the saved endpoint changes.
  compat.enabled=true;
  await page.evaluate(async()=>await view.fetchLLMStatus());
  let release;
  holdCatalogue=new Promise(resolve=>{release=resolve;});
  const pending=page.evaluate(async()=>await view.fetchAll());
  await page.waitForFunction(()=>view.openRouterCatalogueLoading);
  compat.base_url='https://router.example.net/v1';
  await page.evaluate(async()=>await view.fetchLLMStatus());
  release();holdCatalogue=null;
  await pending;
  assert.equal(await page.evaluate(()=>view.openRouterCatalogue),null,'stale OpenRouter response discarded after endpoint change');
  assert.equal(await page.evaluate(()=>view.openRouterCatalogueActive),false);
  assert.equal(await page.evaluate(()=>view.openRouterResults.length),0);
  // Now race the same request against disabling rather than endpoint replacement.
  compat.enabled=true;compat.base_url='https://openrouter.ai/api/v1';
  await page.evaluate(async()=>await view.fetchLLMStatus());
  let releaseDisabled;
  holdCatalogue=new Promise(resolve=>{releaseDisabled=resolve;});
  const pendingDisable=page.evaluate(async()=>await view.fetchAll());
  await page.waitForFunction(()=>view.openRouterCatalogueLoading);
  compat.enabled=false;
  await page.evaluate(async()=>await view.fetchLLMStatus());
  releaseDisabled();holdCatalogue=null;
  await pendingDisable;
  assert.equal(await page.evaluate(()=>view.openRouterCatalogue),null,'stale response discarded after saved disable');
  assert.equal(await page.evaluate(()=>view.openRouterResults.length),0);
  // An explicit Refresh updates saved provider visibility but cannot discard
  // unsaved Agent model/allowlist/hints or bless them as the server snapshot.
  await page.evaluate(()=>{view.agentsConfig.model='gpt-6-luna';view.agentsConfig.auto_model_allowlist=['gpt-6-luna'];view.agentsConfig.model_selection_hints={'gpt-6-luna':'Draft hint'};});
  agents.model='auto';agents.auto_model_allowlist=['gpt-6-sol'];
  await page.evaluate(async()=>await view.fetchAll());
  assert.deepEqual(await page.evaluate(()=>({model:view.agentsConfig.model,allowlist:view.agentsConfig.auto_model_allowlist,hints:view.agentsConfig.model_selection_hints})),
    {model:'gpt-6-luna',allowlist:['gpt-6-luna'],hints:{'gpt-6-luna':'Draft hint'}});
  // A Main save racing an explicit status refresh must keep the draft until
  // the write settles. A failed write leaves the saved provider visible.
  await page.evaluate(()=>{view.modelSelection.main='gpt-6-luna';});
  failSave=true;
  const failedMain=page.evaluate(async()=>await view.saveMainModel());
  await page.evaluate(async()=>await view.fetchLLMStatus());
  assert.equal(await mainSelect.inputValue(),'gpt-6-luna');
  await failedMain;
  assert.equal(await mainSelect.inputValue(),'gpt-6-luna');
  assert.equal(await page.evaluate(()=>view.savedProviderEnabled('codex')),true);
  failSave=false;
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log('LLM provider visibility DOM check OK');
}finally{await browser?.close();await server.close();}
