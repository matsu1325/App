const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http');
const {chromium}=require('playwright');
let server,browser;
(async()=>{
 server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync('apps/elden-ring-build-helper.html'));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,...(process.env.ER_CHROME_PATH?{executablePath:process.env.ER_CHROME_PATH}:{channel:'chromium'})});
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.ERApp);
  const before=await page.evaluate(()=>ERApp.getState());
  await page.getByRole('button',{name:'詳細',exact:true}).first().click();
  await page.locator('#optimizer-start').click();await page.locator('#optimizer-apply').waitFor();
  assert.match(await page.locator('#optimizer-status').innerText(),/厳密DP/);
  assert.deepEqual(await page.evaluate(()=>ERApp.getState()),before);
  await page.locator('#optimizer-try').click();assert.match(await page.locator('#optimizer-preview').innerText(),/未保存/);
  assert.deepEqual(await page.evaluate(()=>ERApp.getState()),before);
  assert.equal(await page.locator('[data-curve-series] rect').count(),5);
  await page.locator('#optimizer-apply').click();
  const after=await page.evaluate(()=>ERApp.getState());assert.notDeepEqual(after.stats,before.stats);
  assert.equal(await page.evaluate(()=>ERApp.engine.buildLevel(ERApp.getState())),150);
  await page.locator('#close-dialog').click();await page.locator('#undo-build').click();
  assert.deepEqual(await page.evaluate(()=>ERApp.getState()),before);
  await page.locator('#redo-build').click();assert.deepEqual(await page.evaluate(()=>ERApp.getState()),after);
  await page.reload();await page.waitForFunction(()=>window.ERApp);assert.deepEqual(await page.evaluate(()=>ERApp.getState()),after);
  await page.getByRole('button',{name:'詳細',exact:true}).first().click();
  await page.locator('#optimizer-level').fill('1');await page.locator('#optimizer-start').click();
  await page.waitForFunction(()=>document.querySelector('#optimizer-status').textContent.includes('目標レベル'));
  assert.equal(await page.locator('#optimizer-apply').count(),0);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: optimizer 390/1440, immutable preview, graph markers, apply, Undo/Redo, reload and infeasible level');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server?.close();});
