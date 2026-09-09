import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

// Real Vue component; isolated loopback server and mocked API, never live config.
const server = await createServer({configFile:false, root:process.cwd(), appType:'custom',
  resolve:{alias:{vue:'vue/dist/vue.esm-bundler.js'}},
  define:{__VUE_OPTIONS_API__:'true',__VUE_PROD_DEVTOOLS__:'false',__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:'false'},
  server:{host:'127.0.0.1',port:0,watch:null}});
const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: var(--hm-font-sans)"><div id="app"></div><script type="module">
import {createApp,h,ref,nextTick} from 'vue';
import '/ui/css/fonts.css';
import '/ui/css/tailwind.css';
import '/ui/css/style.css';
import '/ui/css/foundation.css';
import Config from '/ui/js/pages/config.js';
const view=ref(null);
createApp({render:()=>h(Config,{ref:view})}).component('odin-icon',{template:'<span></span>'})
.component('router-link',{template:'<a><slot /></a>'}).mount('#app');
await nextTick(); window.view=view.value;</script></body></html>`;
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
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[],writes=[],unexpected=[];
  page.on('pageerror',e=>errors.push(e.message));
  const config={image:{backend:'auto',openai:{image_model:'custom-image',outer_model:'custom-outer'}},logging:{level:'INFO'}};
  const defaults=Object.fromEntries(['image_model','outer_model'].map(leaf=>[leaf,{effective:config.image.openai[leaf],default:`shipped-${leaf}`,status:'pin'}]));
  let revision=1;
  const currentRevision=()=>`fixture-revision-${revision}`;
  let missingMetadata=false;
  const meta=()=>({fields:['image.backend','image.openai.image_model','image.openai.outer_model','logging.level'].map(path=>({path,label:path,type:'string',sensitivity:'public',apply_mode:'live_apply',description:'fixture'})),image_model_defaults:missingMetadata?null:structuredClone(defaults),image_model_revision:currentRevision()});
  let failPost=false,failMeta=false,hold=null,release;
  await page.route('**/api/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    let body,status=200;
    if(path==='/api/config/meta'){body=failMeta?{error:'metadata offline'}:meta();status=failMeta?503:200;}
    else if(path==='/api/config'&&req.method()==='GET')body=config;
    else if(path==='/api/config/image-models'){
      const payload=req.postDataJSON();writes.push(payload);
      if(hold)await hold;
      if(payload.expected_revision!==currentRevision()){status=409;body={error:'stale image model revision'};}
      else if(failPost){status=400;body={error:'operation rejected'};}
      else{
        for(const [leaf,op]of Object.entries(payload.operations)){
          defaults[leaf].status=op;
          if(op==='follow')config.image.openai[leaf]=defaults[leaf].default;
          defaults[leaf].effective=config.image.openai[leaf];
        }
        revision+=1;
        body={config,image_model_defaults:structuredClone(defaults),image_model_revision:currentRevision()};
      }
    }else{unexpected.push(`${req.method()} ${path}`);status=500;body={error:'unexpected request'};}
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__image_test__.html`);
  await page.waitForFunction(()=>window.view&&!view.loading);
  await page.evaluate(()=>{view.searchQuery='image';if(!view.isSectionExpanded('image'))view.toggleSection('image');});
  const panel=page.getByRole('region',{name:'Image model defaults'});
  assert.match(await panel.innerText(),/custom-image\s+Pinned.*Shipped default: shipped-image_model/s);
  assert.equal(await panel.evaluate(el=>el.classList.contains('cfgc-field-group')&&el.classList.contains('nested')),true);
  assert.equal(await panel.locator('.cfgc-field-group-header').getByRole('button',{name:'Refresh status',exact:true}).count(),1);
  assert.equal(await panel.getByRole('button').count(),5,'only one refresh action and two two-segment controls');
  assert.equal(await panel.getByRole('button',{name:/for both/}).count(),0);
  assert.match(await panel.innerText(),/save immediately, without saving drafts/i);
  for(const [leaf,name] of [['image_model','Image model'],['outer_model','Outer model']]){
    const row=panel.locator(`[data-image-model="${leaf}"]`);
    assert.equal(await row.evaluate(el=>el.classList.contains('cfgc-field')),true);
    assert.equal(await row.locator('.cfgc-field-copy .cfgc-field-label').count(),1);
    assert.equal(await row.locator('.cfgc-field-control').count(),1);
    assert.equal(await row.getByRole('group',{name,exact:true}).getByRole('button').count(),2);
    assert.equal(await row.locator('.cfgc-image-model-effective code').count(),1);
    assert.equal(await row.locator('.cfgc-image-model-status').count(),1);
    assert.equal(await row.locator('.cfgc-image-model-shipped').count(),1);
    assert.equal(await row.locator('.cfgc-field-copy > code').innerText(),`image.openai.${leaf}`);
    const alignment=await row.evaluate((el,leaf)=>{
      const neighbor=document.getElementById(window.view.fieldId(`image.openai.${leaf}`));
      return ['.cfgc-field-copy','.cfgc-field-control'].map(selector=>Math.abs(el.querySelector(selector).getBoundingClientRect().left-neighbor.querySelector(selector).getBoundingClientRect().left));
    },leaf);
    assert.ok(alignment.every(delta=>delta<1),'defaults use the same grid and left inset as Openai fields');
  }
  await page.evaluate(()=>{
    view.setFieldValue({path:'logging.level'},'DEBUG');
    view.setFieldValue({path:'image.backend'},'comfyui');
    view.setFieldValue({path:'image.openai.outer_model'},'draft-outer');
  });
  hold=new Promise(resolve=>{release=resolve;});
  await panel.locator('[data-image-model="image_model"]').getByRole('button',{name:'Follow defaults',exact:true}).click();
  await page.waitForFunction(()=>view.saving);
  assert.equal(await panel.locator('[data-image-model="outer_model"]').getByRole('button',{name:'Pin current',exact:true}).isDisabled(),true);
  await page.evaluate(()=>view.saveConfig());
  await page.evaluate(()=>{view.setFieldValue({path:'image.backend'},'blocked-edit');view.undo();view.redo();view.discardAllDrafts();});
  release();hold=null;
  await page.waitForFunction(()=>!view.saving);
  assert.deepEqual(writes,[{operations:{image_model:'follow'},expected_revision:'fixture-revision-1'}]);
  assert.equal(await panel.locator('[data-image-model="image_model"] .cfgc-image-model-shipped').count(),0,'equal shipped default is hidden');
  const expectedDrafts=['image.backend','image.openai.outer_model','logging.level'];
  const draftPaths=()=>page.evaluate(()=>view.reviewGroups.flatMap(g=>g.entries).map(e=>e.path).sort());
  assert.deepEqual(await draftPaths(),expectedDrafts);
  const imageFollow=panel.locator('[data-image-model="image_model"]').getByRole('button',{name:'Follow defaults',exact:true});
  const imagePin=panel.locator('[data-image-model="image_model"]').getByRole('button',{name:'Pin current',exact:true});
  await imagePin.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(()=>!view.saving);
  assert.equal(await imagePin.getAttribute('aria-pressed'),'true','Enter activates pinned segment');
  assert.deepEqual(writes.at(-1),{operations:{image_model:'pin'},expected_revision:'fixture-revision-2'});
  const outerFollow=panel.locator('[data-image-model="outer_model"]').getByRole('button',{name:'Follow defaults',exact:true});
  const outerPin=panel.locator('[data-image-model="outer_model"]').getByRole('button',{name:'Pin current',exact:true});
  const pinRevision=currentRevision();
  await outerPin.click();
  await page.waitForFunction(()=>!view.saving);
  assert.deepEqual(writes.at(-1),{operations:{outer_model:'pin'},expected_revision:pinRevision});
  assert.equal(await page.evaluate(()=>view.sectionEntries('image').find(f=>f.path==='image.openai.outer_model').value),'draft-outer');
  assert.equal(defaults.outer_model.effective,'custom-outer','pin runtime, never draft');
  await page.evaluate(()=>{view.undo();view.redo();});
  assert.deepEqual(await draftPaths(),expectedDrafts);
  failPost=true;
  await outerFollow.focus(); await page.keyboard.press('Space');
  await page.waitForFunction(()=>!view.saving&&view.imageModelError);
  assert.match(await panel.getByRole('alert').innerText(),/operation rejected/);
  const failedState=await Promise.all([outerFollow.getAttribute('aria-pressed'),outerPin.getAttribute('aria-pressed')]);
  assert.deepEqual(failedState,['false','true'],'failed POST retains the existing pin state');
  failPost=false;failMeta=true;
  await imageFollow.click();
  await page.waitForFunction(()=>!view.saving&&view.imageModelError);
  assert.match(await panel.getByRole('alert').innerText(),/were saved.*metadata offline/);
  assert.equal(await imageFollow.getAttribute('aria-pressed'),'true');
  assert.match(await panel.locator('[data-image-model="image_model"]').innerText(),/Following defaults/);
  failMeta=false;
  await panel.getByRole('button',{name:'Refresh status'}).click();
  await page.waitForFunction(()=>!view.saving&&!view.imageModelError);
  // Simulate a concurrent editor. Stale writes must surface an error, then
  // refresh the revision without altering drafts or confirmed selection.
  const staleRevision=currentRevision();revision+=1;
  await outerFollow.click();
  await page.waitForFunction(()=>!view.saving&&view.imageModelError);
  assert.deepEqual(writes.at(-1),{operations:{outer_model:'follow'},expected_revision:staleRevision});
  assert.match(await panel.getByRole('alert').innerText(),/stale image model revision/);
  assert.equal(await outerPin.getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>view.meta.image_model_revision),currentRevision());
  const retryRevision=currentRevision();
  await outerFollow.click();
  await page.waitForFunction(()=>!view.saving&&!view.imageModelError);
  assert.deepEqual(writes.at(-1),{operations:{outer_model:'follow'},expected_revision:retryRevision});
  assert.equal(await outerFollow.getAttribute('aria-pressed'),'true');
  assert.deepEqual(await draftPaths(),expectedDrafts);
  assert.equal(await page.evaluate(()=>view.sectionEntries('image').find(f=>f.path==='image.openai.outer_model').value),'draft-outer');
  assert.equal(await panel.locator('.cfgc-image-model-shipped').count(),0,'both default-equal values are quiet');
  missingMetadata=true;
  await panel.getByRole('button',{name:'Refresh status'}).click();
  await page.waitForFunction(()=>!view.saving);
  assert.match(await panel.innerText(),/Image model metadata is unavailable/);
  assert.equal(await panel.locator('.cfgc-image-model-choice button:disabled').count(),4);
  assert.equal(await panel.locator('.cfgc-image-model-status').allTextContents().then(text=>text.every(value=>value==='Unavailable')),true);
  missingMetadata=false;
  await panel.getByRole('button',{name:'Refresh status'}).click();
  await page.waitForFunction(()=>!view.saving);
  await imageFollow.focus();await page.keyboard.press('Tab');
  assert.equal(await imagePin.evaluate(el=>document.activeElement===el),true,'segments are keyboard reachable');
  assert.equal(await imagePin.evaluate(el=>getComputedStyle(el).outlineStyle),'solid','keyboard focus is visible');
  const capture=async name=>{
    if(!process.env.IMAGE_MODEL_SCREENSHOT_DIR)return;
    fs.mkdirSync(process.env.IMAGE_MODEL_SCREENSHOT_DIR,{recursive:true});
    await panel.screenshot({path:path.join(process.env.IMAGE_MODEL_SCREENSHOT_DIR,`${name}.png`)});
  };
  await page.evaluate(()=>{view.toast=null;view.searchQuery='';view.activeCategory='models';view.discardAllDrafts();document.activeElement?.blur();});
  await capture('image-model-defaults-desktop');
  await page.evaluate(()=>{view.meta.image_model_defaults.image_model.status='pin';view.meta.image_model_defaults.image_model.effective='vendor/very-long-model-name-that-must-wrap-without-overflowing-the-config-control-column-at-any-viewport-width';});
  for(const width of [1280,390,320]){
    await page.setViewportSize({width,height:900}); await page.waitForTimeout(30);
    const layout=await page.evaluate(()=>{const row=document.querySelector('[data-image-model="image_model"]'),copy=row.querySelector('.cfgc-field-copy').getBoundingClientRect(),control=row.querySelector('.cfgc-field-control').getBoundingClientRect();return {copy,control,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth};});
    assert.ok(layout.scrollWidth<=layout.clientWidth,`no horizontal overflow at ${width}px`);
    if(width<600)assert.ok(layout.control.top>=layout.copy.bottom,`control stacks at ${width}px`);
    else assert.ok(layout.control.left>layout.copy.left&&layout.control.top<layout.copy.bottom,'desktop columns align side by side');
    await capture(`image-model-defaults-${width}`);
  }
  const before=writes.length;
  await page.evaluate(async()=>{view.saving=true;await view.setImageModelDefaults(['image_model'],'pin');view.saving=false;});
  assert.equal(writes.length,before);
  assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
  console.log('image-model-defaults-browser: segmented choices, keyboard, aligned responsive layout, conditional defaults, runtime payloads, draft/undo preservation, serialization, stale revisions, errors and unavailable metadata passed');
}finally{await browser?.close();await server.close();}
