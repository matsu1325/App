const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),report=path.join(root,'.test-artifacts/elden-ring');
let server,browser;
async function main(){
  fs.mkdirSync(report,{recursive:true});
  server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,'apps/elden-ring-build-helper.html')));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/build.html`;
  browser=await chromium.launch({headless:true,...(process.env.ER_CHROME_PATH?{executablePath:process.env.ER_CHROME_PATH}:{channel:'chromium'})});
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>window.ERApp);
  const initial=await page.evaluate(()=>window.ERApp.getState());
  await page.locator('#build-controls').evaluate(el=>el.open=true);
  const initialLevel=await page.evaluate(()=>window.ERApp.engine.buildLevel(window.ERApp.getState()));
  await page.locator('#target-level').fill(String(initialLevel+3));await page.locator('#target-level').dispatchEvent('change');
  assert.ok((await page.locator('#level-budget').textContent()).includes('残り3ポイント'));
  await page.locator('#undo-build').click();assert.equal(await page.locator('#target-level').inputValue(),'');
  await page.locator('#redo-build').click();assert.equal(await page.locator('#target-level').inputValue(),String(initialLevel+3));
  await page.locator('#target-level').fill(String(initialLevel-1));await page.locator('#target-level').dispatchEvent('change');assert.ok((await page.locator('#build-overview').textContent()).includes('1ポイント超過'));
  await page.locator('#target-level').fill('714');await page.locator('#target-level').dispatchEvent('change');assert.equal(await page.locator('#target-level').inputValue(),String(initialLevel-1));
  await page.locator('#target-level').fill(String(initialLevel+3));await page.locator('#target-level').dispatchEvent('change');
  // Favorites apply to the weapon across affinities and stay independent of compare/history.
  await page.locator('#weapon-search').fill('ロングソード');await page.waitForFunction(()=>document.querySelectorAll('#weapon-results .item').length===1);
  const favoriteId=await page.locator('[data-favorite]').getAttribute('data-favorite');
  await page.locator('[data-favorite]').click();assert.equal(await page.locator('#favorite-count').textContent(),'1');assert.equal(await page.locator('[data-favorite]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>window.ERApp.getState().compare.length),0);
  await page.locator('#weapon-favorites').check();await page.locator('#weapon-search').fill('');await page.waitForFunction(()=>document.querySelectorAll('#weapon-results .item').length===1);
  await page.reload();await page.waitForFunction(()=>window.ERApp);assert.equal(await page.locator('#favorite-count').textContent(),'1');
  assert.equal(await page.evaluate(()=>window.ERApp.getState().settings.targetLevel),initialLevel+3);
  await page.locator('#weapon-favorites').check();assert.equal(await page.locator('#weapon-results .item').count(),1);
  await page.locator('#weapon-advanced').evaluate(el=>el.open=true);await page.locator('#weapon-best').uncheck();
  assert.ok(await page.locator('#weapon-results .item').count()>1);const favoriteIds=await page.locator('#weapon-results [data-favorite]').evaluateAll(els=>els.map(el=>el.dataset.favorite));assert.ok(favoriteIds.every(id=>id===favoriteId));
  await page.locator('#weapon-best').check();
  const variant=await page.locator('[data-equip-weapon]').first().getAttribute('data-equip-weapon'),beforeEquip=await page.evaluate(()=>window.ERApp.getState());
  await page.locator('[data-equip-weapon]').first().click();assert.deepEqual(await page.evaluate(()=>window.ERApp.getState()),beforeEquip);
  const preview=await page.evaluate(id=>window.ERApp.engine.equipmentPreview(window.ERApp.getState(),3,id),variant);
  const previewText=await page.locator('[data-equip-target="3"]').textContent();assert.ok(previewText.includes('総重量'));assert.ok(previewText.includes(preview.after.weight.toLocaleString('ja-JP',{minimumFractionDigits:1,maximumFractionDigits:1})));assert.ok(previewText.includes('計算AR'));assert.ok(previewText.includes('追加可能'));
  await page.screenshot({path:path.join(report,'workshop-preview-mobile.png')});
  await page.locator('[data-equip-target="3"]').click();assert.equal(await page.evaluate(()=>window.ERApp.getState().weapons[3]),variant);
  await page.locator('#undo-build').click();assert.deepEqual(await page.evaluate(()=>window.ERApp.getState().weapons),beforeEquip.weapons);
  assert.equal(await page.locator('#favorite-count').textContent(),'1');await page.locator('#redo-build').click();assert.equal(await page.evaluate(()=>window.ERApp.getState().weapons[3]),variant);
  // A failed favorite write must not pretend success or replace the persisted list.
  await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='elden-ring-favorites-v1')throw new Error('quota');return window.originalSetItem.call(this,k,v);};});
  await page.locator('[data-favorite]').first().click();assert.equal(await page.locator('#favorite-count').textContent(),'1');assert.ok((await page.locator('#favorite-status').textContent()).includes('失敗'));
  await page.evaluate(()=>Storage.prototype.setItem=window.originalSetItem);
  // Select another component of one spell; displayed power and detail follow it, without sums.
  const mage={...initial,stats:Object.fromEntries(Object.keys(initial.stats).map(a=>[a,99]))};
  await page.evaluate(s=>window.ERApp.importBuild(s),mage);await page.locator('#tab-spells').click();await page.locator('#spell-sort').selectOption('name');
  const multi=await page.evaluate(()=>window.ERApp.engine.data.spells.find(s=>s.variant_ids.length>1&&s.requirements.int&&s.name_en==='Comet')||window.ERApp.engine.data.spells.find(s=>s.variant_ids.length>1));
  await page.locator('#spell-search').fill(multi.name_en);await page.waitForFunction(id=>!!document.querySelector(`[data-spell-component="${id}"]`),multi.id);
  assert.equal(await page.locator(`[data-spell-card="${multi.id}"]`).count(),1);
  const select=page.locator(`[data-spell-component="${multi.id}"]`),options=await select.locator('option').evaluateAll(els=>els.map(el=>el.value));assert.ok(options.length>1);
  const selected=options.find(id=>id!==undefined&&id!==options[0])||options[1];await select.selectOption(selected);
  const card=page.locator(`[data-spell-card="${multi.id}"]`);assert.equal(await card.locator('[data-spell-detail]').getAttribute('data-spell-detail'),selected);
  const expected=await page.evaluate(id=>{const e=window.ERApp.engine,s=window.ERApp.getState(),v=e.catalogs.spellVariants.get(id),sp=e.catalogs.spells.get(v.spell_id),stats=e.equipment(s).stats;return Math.max(...e.data.variants.filter(c=>(sp.type==='Sorcery'?c.sorcery_tool:c.incantation_tool)&&e.weapon(c,stats).usable).map(c=>e.spell(v,c.id,stats,s.settings).total??-Infinity));},selected);
  assert.equal(await card.locator('.score strong').textContent(),expected.toLocaleString('ja-JP',{minimumFractionDigits:0,maximumFractionDigits:0}));
  await card.locator('[data-memorize]').click();assert.equal(await page.evaluate(()=>window.ERApp.getState().memorized.length),1);
  await page.locator(`[data-spell-component="${multi.id}"]`).selectOption(options[0]);assert.equal(await page.evaluate(()=>window.ERApp.getState().memorized.length),1);
  await page.screenshot({path:path.join(report,'workshop-spell-mobile.png')});
  // Save A and B without mutating either while comparing; table differences are B-A.
  await page.locator('#tab-saves').click();await page.locator('#build-name').fill('<A> 知力ビルド');await page.locator('#save-build').click();
  const a=await page.evaluate(()=>window.ERApp.getState()),b=structuredClone(a);b.name='B 筋力ビルド';b.stats.vig=40;b.stats.str=80;b.stats.int=20;b.weapons[0]=variant;
  await page.evaluate(s=>window.ERApp.importBuild(s),b);await page.locator('#save-build').click();
  const saves=await page.evaluate(()=>JSON.parse(localStorage.getItem('elden-ring-saves-v1'))),ak=saves.find(s=>s.state.name===a.name).key,bk=saves.find(s=>s.state.name===b.name).key;
  await page.locator('#build-a').selectOption(ak);await page.locator('#build-b').selectOption(bk);
  const hp=await page.evaluate(({a,b})=>({a:window.ERApp.engine.equipment(a).hp,b:window.ERApp.engine.equipment(b).hp}),{a,b});
  const hpCells=await page.locator('#build-ab-results table').first().locator('tbody tr').filter({has:page.locator('th',{hasText:/^HP$/})}).locator('td').allTextContents();
  assert.deepEqual(hpCells,[hp.a.toLocaleString('ja-JP'),hp.b.toLocaleString('ja-JP'),(hp.b>hp.a?'+':'')+(hp.b-hp.a).toLocaleString('ja-JP')]);
  assert.ok((await page.locator('#build-a').textContent()).includes('<A>'));assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('elden-ring-saves-v1'))),saves);
  await page.locator('#build-ab-title').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(report,'workshop-ab-mobile.png')});
  for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`A/B overflow ${width}`);}
  // Twenty retained steps, redo, and branching edits; pending typed values are one step.
  await page.evaluate(s=>window.ERApp.importBuild(s),initial);await page.locator('#build-controls').evaluate(el=>el.open=true);
  for(let i=0;i<25;i++)await page.locator('[data-step="str"][data-delta="1"]').click();
  assert.ok((await page.locator('#history-status').textContent()).includes('20/20'));
  for(let i=0;i<20;i++)await page.locator('#undo-build').click();assert.equal(await page.evaluate(()=>window.ERApp.getState().stats.str),initial.stats.str+5);assert.equal(await page.locator('#undo-build').isDisabled(),true);
  await page.locator('#redo-build').click();assert.equal(await page.evaluate(()=>window.ERApp.getState().stats.str),initial.stats.str+6);
  await page.locator('#stat-str').fill('50');await page.locator('[data-step="str"][data-delta="1"]').click();assert.equal(await page.evaluate(()=>window.ERApp.getState().stats.str),51);
  await page.locator('#undo-build').click();assert.equal(await page.evaluate(()=>window.ERApp.getState().stats.str),50);
  await page.locator('#undo-build').click();assert.equal(await page.evaluate(()=>window.ERApp.getState().stats.str),initial.stats.str+6);
  await page.locator('[data-step="dex"][data-delta="1"]').click();assert.equal(await page.locator('#redo-build').isDisabled(),true);
  // Another tab updates favorites without resetting the build, and a build conflict disables history.
  const sibling=await context.newPage();await sibling.goto(url);await sibling.waitForFunction(()=>window.ERApp);
  await sibling.evaluate(()=>localStorage.setItem('elden-ring-favorites-v1',JSON.stringify({schema:1,ids:[]})));
  await page.locator('#tab-weapons').click();await page.waitForFunction(()=>document.getElementById('favorite-count').textContent==='0');
  await sibling.evaluate(s=>localStorage.setItem('elden-ring-build-v1',JSON.stringify(s)),{...initial,settings:{...initial.settings,targetLevel:150}});
  await page.waitForFunction(()=>document.getElementById('undo-build').disabled);assert.equal(await page.locator('#redo-build').isDisabled(),true);
  await page.locator('#reload-stored').click();assert.equal(await page.evaluate(()=>window.ERApp.getState().settings.targetLevel),150);assert.equal(await page.locator('#undo-build').isDisabled(),true);
  await sibling.close();await page.reload();await page.waitForFunction(()=>window.ERApp);assert.equal(await page.evaluate(()=>window.ERApp.getState().settings.targetLevel),150);
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS workshop UI: target/undo/redo, six-slot previews, favorites/affinities/write failures, grouped spell components, immutable A/B comparisons, 320/390/1440px, history limits and cross-tab conflicts');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)server.close();});
