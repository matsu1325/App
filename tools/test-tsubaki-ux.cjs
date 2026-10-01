const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const directory=path.join(__dirname,'../apps');
const html=fs.readFileSync(path.join(directory,fs.readdirSync(directory).find(x=>x.includes('Tsubaki'))),'utf8');
let checks=0;
function test(value,msg){assert.ok(value,msg);checks++;}
function boot(seed={},options={}){
  const errors=[],copied=[];
  const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e));
  const dom=new JSDOM(html,{url:'https://example.com/App/apps/tsubaki.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:console,beforeParse(w){
    w.localStorage.setItem('tsubaki.onboarded','true');for(const [key,val]of Object.entries(seed))w.localStorage.setItem('tsubaki.'+key,typeof val==='string'?val:JSON.stringify(val));
    w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.matchMedia=()=>({matches:false,addEventListener(){}});
    w.navigator.clipboard={writeText:async text=>{if(options.copyFailure)throw new Error('Denied');copied.push(text);}};
    w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
    // jsdom navigation on a download is outside this test; downloading is checked separately in browsers.
    w.HTMLAnchorElement.prototype.click=()=>{};
  }});
  const w=dom.window,d=w.document;
  const api={dom,w,d,errors,copied,eval:s=>w.eval(s),click:id=>d.getElementById(id).click(),input:(id,v)=>{const e=d.getElementById(id);e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}));},select:(id,v)=>{const e=d.getElementById(id);e.value=v;e.dispatchEvent(new w.Event('change',{bubbles:true}));},output:()=>d.getElementById('t3-live').value,stored:k=>JSON.parse(w.localStorage.getItem('tsubaki.'+k)),json:s=>JSON.parse(JSON.stringify(w.eval(s)))};
  test(errors.length===0,'boot without runtime errors');return api;
}
const library=[
  {id:'a',name:'レゼ',aliases:['Reze','れぜ'],work:'チェンソーマン',tag:'character: reze_(chainsaw_man)',appearance:'Purple hair.',note:'Standard outfit',fav:true,ts:1},
  {id:'b',name:'マキマ',work:'チェンソーマン',tag:'character: makima_(chainsaw_man)',appearance:'Red hair.',fav:false,ts:2},
  {id:'c',name:'Unclassified',work:'未分類',tag:'character: unknown_(unknown_series)',fav:false,ts:3},
  {id:'oc',name:'Original',work:'Original',tag:'character: original_(pixai)',appearance:'Blue eyes.',fav:false,ts:4},
];
(async()=>{
  let a=boot({charaLibrary:library,history:[{id:'old',text:'Saved original.',fav:true,mode:'adv',ts:1}],userDict:{Custom:[{ja:'元',en:'original_tag'}]}});
  const original=a.w.localStorage.getItem('tsubaki.charaLibrary');a.click('ux-char');
  test(a.w.localStorage.getItem('tsubaki.charaLibrary')===original,'opening does not mutate existing characters');
  test(a.d.getElementById('ux-content-details').open===false,'details start collapsed');
  test(a.d.querySelector('nav.modes').hidden,'old modes tucked into materials');
  a.click('ux-materials');test(!a.d.querySelector('nav.modes').hidden,'old modes retained and reachable');
  a.input('charaLibSearch','ＲＥＺＥ');await new Promise(r=>setTimeout(r,180));
  test(a.d.querySelectorAll('#charaLibList [data-select-char]').length===1,'fullwidth alias search');
  a.select('ux-work','チェンソーマン');test(a.d.getElementById('ux-library-count').textContent.includes('1人表示'),'work AND query');
  a.input('charaLibSearch','no-match');await new Promise(r=>setTimeout(r,180));test(a.d.getElementById('charaLibList').textContent.includes('条件に一致'),'no matches distinct from unregistered');
  a.click('ux-clear-filters');a.select('ux-library-view','list');test(a.d.querySelectorAll('#charaLibList [data-select-char]').length===4,'clear all filters');
  a.d.querySelector('[data-select-char="a"]').click();test(a.json('Array.from(UX.ui.selected)')[0]==='a','selection checkbox default action works');
  a.d.querySelector('[data-select-char="b"]').click();a.select('ux-work','Original');test(a.d.getElementById('ux-selected-count').textContent.includes('2人'),'selection retained outside filter');
  a.click('ux-add-selected');test(a.json('state.t3.people').length===2,'multiple characters add in one action');
  test(a.json('state.t3.people')[0].id==='a'&&a.json('state.t3.people')[1].id==='b','selection order preserved');
  test(a.stored('charaLibrary').find(c=>c.id==='a').lastUsedAt>0,'actual use updates recent list');
  const pose=a.d.querySelector('[data-person="a"] [data-person-field="pose"]');pose.value='Smiling.';pose.dispatchEvent(new a.w.Event('input',{bubbles:true}));
  const outfit=a.d.querySelector('[data-person="b"] [data-person-field="outfit"]');outfit.value='A black coat.';outfit.dispatchEvent(new a.w.Event('input',{bubbles:true}));
  test(a.output().includes('Smiling.')&&a.output().includes('A black coat.'),'person-specific output retains explicit changes');
  test(a.stored('charaLibrary').find(c=>c.id==='b').appearance==='Red hair.','working edits do not change library');
  a.d.querySelector('[data-person="a"] [data-person-remove]').click();test(!a.output().includes('Purple hair.')&&a.output().includes('Red hair.'),'remove only selected person block');
  a.click('ux-undo');test(a.output().includes('Purple hair.')&&a.output().includes('Smiling.'),'undo restores person fields');
  a.click('ux-redo');test(!a.output().includes('Purple hair.'),'redo removes person');
  a.eval('closeAllSheets()');a.input('pvArea','Exact manual text\n第二行');a.input('t3-request','An adult musician on a stage.');
  test(a.output()==='Exact manual text\n第二行','input preserves manual version');
  test(a.d.getElementById('ux-version-note').textContent.includes('未反映'),'manual stale state visible');
  a.click('ux-use-auto');test(a.output().includes('An adult musician'),'explicit auto switch');a.click('ux-use-manual');test(a.output()==='Exact manual text\n第二行','manual switch restores exact text');
  const backup=a.json('currentBackupObject()');test(backup.ver===5&&backup.draft.versions.manual==='Exact manual text\n第二行','both versions in v5 backup');
  a.click('t3-reset');a.click('confirmOk');test(a.output()==='','explicit reset clears chosen version');a.click('ux-undo');test(a.output()==='Exact manual text\n第二行','reset undo restores complete manual snapshot');
  a.click('t3-copy');await Promise.resolve();test(a.copied.at(-1)==='Exact manual text\n第二行','copies selected manual version');
  const migration=a.stored('migrationBackup');test(migration.raw['tsubaki.charaLibrary']===JSON.stringify(library),'migration backup retains exact old values');
  a.click('t3-save');a.input('ux-prompt-name','Named manual');a.click('ux-prompt-save');test(a.stored('history').some(h=>h.name==='Named manual'&&h.text==='Exact manual text\n第二行'),'named prompt save');
  test(a.stored('history').some(h=>h.id==='old'),'existing saved prompt retained');
  const fresh=a.json('currentBackupObject()');a.eval('applyImportedData(validateImportData('+JSON.stringify(fresh)+'),"replace")');
  test(a.output()==='Exact manual text\n第二行','backup roundtrip manual output');test(a.json('state.t3.people')[0].outfit==='A black coat.','backup roundtrip person fields');
  test(a.stored('charaLibrary').find(c=>c.id==='a').aliases[0]==='Reze','backup roundtrip aliases');
  test(a.stored('history').some(h=>h.name==='Named manual'),'backup roundtrip prompt name');
  const v4={app:'tsubaki-koubou',ver:4,charaLibrary:library,draft:{mode:'t3',t3:{request:'Legacy draft.'},manualEdit:true,manualText:'Legacy manual.'}};
  a.eval('applyImportedData(validateImportData('+JSON.stringify(v4)+'),"replace")');test(a.output()==='Legacy manual.','v4 manual import supported');
  const before=a.w.localStorage.getItem('tsubaki.charaLibrary');a.click('ux-char');a.click('charaAutoSort');test(a.w.localStorage.getItem('tsubaki.charaLibrary')===before,'classification preview no write');
  const plan=a.json('UX.classificationPlan(getCharaLib())');test(plan.find(p=>p.id==='c').checked===false,'unknown qualifier not automatically selected');
  const conflicting=[{id:'1',work:'One',tag:'character: a_(same)',workAuto:false},{id:'2',work:'Two',tag:'character: b_(same)',workAuto:false},{id:'3',work:'未分類',tag:'character: c_(same)'},{id:'4',work:'未分類',workSource:'manual',tag:'character: d_(chainsaw_man)'},{id:'5',work:'未分類',tag:'character: e_(foo), f_(bar)'}];
  const conflictPlan=a.json('UX.classificationPlan('+JSON.stringify(conflicting)+')');test(conflictPlan.find(p=>p.id==='3').reason==='競合','conflicting manual mappings do not last-win');test(!conflictPlan.some(p=>p.id==='4'),'manual unclassified stays protected');test(conflictPlan.find(p=>p.id==='5').reason==='競合','multiple series qualifiers conflict');
  a.eval('closeAllSheets()');a.click('ux-char');a.click('ux-new-character');a.input('cl-name','New character');a.input('cl-tag','new_(chainsaw_man)');a.input('ux-char-aliases','新しい子, あたらしいこ');a.click('clSave');test(a.stored('charaLibrary').some(c=>c.name==='New character'&&c.aliases.length===2),'new editor saves alias list');
  a.click('btnOpenBulkChara');a.input('bulkCharaArea','作品 | 有効 | valid_tag | note\nBroken | | \n作品 | 重複 | new_(chainsaw_man) | note');
  test(a.d.getElementById('bulkCharaPreview').textContent.includes('2行目')&&a.d.getElementById('bulkCharaPreview').textContent.includes('タグが空'),'bulk errors retain line numbers');
  a.click('bulkCharaConfirm');a.click('confirmOk');test(a.stored('charaLibrary').some(c=>c.tag.includes('valid_tag')),'bulk saves valid rows only');
  test(a.stored('charaLibrary').filter(c=>c.tag.includes('new_(chainsaw_man)')).length===1,'bulk duplicate default skip');
  const huge={app:'tsubaki-koubou',ver:5,charaLibrary:Array.from({length:2001},(_,i)=>({id:String(i),tag:'t'+i}))};
  assert.throws(()=>a.eval('validateImportData('+JSON.stringify(huge)+')'),/上限/);checks++;
  assert.throws(()=>a.eval('validateImportData({app:"tsubaki-koubou",ver:6})'),/対応/);checks++;
  const idConflict={app:'tsubaki-koubou',ver:5,charaLibrary:[{...library[0],name:'Different incoming'}]};a.eval('applyImportedData(validateImportData('+JSON.stringify(idConflict)+'),"merge")');test(a.stored('charaLibrary').some(c=>c.name==='Different incoming')&&a.stored('charaLibrary').some(c=>c.name==='レゼ'),'merge preserves both conflicting records');
  test(a.errors.length===0,'all upgraded flows without runtime errors');
  a.w.close();

  a=boot({}, {copyFailure:true});a.input('t3-request','Copy failure test.');a.click('t3-copy');await new Promise(r=>setTimeout(r,10));test(!a.stored('history'),'failed copy creates no success history');test(a.d.getElementById('sheetPreview').classList.contains('on'),'failed copy exposes manual selection');a.w.close();

  a=boot({charaLibrary:library});a.input('t3-request','Initial persistent draft.');await new Promise(r=>setTimeout(r,650));
  a.eval('Storage.prototype.setItem=function(){throw new Error("quota")};');a.input('t3-request','Recoverable draft after quota failure.');await new Promise(r=>setTimeout(r,650));
  test(a.json('store.get(K.draft,null)').t3.request==='Recoverable draft after quota failure.','quota failure keeps latest memory draft');test(a.d.getElementById('ux-save-status').textContent.includes('保存できません'),'quota failure never says saved');test(a.json('currentBackupObject()').draft.t3.request==='Recoverable draft after quota failure.','rescue export uses current draft');test(a.stored('draft').t3.request==='Initial persistent draft.','persistent draft not overwritten on failure');
  const incoming={app:'tsubaki-koubou',ver:5,charaLibrary:[{id:'incoming',tag:'incoming',work:'New'}]};assert.throws(()=>a.eval('applyImportedData(validateImportData('+JSON.stringify(incoming)+'),"replace")'),/退避/);checks++;test(a.stored('charaLibrary').length===library.length,'failed import backup does not delete existing library');a.w.close();

  a=boot({charaLibrary:library});a.eval('store.markConflict()');a.input('t3-request','Conflict draft.');await new Promise(r=>setTimeout(r,650));test(a.d.getElementById('ux-save-status').textContent.includes('別タブ'),'tab conflict visibly blocks writes');test(!a.stored('draft'),'tab conflict does not overwrite draft');test(a.json('captureSnapshot()').t3.request==='Conflict draft.','tab conflict retains rescue content');a.w.close();

  a=boot({charaLibrary:'{broken-json'});a.click('ux-char');test(a.w.localStorage.getItem('tsubaki.charaLibrary')==='{broken-json','corrupt source never silently reset');test(a.d.getElementById('ux-save-status').textContent.includes('読み込めません'),'corrupt data visible status');a.w.close();

  a=boot({charaLibrary:Array.from({length:1000},(_,i)=>({id:'large-'+i,name:'Character '+String(i).padStart(4,'0'),tag:'tag'+i,work:'Series',note:'x'.repeat(200)}))});
  a.click('ux-char');a.select('ux-library-view','list');test(a.d.querySelectorAll('[data-select-char]').length===30,'large list bounds initial rendered cards');test(a.d.getElementById('ux-library-count').textContent.includes('1000人'),'pagination does not lose total');
  a.d.querySelector('[data-ux-more]').click();test(a.d.querySelectorAll('[data-select-char]').length===60,'load more reveals next page');
  a.input('charaLibSearch','Character 0999');await new Promise(r=>setTimeout(r,180));test(a.d.querySelector('[data-select-char="large-999"]'),'search reaches items beyond rendered page');a.w.close();

  const variants=[{...library[0],id:'v1',name:'Variant one',appearance:'A white coat.'},{...library[0],id:'v2',name:'Variant two',appearance:'A green coat.'}];
  a=boot({charaLibrary:variants});a.click('ux-char');a.d.querySelector('[data-select-char="v1"]').click();a.d.querySelector('[data-select-char="v2"]').click();a.click('ux-add-selected');test(a.json('state.t3.people').length===2,'same-tag clothing variants remain separate by ID');
  a.d.querySelector('[data-ux-person="v1"]').click();test(a.output().includes('A green coat.')&&!a.output().includes('A white coat.'),'chip removal preserves other same-tag variant');a.w.close();

  a=boot({charaLibrary:library,history:[{id:'keep',text:'Keep me.',mode:'t3',fav:true}]});
  a.eval('store.set(K.draft,{mode:"t3",t3:{request:"Before transaction"}})');const oldRaw=a.w.localStorage.getItem('tsubaki.charaLibrary');
  a.eval('const originalWrite=Storage.prototype.setItem; Storage.prototype.setItem=function(k,v){if(k==="tsubaki.history"&&v.includes("Incoming"))throw new Error("late failure");return originalWrite.call(this,k,v)};');
  const failing={app:'tsubaki-koubou',ver:5,charaLibrary:[{id:'new',name:'New',tag:'new'}],history:[{id:'incoming',text:'Incoming',mode:'t3'}]};
  assert.throws(()=>a.eval('applyImportedData(validateImportData('+JSON.stringify(failing)+'),"replace")'),/保存に失敗/);checks++;
  test(a.w.localStorage.getItem('tsubaki.charaLibrary')===oldRaw,'late failure rolls back earlier persistent writes');test(a.stored('history')[0].text==='Keep me.','late failure preserves history');test(a.json('store.get(K.charaLib,null)')[0].id==='a','late failure does not expose partially imported cache');
  test(a.stored('importBackup').charaLibrary.length===4,'late failure leaves recovery snapshot');a.w.close();
  console.log('Tsubaki UX v5: '+checks+' checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
