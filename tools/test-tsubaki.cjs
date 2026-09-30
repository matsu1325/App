// npm install --no-save jsdom; node tools/test-tsubaki.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const filename = fs.readdirSync(path.join(__dirname, '../apps')).find(x => x.includes('Tsubaki'));
const html = fs.readFileSync(path.join(__dirname, '../apps', filename), 'utf8');
const errors = [], clipboard = [];
const oldLibrary = [{id:'old-character',work:'Original',name:'Saved character',tag:'character: saved_character',appearance:'Short black hair and brown eyes.',note:'Keep this note',fav:true}];
const oldHistory = [{id:'old-prompt',text:'A saved original prompt.',mode:'adv',fav:true,ts:1}];
const oldDictionary = {Custom:[{ja:'手作りタグ',en:'custom_saved_tag'}]};
const oldProject = {id:'old-project',name:'Old project',created:1,state:{mode:'basic',basic:{subject:'An adult musician',action:'plays a violin',scene:'on a stage'}}};
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', e => errors.push(e));
const dom = new JSDOM(html, {
  url:'https://matsu1325.github.io/App/apps/test-tsubaki', runScripts:'dangerously', pretendToBeVisual:true, virtualConsole,
  beforeParse(w) {
    w.localStorage.setItem('tsubaki.onboarded','true');
    w.localStorage.setItem('tsubaki.charaLibrary',JSON.stringify(oldLibrary));
    w.localStorage.setItem('tsubaki.history',JSON.stringify(oldHistory));
    w.localStorage.setItem('tsubaki.userDict',JSON.stringify(oldDictionary));
    w.localStorage.setItem('tsubaki.projects',JSON.stringify([oldProject]));
    w.scrollTo=()=>{}; w.HTMLElement.prototype.scrollIntoView=()=>{};
    w.matchMedia=()=>({matches:false,addEventListener(){}});
    w.prompt=()=> '変更作品';
    w.navigator.clipboard={writeText:async text => clipboard.push(text)};
    w.URL.createObjectURL=()=> 'blob:test'; w.URL.revokeObjectURL=()=>{};
  }
});
const w=dom.window, d=w.document;
let checks=0;
function check(value,label){assert.ok(value,label);checks++;}
function input(id,value){d.getElementById(id).value=value;d.getElementById(id).dispatchEvent(new w.Event('input',{bubbles:true}));}
function click(id){d.getElementById(id).click();}
function output(){return d.getElementById('t3-live').value;}
function task(value){d.querySelector(`[data-task="${value}"]`).click();}
function select(id,value){d.getElementById(id).value=value;d.getElementById(id).dispatchEvent(new w.Event('change',{bubbles:true}));}
function closeSheets(){d.querySelectorAll('.sheet.open [data-close]').forEach(x=>x.click());}
function stored(key){return JSON.parse(w.localStorage.getItem('tsubaki.'+key));}
function evaluate(script){return w.eval(script);}
function plain(x){return JSON.parse(JSON.stringify(x));}

(async()=>{
  check(errors.length===0,'app boots without runtime errors');
  assert.deepEqual(stored('charaLibrary'),oldLibrary);checks++;
  assert.deepEqual(stored('history'),oldHistory);checks++;
  assert.deepEqual(stored('userDict'),oldDictionary);checks++;
  assert.deepEqual(stored('projects'),[oldProject]);checks++;
  check(d.getElementById('t3-ref-card').hidden,'references hidden for text generation');
  check(output()==='','empty fields add no defaults');
  input('t3-request','A musician plays a violin on a stage.');
  check(output()==='A musician plays a violin on a stage.','explicit request is unchanged');
  input('t3-appearance','Short black hair.'); input('t3-outfit','A green coat.');
  input('t3-pose','A cheerful smile.');input('t3-scene','A quiet theatre.');
  select('t3-style','watercolor');input('t3-styleDetail','Sparse ink contours.');input('t3-light','Warm light from the left.');
  input('t3-camera','Waist-up, three-quarter view.');input('t3-layout','Vertical composition.');
  check(output().startsWith('Render as a watercolor illustration'),'style precedes new image description');
  for(const content of ['Short black hair.','A green coat.','A cheerful smile.','A quiet theatre.','Sparse ink contours.','Warm light from the left.','Waist-up, three-quarter view.','Vertical composition.'])check(output().includes(content),'retains '+content);
  input('t3-text','夜の「演奏会」 "LIVE"');input('t3-textPlace','a title at the top center');
  check(output().includes(JSON.stringify('夜の「演奏会」 "LIVE"')),'lettering retains exact spelling and quotes');
  check(!d.getElementById('t3-warnings').textContent.includes('日本語の草案'),'Japanese lettering alone needs no translation');
  task('reference');input('t3-ref1','character identity only');input('t3-ref2','pose only');input('t3-keep','the character face');
  check(output().includes('@image1 as the reference for character identity only'),'image1 role');
  check(output().includes('@image2 only as the reference for pose only'),'image2 role');
  check(output().includes('Preserve the character face'),'explicit retention');
  check(!output().includes('Keep all elements outside'),'reference generation does not lock original scene');
  task('edit');check(output().startsWith('Edit @image1'),'local editing starts with source image');
  check(output().includes('Keep all elements outside'),'local editing preserves other regions');
  task('referenceEdit');input('t3-ref2','');check(d.getElementById('t3-warnings').textContent.includes('役割を指定'),'missing reference editing role warning');
  input('t3-ref2','outfit design only');check(!d.getElementById('t3-warnings').textContent.includes('役割を指定'),'reference editing warning resolves');
  task('generate');check(!output().includes('@image1')&&!output().includes('@image2'),'hidden reference fields excluded from new generation');
  select('t3-style','flat');check(output().includes('Warm light from the left.'),'explicit lighting is never silently deleted');
  d.getElementById('t3-characterLora').click();d.getElementById('t3-styleLora').click();
  check(!output().includes('Short black hair.')&&!output().includes('Sparse ink contours.'),'LoRA suppression affects selected supplemental fields');
  check(output().includes('A green coat.')&&output().includes('A cheerful smile.'),'LoRA suppression retains outfit and action');
  check(d.getElementById('t3-appearance').value==='Short black hair.','suppressed content stays editable');
  d.getElementById('t3-characterLora').click();d.getElementById('t3-styleLora').click();
  check(output().includes('Short black hair.'),'LoRA switch is reversible');
  const legacyCharacters=[
    ...oldLibrary,
    {id:'makima',work:'チェンソーマン',name:'Makima',tag:'character: makima_(chainsaw_man)',fav:false,ts:2},
    {id:'reze',work:'未分類',name:'Reze',tag:'character: reze_(chainsaw_man)',fav:false,ts:4},
    {id:'denji',work:'',name:'Denji',tag:'character: denji_(chainsaw_man)',fav:false,ts:3},
    {id:'2b',work:'未分類',name:'2B',tag:'character: 2b_(nier_automata)',fav:false,ts:5},
    {id:'variant',work:'未分類',name:'Mio variant',tag:'character: mio(jiraikei)_(pixai)',fav:false,ts:6}
  ];
  w.localStorage.setItem('tsubaki.charaLibrary',JSON.stringify(legacyCharacters));
  click('t3-add-character');check(d.getElementById('charaLibList').textContent.includes('Saved character'),'old character in library');
  const classifiedLibrary=stored('charaLibrary');
  check(classifiedLibrary.find(x=>x.id==='reze').work==='チェンソーマン','existing work label propagates to same tag suffix');
  check(classifiedLibrary.find(x=>x.id==='denji').work==='チェンソーマン','blank existing work auto classified');
  check(classifiedLibrary.find(x=>x.id==='2b').work==='NieR:Automata','known tag suffix gets readable work label');
  check(classifiedLibrary.find(x=>x.id==='variant').work==='未分類','non-work PixAI and costume qualifiers ignored');
  check(classifiedLibrary.find(x=>x.id==='reze').workAuto===true,'auto classification is marked');
  check(d.getElementById('charaLibList').textContent.includes('タグ判定'),'auto classification visible in library');
  select('charaLibSort','name');
  const chainsawGroup=[...d.querySelectorAll('#charaLibList .dict-cat')].find(x=>x.textContent.includes('チェンソーマン'));
  const sortedNames=[...chainsawGroup.querySelectorAll('.h-mode')].map(x=>x.textContent.trim());
  assert.deepEqual(sortedNames,['Denji','Makima','Reze']);checks++;
  const twoBCard=[...d.querySelectorAll('#charaLibList .hist-item')].find(x=>x.textContent.includes('character: 2b_'));
  twoBCard.querySelector('[data-act="editwork"]').click();
  check(stored('charaLibrary').find(x=>x.id==='2b').work==='変更作品','manual work correction is saved');
  check(stored('charaLibrary').find(x=>x.id==='2b').workAuto===false,'manual correction overrides auto classification');
  click('charaAutoSort');
  check(stored('charaLibrary').find(x=>x.id==='2b').work==='変更作品','manual correction survives reclassification');
  const savedCard=[...d.querySelectorAll('#charaLibList .hist-item')].find(x=>x.textContent.includes('Saved character'));
  savedCard.querySelector('[data-act="useboth"]').click();
  check(output().includes('character: saved_character'),'character inserted into dedicated workspace');
  check(output().includes('Short black hair and brown eyes.'),'appearance inserted into dedicated workspace');
  d.querySelector('#t3-charaChips .x').click();check(!output().includes('character: saved_character'),'character removable without deleting library entry');
  closeSheets();
  input('t3-negative','blurry, unwanted text');check(!output().includes('unwanted text'),'negative remains separate');
  click('t3-copy');await Promise.resolve();check(clipboard.at(-1)===output(),'positive copy');
  click('t3-negative-copy');await Promise.resolve();check(clipboard.at(-1)==='blurry, unwanted text','negative copy');
  click('t3-ai');await Promise.resolve();check(clipboard.at(-1).includes('【Positive草案】')&&clipboard.at(-1).includes('【Negative草案】'),'English handoff carries separate drafts');
  click('t3-save');check(stored('history').some(h=>h.text===output()&&h.fav),'save prompt with snapshot');
  check(stored('history').some(h=>h.id==='old-prompt'),'old saved prompt survives new saves');
  click('t3-preview');input('pvArea','Manually edited final prompt.');
  const snap=plain(evaluate('captureSnapshot()'));check(snap.manualEdit&&snap.manualText==='Manually edited final prompt.','manual output in snapshot');
  evaluate('applySnapshot('+JSON.stringify(snap)+')');check(output()==='Manually edited final prompt.','manual output restores');
  closeSheets();
  const backup=plain(evaluate('currentBackupObject()'));check(backup.ver===4&&backup.draft.manualText==='Manually edited final prompt.','v4 backup includes draft');
  check(backup.charaSort==='name','character sort preference included in backup');
  const normalized=plain(evaluate('validateImportData('+JSON.stringify(backup)+')'));check(normalized.draft.manualText===backup.draft.manualText,'import accepts v4 draft');
  check(normalized.charaLibrary.find(x=>x.id==='reze').workAuto===true,'import preserves automatic work metadata');
  evaluate('applySnapshot('+JSON.stringify(oldProject.state)+')');check(d.getElementById('b-subject').value==='An adult musician','legacy project restores');
  click('t3-transfer');d.getElementById('confirmOk').click();
  check(output().includes('An adult musician')&&output().includes('plays a violin'),'legacy materials transferred to dedicated workspace');
  check(d.getElementById('b-subject').value==='An adult musician','legacy form left intact');
  input('t3-appearance','Appearance-only draft.');input('t3-request','');
  w.dispatchEvent(new w.Event('pagehide'));check(stored('draft').t3.appearance==='Appearance-only draft.','pagehide preserves last input');
  check(errors.length===0,'all flows complete without runtime errors');
  console.log(`Tsubaki.3: ${checks} checks passed; existing character, dictionary, prompt and project preserved.`);
  w.close();
})().catch(e=>{console.error(e);w.close();process.exitCode=1;});
