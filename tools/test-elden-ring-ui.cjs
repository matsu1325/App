/* Run: node tools/test-elden-ring-ui.cjs (starts its own temporary HTTP server)
 * ER_UI_URL=http://127.0.0.1:8765/apps/elden-ring-build-helper.html uses an existing server.
 * ER_BROWSER=webkit switches to Safari's browser engine.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const http=require('node:http');
let activeBrowser,activeServer;
const report=path.resolve(__dirname,'../.test-artifacts/elden-ring');fs.mkdirSync(report,{recursive:true});
async function main(){
  let url=process.env.ER_UI_URL;
  if(!url){activeServer=http.createServer((req,res)=>{if(req.url.split(/[?#]/)[0]!=='/apps/elden-ring-build-helper.html'){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.resolve(__dirname,'../apps/elden-ring-build-helper.html')));});await new Promise(resolve=>activeServer.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${activeServer.address().port}/apps/elden-ring-build-helper.html`;}
  const kind=process.env.ER_BROWSER==='webkit'?webkit:chromium,browser=await kind.launch({headless:true,...(process.env.ER_BROWSER==='webkit'?{}:process.env.ER_CHROME_PATH?{executablePath:process.env.ER_CHROME_PATH}:{channel:'chromium'})}),context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
  activeBrowser=browser;
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR:',e.message);});
  const start=Date.now();await page.goto(url);await page.waitForFunction(()=>!!window.ERApp,{timeout:45000});
  assert.equal(await page.locator('#application').isVisible(),true);
  assert.ok(await page.locator('#weapon-results .item').count()>0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile overflow');
  await page.screenshot({path:path.join(report,`${process.env.ER_BROWSER||'chromium'}-mobile.png`),fullPage:false});
  // DPS uses explicitly labelled models and preserves unsupported entries.
  await page.locator('#weapon-advanced').evaluate(el=>el.open=true);
  await page.locator('#weapon-sort').selectOption('dps');
  assert.equal(await page.evaluate(()=>window.ERApp.getState().settings.weaponSort),'dps');
  assert.ok((await page.locator('#dps-note').textContent()).includes('未実測'));
  await page.locator('#weapon-search').fill('ロングソード');await page.waitForTimeout(250);
  assert.equal(await page.locator('#weapon-results .item').count(),1);
  assert.ok((await page.locator('#weapon-results .item').textContent()).includes('3.80秒'));
  const curveVariant=await page.locator('[data-weapon-detail]').first().getAttribute('data-weapon-detail');
  await page.locator('[data-weapon-detail]').first().click();
  assert.equal(await page.locator('#detail-dps tbody tr').count(),5);
  assert.ok((await page.locator('#detail-dps').textContent()).includes('未実測'));
  assert.equal(await page.locator('[data-curve]').count(),5);
  assert.equal(await page.locator('#curve-charts svg').count(),1);
  assert.equal(await page.locator('[data-curve-series]').count(),5);
  assert.equal(await page.locator('[data-curve-visible]').count(),5);
  assert.equal(await page.locator('[aria-label="能力値の凡例"]').innerText(),'筋力\n技量\n知力\n信仰\n神秘');
  await page.locator('[data-curve-visible="str"]').uncheck();
  assert.equal(await page.locator('[data-curve-series="str"]').evaluate(el=>el.style.display),'none');
  await page.locator('[data-curve-visible="str"]').check();
  assert.equal(await page.locator('[data-curve-series="str"]').evaluate(el=>el.style.display),'');
  const curveCheck=await page.evaluate(id=>{
    const app=window.ERApp,s=app.getState(),v=app.engine.catalogs.variants.get(id),stats=app.engine.equipment(s).stats;
    const r=app.engine.weapon(v,stats,{upgrade:app.engine.getUpgrade(v,s.settings),twoHand:s.settings.twoHand});
    const expected=app.engine.hitDamage(r.attack,app.engine.catalogs.enemies.get(s.enemy),document.querySelector('#physical-type').value,1).total;
    return {expected,actual:app.weaponCurvePoints('str')[stats.str-1].damage};
  },curveVariant);
  assert.ok(Math.abs(curveCheck.expected-curveCheck.actual)<1e-8,'curve matches damage engine');
  await page.locator('#curve-range').selectOption('148');
  assert.equal(await page.evaluate(()=>window.ERApp.weaponCurvePoints('str',148).length),148);
  await page.locator('[data-curve-probe="str"]').evaluate(el=>{el.value='120';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.ok((await page.locator('[data-curve-output="str"]').textContent()).includes('仮想値'));
  assert.equal(await page.locator('#detail-dialog').evaluate(el=>el.scrollWidth>el.clientWidth),false,'mobile curve overflow');
  await page.screenshot({path:path.join(report,`${process.env.ER_BROWSER||'chromium'}-curves-mobile.png`)});
  await page.locator('#close-dialog').click();
  await page.locator('#weapon-sort').selectOption('dpsEnemy');
  assert.ok((await page.locator('#weapon-count').textContent()).includes('モデル対応 1/1'));
  await page.reload();await page.waitForFunction(()=>!!window.ERApp);
  assert.equal(await page.locator('#weapon-sort').inputValue(),'dpsEnemy');
  await page.locator('#weapon-advanced').evaluate(el=>el.open=true);
  await page.locator('#weapon-search').fill('ロングボウ');await page.waitForTimeout(250);
  assert.equal(await page.locator('#weapon-results .score strong').textContent(),'—');
  assert.ok((await page.locator('#weapon-results .item').textContent()).includes('未対応'));
  await page.locator('#weapon-search').fill('');await page.waitForTimeout(250);
  await page.locator('#weapon-advanced').evaluate(el=>el.open=false);
  await page.screenshot({path:path.join(report,`${process.env.ER_BROWSER||'chromium'}-dps-mobile.png`),fullPage:true});
  await page.locator('#weapon-advanced').evaluate(el=>el.open=true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'DPS mobile overflow');
  await page.locator('#weapon-sort').selectOption('total');
  await page.locator('#build-controls summary').click();await page.locator('#stat-int').fill('80');await page.locator('#stat-int').dispatchEvent('change');
  await page.waitForFunction(()=>window.ERApp.getState().stats.int===80);
  await page.locator('#weapon-search').fill('月隠');await page.waitForTimeout(250);assert.equal(await page.locator('#weapon-results .item').count(),1);
  await page.locator('[data-compare]').first().click();await page.waitForFunction(()=>window.ERApp.getState().compare.length===1,null,{timeout:5000});assert.equal(await page.locator('#compare-count').textContent(),'1');
  await page.locator('[data-weapon-detail]').first().click();assert.equal(await page.locator('#detail-dialog').isVisible(),true);assert.ok((await page.locator('#detail-damage').textContent()).includes('推定'));
  await page.locator('#close-dialog').click();
  assert.equal(await page.locator('#compare-bar').isVisible(),true);
  assert.ok((await page.locator('#compare-bar-items').textContent()).includes('月隠'));
  const beforeEquip=await page.evaluate(()=>window.ERApp.getState().weapons);
  await page.locator('[data-equip-weapon]').first().click();
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(()=>window.ERApp.getState().weapons),beforeEquip,'cancel does not equip');
  for(let i=0;i<6;i++){
    await page.locator('[data-equip-weapon]').first().click();
    assert.equal(await page.locator('#equip-dialog').isVisible(),true);
    await page.locator(`[data-equip-target="${i}"]`).click();
    assert.equal(await page.locator('#equip-dialog').isVisible(),false);
    assert.ok(await page.evaluate(i=>!!window.ERApp.getState().weapons[i],i));
  }
  assert.ok((await page.locator('#build-overview').textContent()).includes('月隠'));
  await page.locator('#compare-bar-open').click();
  assert.equal(await page.locator('.compare-table tbody tr').count(),1);
  await page.locator('#dialog-content [data-compare]').click();
  assert.equal(await page.locator('#compare-bar').isVisible(),false);
  await page.locator('#close-dialog').click();
  await page.locator('#weapon-results [data-compare]').click();
  const intBefore=await page.evaluate(()=>window.ERApp.getState().stats.int);
  assert.equal(await page.locator('[data-step="int"][data-delta="1"]').isVisible(),true);
  assert.ok(await page.locator('[data-step="int"][data-delta="1"]').evaluate(el=>el.getBoundingClientRect().width>=44));
  await page.locator('[data-step="int"][data-delta="1"]').click();
  assert.equal(await page.evaluate(()=>window.ERApp.getState().stats.int),intBefore+1);
  await page.locator('[data-step="int"][data-delta="-1"]').click();
  await page.locator('#stat-int').fill('9');await page.locator('#stat-int').dispatchEvent('change');
  await page.waitForFunction(()=>window.ERApp.getState().stats.int===9);
  await page.waitForFunction(()=>document.getElementById('build-overview').textContent.includes('知力 あと'));
  assert.ok((await page.locator('#build-overview').textContent()).includes('知力 あと'));
  await page.locator('#stat-int').fill('80');await page.locator('#stat-int').dispatchEvent('change');
  await page.waitForFunction(()=>window.ERApp.getState().stats.int===80);
  await page.locator('#build-overview [data-tab="equipment"]').click();
  assert.equal(await page.locator('#tab-equipment').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#build-overview [data-tab="equipment"]').getAttribute('aria-selected'),null);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'compare bar mobile overflow');
  await page.screenshot({path:path.join(report,`${process.env.ER_BROWSER||'chromium'}-build-overview-mobile.png`),fullPage:false});
  await page.locator('#tab-spells').click();await page.locator('#spell-search').fill('輝石のつぶて');await page.waitForTimeout(300);assert.ok(await page.locator('#spell-results .item').count()>0);
  await page.locator('[data-memorize]').first().click();assert.equal(await page.evaluate(()=>window.ERApp.getState().memorized.length),1);
  await page.locator('#tab-equipment').click();
  const sore=await page.evaluate(()=>window.ERApp.engine.data.talismans.find(t=>t.name_en==="Radagon's Soreseal").id);
  await page.locator('[data-talisman-slot="0"]').selectOption(sore);assert.equal(await page.evaluate(()=>window.ERApp.engine.equipment(window.ERApp.getState()).stats.str),35);
  const clash=await page.evaluate(sore=>{const ts=window.ERApp.engine.data.talismans,s=ts.find(t=>t.id===sore);return ts.find(t=>t.id!==sore&&t.group===s.group).id;},sore);
  await page.locator('[data-talisman-slot="1"]').selectOption(clash);assert.equal(await page.evaluate(()=>window.ERApp.getState().talismans[1]),'');
  await page.locator('#tab-enemies').click();await page.locator('#enemy-search').fill('マレニア');await page.waitForTimeout(250);assert.ok(await page.locator('#enemy-select option').count()>0);const candidate=await page.locator('#enemy-select option').last().getAttribute('value');await page.locator('#enemy-select').selectOption(candidate);assert.ok((await page.locator('#enemy-details').textContent()).includes('マレニア'));
  await page.locator('#enemy-journey').selectOption('NG+7');assert.equal(await page.evaluate(()=>window.ERApp.engine.catalogs.enemies.get(window.ERApp.getState().enemy).journey),'NG+7');
  await page.locator('#rank-for-enemy').click();assert.equal(await page.locator('#weapon-sort').inputValue(),'enemy');
  await page.locator('#weapon-sort').selectOption('dpsEnemy');
  await page.locator('#tab-saves').click();await page.locator('#build-name').fill('<script>日本語ビルド</script>');await page.locator('#save-build').click();assert.equal(await page.locator('#saved-builds .save-card').count(),1);assert.ok((await page.locator('#saved-builds').textContent()).includes('<script>'));
  const state=await page.evaluate(()=>window.ERApp.getState());
  const shared=Buffer.from(JSON.stringify(state)).toString('base64url');
  await page.locator('#share-input').fill('#build='+shared);await page.locator('#import-link').click();assert.deepEqual(await page.evaluate(()=>window.ERApp.getState().stats),state.stats);
  await page.locator('#share-input').fill('#build=broken');await page.locator('#import-link').click();assert.deepEqual(await page.evaluate(()=>window.ERApp.getState().stats),state.stats);
  const download=page.waitForEvent('download');await page.locator('#export-build').click();const file=await download;await file.saveAs(path.join(report,'build.json'));assert.deepEqual(JSON.parse(fs.readFileSync(path.join(report,'build.json'),'utf8')).stats,state.stats);
  await page.locator('#import-build').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"schema":1,"stats":{"int":1000}}')});await page.waitForTimeout(100);assert.deepEqual(await page.evaluate(()=>window.ERApp.getState().stats),state.stats);
  await page.reload();await page.waitForFunction(()=>!!window.ERApp);assert.equal(await page.evaluate(()=>window.ERApp.getState().stats.int),80);assert.equal(await page.locator('#weapon-sort').inputValue(),'dpsEnemy');
  assert.equal(await page.locator('#compare-bar').isVisible(),true);
  assert.deepEqual(await page.evaluate(()=>window.ERApp.getState().weapons),state.weapons);
  assert.ok((await page.locator('#build-overview').textContent()).includes('月隠'));
  await page.locator('#tab-saves').click();assert.equal(await page.locator('#saved-builds .save-card').count(),1);
  const sharePage=await context.newPage();await sharePage.goto(url+'#build='+shared);await sharePage.waitForFunction(()=>!!window.ERApp);assert.equal(await sharePage.evaluate(()=>window.ERApp.getState().stats.int),80);assert.equal(await sharePage.locator('#weapon-sort').inputValue(),'dpsEnemy');await sharePage.close();
  await page.setViewportSize({width:1440,height:1000});await page.locator('#tab-weapons').click();await page.locator('#weapon-advanced').evaluate(el=>el.open=true);await page.locator('#build-controls').evaluate(el=>el.open=true);await page.waitForTimeout(200);await page.screenshot({path:path.join(report,`${process.env.ER_BROWSER||'chromium'}-desktop.png`),fullPage:false});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'desktop overflow');
  // No network connection is needed after obtaining the self-contained HTML.
  await context.setOffline(true);const offline=await context.newPage();
  if(process.env.ER_OFFLINE_HTTP==='1'){
    // Managed browsers may block file://. Supply only the standalone HTML while offline.
    const requests=[];offline.on('request',r=>requests.push(r.url()));
    await offline.route('http://offline.test/build.html',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync(path.resolve(__dirname,'../apps/elden-ring-build-helper.html'),'utf8')}));
    await offline.goto('http://offline.test/build.html');await offline.waitForFunction(()=>!!window.ERApp);
    assert.deepEqual(requests,['http://offline.test/build.html'],'standalone app makes no external requests');
  }else{await offline.goto('file://'+path.resolve(__dirname,'../apps/elden-ring-build-helper.html'));await offline.waitForFunction(()=>!!window.ERApp);}
  assert.ok(await offline.locator('#weapon-results .item').count()>0);await offline.close();
  assert.deepEqual(errors,[]);
  console.log(`PASS ${process.env.ER_BROWSER||'chromium'}: mobile, desktop, filters, equipment, enemy, JSON, share, persistence, offline (${Date.now()-start}ms)`);
  await browser.close();
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(activeBrowser)await activeBrowser.close();if(activeServer)activeServer.close();});
