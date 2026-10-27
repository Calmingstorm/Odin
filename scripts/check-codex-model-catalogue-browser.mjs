import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

// The real LLM page offers one Codex order (gpt-6.1-terra between the two Sols) from the
// backend catalogue and from the built-in fallback list, and offers effort "none" for
// gpt-6.1-terra while gpt-6.1-sol still hides it. Isolated API fixture; no live calls.
const ORDER = ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-sol', 'gpt-6-luna',
  'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'];
const EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
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
  if(req.url!=='/__codex_models__.html')return next();
  res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,html));
});
let withCatalogue=true;
const codex={enabled:true,configured:true,model:'gpt-6.1-sol',reasoning_effort:'xhigh'};
const status=()=>({main_model:'gpt-6.1-sol',codex:structuredClone(codex),
  openai_compatible:{enabled:false,configured:false,model:'',model_profiles:{},openrouter:{}},
  ollama:{enabled:false,configured:false,model:''},auxiliary:{enabled:false,model:''},
  ...(withCatalogue?{model_catalogue:{codex:ORDER.map(name=>({ref:name,name,provider:'codex',available:true,
    capability:'reasoning',agent_available:true,efforts:[...EFFORTS]})),compat:[],ollama:[]}}:{})});
const errors=[];
let browser;
try{
  await server.listen();
  const executablePath=[process.env.CHROME_PATH,'/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean).find(fs.existsSync);
  assert.ok(executablePath,'Chromium is required');
  browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    let body={};
    if(req.method()==='GET'&&path==='/api/llm/status')body=status();
    else if(req.method()==='GET'&&path==='/api/agents/model')body={model:'auto',auto_model_allowlist:[],model_selection_hints:{}};
    else if(req.method()==='GET'&&path==='/api/codex/status')body={configured:true,accounts:[]};
    else if(req.method()==='GET'&&path==='/api/context/windows')body={models:{}};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const mainSelect=page.locator('label',{hasText:'Main model'}).first().locator('select').first();
  const mainEffort=page.locator('label',{hasText:'Main model'}).first().locator('xpath=following-sibling::label[1]//select');
  async function check(source){
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__codex_models__.html`);
    await page.waitForFunction(()=>window.view&&!view.loading&&view.modelSelection.main);
    assert.deepEqual(errors,[],`${source}: the page renders without runtime errors`);
    const offered=(await mainSelect.locator('option').evaluateAll(options=>options.map(o=>o.value)))
      .filter(value=>value.startsWith('gpt-'));
    assert.deepEqual(offered,ORDER,`${source}: one Codex order, gpt-6.1-terra between the two Sols`);
    await page.evaluate(()=>{view.modelSelection.main='gpt-6.1-terra';});
    assert.deepEqual(await mainEffort.locator('option').evaluateAll(options=>options.map(o=>o.value)),EFFORTS,
      `${source}: gpt-6.1-terra offers every effort, including none`);
    if(source==='backend catalogue'){
      await page.evaluate(()=>{view.modelSelection.main='gpt-6.1-sol';});
      assert.deepEqual(await mainEffort.locator('option').evaluateAll(options=>options.map(o=>o.value)),
        EFFORTS.filter(effort=>effort!=='none'),'gpt-6.1-sol still hides none');
    }
  }
  await check('backend catalogue');
  withCatalogue=false;
  await check('built-in fallback list');
  console.log('codex model catalogue browser check passed: backend and fallback order, terra efforts');
}finally{
  await browser?.close();
  await server.close();
}
