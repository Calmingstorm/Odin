import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

// Real Vue component; isolated loopback server and mocked API, never live config.
const server = await createServer({configFile:false, root:process.cwd(), appType:'custom',
  resolve:{alias:{vue:'vue/dist/vue.esm-bundler.js'}},
  define:{__VUE_OPTIONS_API__:'true',__VUE_PROD_DEVTOOLS__:'false',__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:'false'},
  server:{host:'127.0.0.1',port:0,watch:null}});
const html = `<!doctype html><div id="app"></div><script type="module">
import {createApp,h,ref,nextTick} from 'vue';
import Config from '/ui/js/pages/config.js';
const view=ref(null);
createApp({render:()=>h(Config,{ref:view})}).component('odin-icon',{template:'<span></span>'})
.component('router-link',{template:'<a><slot /></a>'}).mount('#app');
await nextTick(); window.view=view.value;</script>`;
server.middlewares.use(async(req,res,next)=>{
  if(req.url!=='/__image_test__.html')return next();
  res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,html));
});
let browser;
try {
  await server.listen();
  const executablePath=[process.env.CHROME_PATH,'/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean).find(fs.existsSync);
  assert.ok(executablePath,'Chromium required');
  browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();
  const errors=[],writes=[],unexpected=[];
  page.on('pageerror',e=>errors.push(e.message));
  const config={image:{backend:'auto',openai:{image_model:'custom-image',outer_model:'custom-outer'}},logging:{level:'INFO'}};
  const defaults=Object.fromEntries(['image_model','outer_model'].map(leaf=>[leaf,{effective:config.image.openai[leaf],default:`shipped-${leaf}`,status:'pin'}]));
  const meta={fields:['image.backend','image.openai.image_model','image.openai.outer_model','logging.level'].map(path=>({path,label:path,type:'string',sensitivity:'public',apply_mode:'live_apply',description:'fixture'})),image_model_defaults:defaults,image_model_revision:'fixture-revision'};
  let failPost=false,failMeta=false,hold=null,release;
  await page.route('**/api/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    let body,status=200;
    if(path==='/api/config/meta'){body=failMeta?{error:'metadata offline'}:meta;status=failMeta?503:200;}
    else if(path==='/api/config'&&req.method()==='GET')body=config;
    else if(path==='/api/config/image-models'){
      const payload=req.postDataJSON();writes.push(payload);
      if(hold)await hold;
      if(failPost){status=400;body={error:'operation rejected'};}
      else{
        for(const [leaf,op]of Object.entries(payload.operations)){
          defaults[leaf].status=op;
          if(op==='follow')config.image.openai[leaf]=defaults[leaf].default;
          defaults[leaf].effective=config.image.openai[leaf];
        }
        body={config,image_model_defaults:defaults,image_model_revision:'fixture-revision'};
      }
    }else{unexpected.push(`${req.method()} ${path}`);status=500;body={error:'unexpected request'};}
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__image_test__.html`);
  await page.waitForFunction(()=>window.view&&!view.loading);
  await page.evaluate(()=>{view.searchQuery='image';if(!view.isSectionExpanded('image'))view.toggleSection('image');});
  const panel=page.getByRole('region',{name:'Image model defaults'});
  assert.match(await panel.innerText(),/custom-image.*Shipped default: shipped-image_model.*Status: pin/s);
  await page.evaluate(()=>{
    view.setFieldValue({path:'logging.level'},'DEBUG');
    view.setFieldValue({path:'image.backend'},'comfyui');
    view.setFieldValue({path:'image.openai.outer_model'},'draft-outer');
  });
  hold=new Promise(resolve=>{release=resolve;});
  await panel.locator('[data-image-model="image_model"]').getByRole('button',{name:'Follow defaults',exact:true}).click();
  await page.waitForFunction(()=>view.saving);
  assert.equal(await panel.getByRole('button',{name:'Pin current for both',exact:true}).isDisabled(),true);
  await page.evaluate(()=>view.saveConfig());
  await page.evaluate(()=>{view.setFieldValue({path:'image.backend'},'blocked-edit');view.undo();view.redo();view.discardAllDrafts();});
  release();hold=null;
  await page.waitForFunction(()=>!view.saving);
  assert.deepEqual(writes,[{operations:{image_model:'follow'},expected_revision:'fixture-revision'}]);
  const expectedDrafts=['image.backend','image.openai.outer_model','logging.level'];
  const draftPaths=()=>page.evaluate(()=>view.reviewGroups.flatMap(g=>g.entries).map(e=>e.path).sort());
  assert.deepEqual(await draftPaths(),expectedDrafts);
  await panel.getByRole('button',{name:'Pin current for both',exact:true}).click();
  await page.waitForFunction(()=>!view.saving);
  assert.deepEqual(writes.at(-1),{operations:{image_model:'pin',outer_model:'pin'},expected_revision:'fixture-revision'});
  assert.equal(await page.evaluate(()=>view.sectionEntries('image').find(f=>f.path==='image.openai.outer_model').value),'draft-outer');
  assert.equal(defaults.outer_model.effective,'custom-outer','pin runtime, never draft');
  await panel.getByRole('button',{name:'Follow defaults for both',exact:true}).click();
  await page.waitForFunction(()=>!view.saving);
  assert.deepEqual(writes.at(-1),{operations:{image_model:'follow',outer_model:'follow'},expected_revision:'fixture-revision'});
  await page.evaluate(()=>{view.undo();view.redo();});
  assert.deepEqual(await draftPaths(),expectedDrafts);
  failPost=true;
  await panel.locator('[data-image-model="outer_model"]').getByRole('button',{name:'Pin current',exact:true}).click();
  await page.waitForFunction(()=>!view.saving&&view.imageModelError);
  assert.match(await panel.getByRole('alert').innerText(),/operation rejected/);
  failPost=false;failMeta=true;
  await panel.getByRole('button',{name:'Pin current for both',exact:true}).click();
  await page.waitForFunction(()=>!view.saving&&view.imageModelError);
  assert.match(await panel.getByRole('alert').innerText(),/were saved.*metadata offline/);
  assert.match(await panel.locator('[data-image-model="image_model"]').innerText(),/Status: pin/);
  failMeta=false;
  await panel.getByRole('button',{name:'Refresh image model status'}).click();
  await page.waitForFunction(()=>!view.saving&&!view.imageModelError);
  const before=writes.length;
  await page.evaluate(async()=>{view.saving=true;await view.setImageModelDefaults(['image_model'],'pin');view.saving=false;});
  assert.equal(writes.length,before);
  assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
  console.log('image-model-defaults-browser: per-leaf/both, runtime payloads, draft/undo preservation, serialization, errors and metadata refresh passed');
}finally{await browser?.close();await server.close();}
