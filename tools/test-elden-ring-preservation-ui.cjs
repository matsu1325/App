const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http');
const {chromium}=require('playwright');let server,browser;
(async()=>{
 server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync('apps/elden-ring-build-helper.html'));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}/`;
 browser=await chromium.launch({headless:true,...(process.env.ER_CHROME_PATH?{executablePath:process.env.ER_CHROME_PATH}:{channel:'chromium'})});
 for(const width of [320,390,1440]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const current=()=>page.evaluate(()=>ERApp.getState());
  await page.goto(url);await page.waitForFunction(()=>window.ERApp);const initial=await current();
  const open=async()=>{await page.getByRole('button',{name:'詳細',exact:true}).first().click();await page.locator('#optimizer-start').waitFor();};
  await open();assert.equal(await page.locator('#optimizer-advanced').getAttribute('open'),null);
  await page.locator('#optimizer-apply-mode').selectOption('equip');await page.locator('#optimizer-target-slot').selectOption('3');
  const target=await page.locator('#dialog-content [data-equip-weapon]').getAttribute('data-equip-weapon');
  await page.locator('#optimizer-start').click();await page.locator('#optimizer-apply').waitFor();
  assert.deepEqual(await current(),initial);assert.match(await page.locator('#optimizer-result').innerText(),/全装備・記憶魔法/);
  await page.locator('#optimizer-try').click();assert.match(await page.locator('#optimizer-preview').innerText(),/未保存.*左手1/);assert.deepEqual(await current(),initial);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,`${width}px page overflow`);
  await page.locator('#optimizer-apply').click();const applied=await current();assert.equal(applied.weapons[3],target);assert.equal(applied.optimizerSettings.targetSlot,3);assert.ok(applied.optimizerSettings.protectEquippedWeapons);
  await page.locator('#close-dialog').click();await page.locator('#undo-build').click();assert.deepEqual(await current(),initial);await page.locator('#redo-build').click();assert.deepEqual(await current(),applied);
  await page.reload();await page.waitForFunction(()=>window.ERApp);assert.deepEqual(await current(),applied);await open();assert.equal(await page.locator('#optimizer-apply-mode').inputValue(),'equip');
  await page.locator('#optimizer-level').fill('151');await page.locator('#optimizer-save').click();const saved=await current();assert.deepEqual(saved.stats,applied.stats);assert.equal(saved.settings.targetLevel,151);
  await page.locator('#close-dialog').click();await page.locator('#undo-build').click();assert.deepEqual(await current(),applied);await page.locator('#redo-build').click();assert.deepEqual(await current(),saved);
  // Real export/share handlers must retain the optional settings through validation.
  await page.locator('#tab-saves').click();await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedBuildLink=text;}}});});
  await page.locator('#share-build').click();await page.waitForFunction(()=>window.copiedBuildLink);
  const link=await page.evaluate(()=>window.copiedBuildLink);const shared=await context.newPage();await shared.goto(link);await shared.waitForFunction(()=>window.ERApp);assert.deepEqual(await shared.evaluate(()=>ERApp.getState().optimizerSettings),saved.optimizerSettings);await shared.close();
  const download=page.waitForEvent('download');await page.locator('#export-build').click();const file=await download;const exported=JSON.parse(fs.readFileSync(await file.path(),'utf8'));assert.deepEqual(exported.optimizerSettings,saved.optimizerSettings);
  // Missing equipped catalyst must fail closed even when a comparison catalyst was selected.
  await page.locator('#tab-weapons').click();
  await page.evaluate(()=>{const e=ERApp.engine,s=ERApp.getState();delete s.optimizerSettings;s.weapons=Array(6).fill('');s.memorized=[e.data.spells.find(x=>x.name_en==='Comet Azur').id];s.catalyst=e.data.variants.find(x=>x.sorcery_tool).id;ERApp.importBuild(s,{resetHistory:true});});
  await open();await page.locator('#optimizer-start').click();await page.waitForFunction(()=>document.querySelector('#optimizer-status').textContent.includes('装備済み触媒'));assert.equal(await page.locator('#optimizer-apply').count(),0);
  await page.locator('#optimizer-protect-spells').uncheck();await page.locator('#optimizer-start').click();await page.locator('#optimizer-apply').waitFor();assert.match(await page.locator('#optimizer-result').innerText(),/条件不足 1件/);
  // A stale proposal cannot overwrite a later imported build.
  await page.evaluate(()=>{const s=ERApp.getState();s.stats.vig++;ERApp.importBuild(s);});const changed=await current();await page.locator('#optimizer-apply').click();assert.deepEqual(await current(),changed);assert.match(await page.locator('#toast').innerText(),/再計算/);
  await page.locator('#close-dialog').click();
  await page.evaluate(()=>{const s=ERApp.getState();s.memorized=[];s.optimizerSettings={version:99};ERApp.importBuild(s);});await open();await page.locator('#optimizer-start').click();assert.match(await page.locator('#optimizer-status').innerText(),/条件の版/);
  await page.locator('#optimizer-save').click();assert.equal((await current()).optimizerSettings.needsReview,undefined);
  await page.locator('#optimizer-start').click();await page.locator('#optimizer-apply').waitFor();
  // Cross-tab storage conflict blocks application.
  await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'elden-ring-build-v1',newValue:JSON.stringify(ERApp.getState())})));const conflict=await current();await page.locator('#optimizer-apply').click();assert.deepEqual(await current(),conflict);assert.match(await page.locator('#toast').innerText(),/別タブ/);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: preservation UI 320/390/1440, equipment+stats atomic Undo/Redo, condition saves, JSON/share/reload, missing catalyst, disabled protection warnings, stale proposal/version and storage conflict');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server?.close();});
