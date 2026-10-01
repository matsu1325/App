/* v5 usability layer. Embedded before initialization; no network or API dependency. */
const UX = (() => {
  const clone=x=>JSON.parse(JSON.stringify(x));
  const uid=prefix=>prefix+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2));
  const norm=s=>String(s||"").normalize("NFKC").toLowerCase().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
  const compare=(a,b)=>String(a.name||a.tag).localeCompare(String(b.name||b.tag),'ja')||String(a.id).localeCompare(String(b.id));
  const prefKey="tsubaki.uxPrefs", classificationKey="tsubaki.classificationBackup";
  const prefs=store.get(prefKey,{view:'work',sort:store.get(K.charaSort,'work')==='recent'?'recent':'work',favFirst:false});
  const ui={work:'',filter:'all',selected:new Set(),expanded:new Set(),collapsed:new Set(),limit:30,groupLimits:new Map(),scroll:0,editor:null,plan:[],editorDirty:false,bulkWork:false};
  let versions={manual:null,selected:'auto',baseAuto:''}, lastRendered='';
  let undo=[], redo=[], restoring=false, lastInput='', lastInputAt=0;
  let sheetStack=[], sheetOrigins=new Map(), saveTime=0;
  let savedFilter='prompts', savedFav=false;
  const originals={render,captureSnapshot,applySnapshot,buildSegments,validateImportData,currentBackupObject,renderProjects,renderCharaChips};
  // Back up the exact old values before the first v5 write, not merely the current form.
  const oldSet=store.set.bind(store);
  let migrationReady=store.get('tsubaki.schemaVersion',0)===5;
  store.set=function(key,value){
    if(!migrationReady && key!=='tsubaki.migrationBackup' && key!=='tsubaki.schemaVersion'){
      const raw={};
      try {for(const name of Object.values(K)){const text=localStorage.getItem(name);if(text!==null)raw[name]=text;}
        if(!oldSet('tsubaki.migrationBackup',{ver:4,raw,created:Date.now()})){store.stage(key,value);return false;}
        const readback=JSON.parse(localStorage.getItem('tsubaki.migrationBackup'));
        if(JSON.stringify(readback.raw)!==JSON.stringify(raw))throw new Error('移行退避の照合に失敗');
        if(!oldSet('tsubaki.schemaVersion',5)){store.stage(key,value);return false;}migrationReady=true;
      }catch(e){store.stage(key,value);store.failures.set(key,'移行前データを退避できません。書き出してから再試行してください。');return false;}
    }
    return oldSet(key,value);
  };
  function addStyle() {
    const el=document.createElement('style');
    el.textContent=`
      :root { --ux-foot:calc(76px + env(safe-area-inset-bottom)); --bg:var(--sumi); }
      body {font-size:16px;} .sheet:not(.on) {visibility:hidden;} .sheet.on {visibility:visible;}
      button,input,select,textarea { font-size:16px; } button,.btn,.icon-btn,.star,summary { min-height:44px; }
      :focus-visible { outline:3px solid var(--kin);outline-offset:3px; }
      .ux-nav,.ux-toolbar,.ux-pills {display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
      .ux-nav {padding:10px 16px;position:sticky;top:0;background:var(--bg);z-index:15;}
      .ux-nav .on {border-color:var(--kin);color:var(--kin);}
      .ux-compact {margin:8px 0;font-size:14px;color:var(--sub);}
      .ux-status {padding:8px 16px;font-size:14px;} .ux-status.error {color:var(--kin);background:rgba(201,168,106,.15);}
      .ux-person {border:1px solid var(--line);border-radius:12px;padding:12px;margin:10px 0;}
      .ux-person summary {display:flex;align-items:center;gap:8px;overflow-wrap:anywhere;}
      .ux-person textarea,.ux-person input {width:100%;} .ux-person .row {flex-wrap:wrap;}
      .ux-card {border:1px solid var(--line);border-radius:12px;padding:12px;margin:8px 0;overflow-wrap:anywhere;}
      .ux-card-head {display:flex;gap:8px;align-items:center;} .ux-card-head input {width:22px;height:22px;flex-shrink:0;}
      .ux-tag {white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;color:var(--sub);}
      .ux-pills button[aria-pressed=true] {border-color:var(--kin);color:var(--kin);}
      .ux-footer {position:sticky;bottom:0;background:var(--bg);padding:12px 0;border-top:1px solid var(--line);z-index:2;}
      .ux-inline {display:flex;align-items:center;gap:8px;} .ux-inline input[type=checkbox] {width:20px;height:20px;}
      .ux-search {width:100%;margin:8px 0;} .ux-grid {display:grid;grid-template-columns:1fr 1fr;gap:10px;}
      .ux-grid > * {min-width:0;} .ux-plan label {display:block;padding:12px 0;border-bottom:1px solid var(--line);}
      .ux-plan input {width:20px;height:20px;} .ux-plan small {display:block;overflow-wrap:anywhere;}
      .ux-diff {display:grid;grid-template-columns:1fr 1fr;gap:10px;} .ux-diff textarea {min-height:220px;width:100%;}
      [inert].sheet.on {visibility:hidden;} .ux-managed {max-height:calc(var(--vvh,100vh) - 24px);}
      .ux-managed .sheet-body {overflow:auto;} .ux-primary-hidden {display:none!important;}
      .hist-item .h-body {overflow-wrap:anywhere;}
      #pane-t3 .card {min-width:0;} #pane-t3 details > summary {cursor:pointer;}
      #ux-backup-note {overflow-wrap:anywhere;} .ux-empty {padding:22px 8px;text-align:center;}
      @media(min-width:960px){
        main {max-width:1280px;}
        #pane-t3 {display:none;} #pane-t3.on {display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start;}
        #pane-t3 > .card:not(.t3-output),#pane-t3 > .t3-source {grid-column:1;}
        #pane-t3 > .t3-output {grid-column:2;grid-row:1 / span 7;position:sticky;top:76px;max-height:calc(100vh - 100px);overflow:auto;}
      }
      @media(max-width:959px){
        #t3-live {display:none;} #pane-t3 .t3-output.ux-show-output #t3-live {display:block;}
        .ux-diff,.ux-grid {grid-template-columns:1fr;} .t3-hero {padding-top:16px;padding-bottom:12px;}
        .t3-hero h2 {font-size:26px;} .t3-hero p {display:none;} main {padding-bottom:var(--ux-foot);}
        #previewBar {bottom:var(--kb-offset,0px);padding-bottom:env(safe-area-inset-bottom);}
        .ux-nav {position:static;} .t3-output .t3-actions {grid-template-columns:1fr;}
      }
      @media(max-width:390px){header{flex-wrap:wrap;} .h-icons{margin-left:auto;} .h-title{min-width:0;} .ux-toolbar > * {width:100%;} .ux-nav button {flex:1;min-width:0;padding:8px;}.ux-card-head {flex-wrap:wrap;}}
      @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;}}
    `;
    document.head.append(el);
  }
  function sheet(id,title,body) {
    const el=document.createElement('div');el.id=id;el.className='sheet ux-managed';el.setAttribute('role','dialog');el.setAttribute('aria-label',title);el.setAttribute('aria-modal','true');
    el.innerHTML=`<div class="sheet-head"><h3>${esc(title)}</h3><button class="icon-btn" data-ux-close aria-label="閉じる">✕</button></div><div class="sheet-body">${body}</div>`;
    document.body.append(el);
    el.querySelector('[data-ux-close]').onclick=()=>closeSheet(id);
    return el;
  }
  function onCapture(id,fn,event='click') {
    $('#'+id).addEventListener(event,e=>{e.preventDefault();e.stopImmediatePropagation();fn(e);},true);
  }
  function safeSave(key,value) {
    const done=store.set(key,value); updateStatus(); return done;
  }
  function updateStatus() {
    const el=$('#ux-save-status');if(!el)return;
    const problems=[...store.failures.values()];
    el.classList.toggle('error',problems.length>0);
    el.textContent=problems.length?problems[0]:saveTime?'下書き保存済み '+new Date(saveTime).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}):'このブラウザに自動保存します';
    $('#ux-rescue').hidden=!problems.length;
  }
  function checkpoint(target='') {
    if(restoring)return;
    if(target && target===lastInput && Date.now()-lastInputAt<900){lastInputAt=Date.now();return;}
    undo.push(captureSnapshot());if(undo.length>20)undo.shift();redo=[];
    lastInput=target;lastInputAt=Date.now();updateUndo();
  }
  function updateUndo(){if($('#ux-undo')){$('#ux-undo').disabled=!undo.length;$('#ux-redo').disabled=!redo.length;}}
  function undoStep(back=true){const from=back?undo:redo,to=back?redo:undo;if(!from.length)return;to.push(captureSnapshot());restoring=true;applySnapshot(from.pop());restoring=false;lastInput='';updateUndo();}
  function autoText(){return joinSegments(buildSegments());}
  function chooseVersion(which){if(which==='manual'&&versions.manual===null)return;checkpoint();versions.selected=which;state.manualEdit=which==='manual';render();}
  function freshVersions(){versions={manual:null,selected:'auto',baseAuto:''};lastRendered='';state.manualEdit=false;}
  function renderPeople() {
    const people=state.t3.people||[];
    const root=$('#ux-people');if(!root)return;
    // Do not replace a focused field while typing.
    if(root.contains(document.activeElement)&&document.activeElement.matches('textarea,input'))return;
    const expanded=new Set([...root.querySelectorAll('details[open]')].map(el=>el.dataset.person));
    root.innerHTML=people.map(p=>`<details class="ux-person" data-person="${esc(p.id)}" ${expanded.has(p.id)?'open':''}><summary>${esc(p.name||p.tag||'人物')} <span class="status-pill">人物別</span></summary>
      ${[['name','呼称'],['position','位置'],['appearance','外見'],['outfit','衣装'],['pose','動作・表情']].map(([k,label])=>`<label class="lbl" for="ux-person-${esc(p.id)}-${k}">${label}</label><textarea rows="2" id="ux-person-${esc(p.id)}-${k}" data-person-field="${k}">${esc(p[k]||'')}</textarea>`).join('')}
      <label class="lbl">共通の外見補足をこの人物へ移動</label><button class="btn small" data-person-move>移動する</button><button class="btn small" data-person-remove>この人物を外す</button></details>`).join('');
  }
  renderCharaChips=function(listRef,id){if(id!=='t3-charaChips'){originals.renderCharaChips(listRef,id);return;}const people=state.t3.people||[];$('#'+id).innerHTML=people.filter(p=>p.tag).map(p=>`<span class="chip sel">${esc(p.name||p.tag)}<button class="x" data-ux-person="${esc(p.id)}" aria-label="${esc(p.name||p.tag)}を外す">✕</button></span>`).join('')+listRef.map((tag,i)=>people.some(p=>p.tag===tag)?'':`<span class="chip sel">${esc(tag)}<button class="x" data-i="${i}" aria-label="キャラタグを外す">✕</button></span>`).join('');};
  render=function(){
    if(state.manualEdit && $('#pvArea').value!==lastRendered){versions.manual=$('#pvArea').value;versions.selected='manual';versions.baseAuto=autoText();}
    const automatic=autoText();
    state.manualEdit=versions.selected==='manual'&&versions.manual!==null;
    if(state.manualEdit)$('#pvArea').value=versions.manual;
    originals.render();lastRendered=$('#pvArea').value;
    $('#ux-version-note').textContent=versions.manual!==null && automatic!==versions.baseAuto?'入力内容が変更されています。手動版には未反映です。':versions.manual!==null?'手動版を保持しています。':'自動組み立て版を使用中';
    $('#ux-use-manual').disabled=versions.manual===null;
    $('#ux-use-manual').setAttribute('aria-pressed',String(state.manualEdit));$('#ux-use-auto').setAttribute('aria-pressed',String(!state.manualEdit));
    $('#t3-copy').textContent=(state.manualEdit?'手動版':'自動版')+' Positiveをコピー';
    ['t3-copy','btnCopy','btnCopy2'].forEach(id=>$('#'+id).disabled=!lastRendered.trim());
    const details=$('#ux-content-details');if(details){const count=['appearance','outfit','pose','scene'].filter(k=>state.t3[k]?.trim()).length;details.querySelector('summary').textContent='詳しく指定'+(count?'（'+count+'項目入力済み）':'');}
    $('#ux-style-details').querySelector('summary').textContent='画風・光・構図'+(['style','styleDetail','light','camera','layout','text'].some(k=>state.t3[k]?.trim())?'（入力あり）':'');
    $('#ux-hidden-ref').hidden=!(state.t3.task==='generate'&&[state.t3.ref1,state.t3.ref2,state.t3.keep].some(x=>x.trim()));
    renderPeople();updateStatus();
  };
  captureSnapshot=function(){const s=originals.captureSnapshot();s.versions=clone(versions);s.activeProject=state.activeProjectId||null;return s;};
  applySnapshot=function(s){
    if(!s)return;
    s=clone(s);
    if(s.basic)s.basic={subject:'',action:'',scene:'',...s.basic};
    if(s.adv)s.adv={charas:[],lookMain:'',lookDetail:'',scene:'',pose:'',style:null,quality:[],...s.adv,aes:Object.fromEntries(AES_CATS.map(c=>[c.key,s.adv.aes?.[c.key]||[]]))};
    if(s.tag)s.tag={tags:[],charas:[],...s.tag};
    if(s.tpl)s.tpl={id:null,fields:{},manga:{common:'',theme:'',panels:Array(9).fill('')},...s.tpl};
    versions=s.versions&&typeof s.versions==='object'?{manual:typeof s.versions.manual==='string'?s.versions.manual:null,selected:s.versions.selected==='manual'?'manual':'auto',baseAuto:String(s.versions.baseAuto||'')}:{manual:s.manualEdit?String(s.manualText||''):null,selected:s.manualEdit?'manual':'auto',baseAuto:''};
    lastRendered=s.manualEdit?String(s.manualText||''):'';
    state.activeProjectId=s.activeProject||null;
    originals.applySnapshot(s);renderPeople();
  };
  scheduleDraftSave=function(){clearTimeout(draftSaveTimer);if($('#ux-save-status')&&!store.failures.size)$('#ux-save-status').textContent='保存中…';draftSaveTimer=setTimeout(()=>{if(safeSave(K.draft,captureSnapshot()))saveTime=Date.now();updateStatus();},600);};
  copyPrompt=async function(){const raw=$('#pvArea').value.trim();if(!raw)return;const text=getCopyText();const done=await writeClipboard(text);if(done){saveHistory(text,false,captureSnapshot(),raw);toast((state.manualEdit?'手動版':'自動版')+'をコピーしました');}else{openSheet('sheetPreview');$('#pvArea').focus();$('#pvArea').select();toast('コピーできません。選択した本文を手動でコピーしてください');}updateStatus();};
  saveHistory=function(text,fav,snapshot,sourceText=text){const list=store.get(K.hist,[]);const index=list.findIndex(h=>h.text===text&&h.kind!=='prompt');const item={...(index>=0?list[index]:{}),id:index>=0?list[index].id:uid('h'),text,sourceText,mode:state.mode,ts:Date.now(),fav:!!fav||(index>=0&&!!list[index].fav),state:snapshot||null,negative:state.negative,kind:'copy'};if(index>=0)list.splice(index,1);list.unshift(item);const kept=list.filter(h=>h.fav||h.kind==='prompt');const copies=list.filter(h=>!h.fav&&h.kind!=='prompt').slice(0,100);safeSave(K.hist,[...kept,...copies].sort((a,b)=>(b.ts||0)-(a.ts||0)));};
  function installLayout(){
    $('.t3-source').childNodes[0].textContent='Tsubaki.3 専用 / v5.0 · ';
    const versionNote=[...$('#sheetSettings').querySelectorAll('p')].find(el=>el.textContent.includes('椿ノ工房 v4.0'));if(versionNote)versionNote.childNodes[0].textContent='椿ノ工房 v5.0 ・ Tsubaki.3 専用';
    $('.t3-resources').hidden=true;
    const nav=document.createElement('nav');nav.className='ux-nav';nav.setAttribute('aria-label','主な操作');nav.innerHTML='<button class="btn on" id="ux-make">つくる</button><button class="btn" id="ux-char">キャラ</button><button class="btn" id="ux-saved">保存</button><button class="btn" id="ux-materials" aria-expanded="false">素材・型紙</button>';
    $('nav.modes').before(nav);$('nav.modes').hidden=true;
    $('#ux-make').onclick=()=>{closeAllSheets();switchMode('t3');};
    $('#ux-char').onclick=()=>{if(state.mode!=='t3')switchMode('t3');openCharaLib(state.t3.charas,'t3-charaChips');};
    $('#ux-saved').onclick=()=>openSaved();
    $('#ux-materials').onclick=()=>{const el=$('nav.modes');el.hidden=!el.hidden;$('#ux-materials').setAttribute('aria-expanded',String(!el.hidden));};
    const status=document.createElement('div');status.className='ux-status';status.innerHTML='<span id="ux-save-status" role="status"></span> <button class="btn small" id="ux-rescue" hidden>バックアップで救出</button>';
    nav.after(status);$('#ux-rescue').onclick=()=>{openSheet('sheetSettings');exportBackup();};
    const content=$('#t3-appearance').closest('details');content.id='ux-content-details';content.open=false;
    $('#t3-appearance').previousElementSibling.textContent='共通の外見補足（人物別の指定は各キャラへ）';
    const people=document.createElement('div');people.id='ux-people';$('#t3-charaChips').after(people);
    const styleCard=$('#t3-style').closest('.card');const styleDetails=document.createElement('details');styleDetails.id='ux-style-details';styleDetails.className='t3-details';styleDetails.innerHTML='<summary>画風・光・構図</summary>';
    const heading=styleCard.querySelector('h3');heading.remove();while(styleCard.firstChild)styleDetails.append(styleCard.firstChild);styleCard.append(styleDetails);
    const refnote=document.createElement('p');refnote.id='ux-hidden-ref';refnote.className='hint';refnote.textContent='参照の指定は保持中です。新規生成の出力には使用しません。';$('#t3-guide').after(refnote);
    const tools=document.createElement('div');tools.className='ux-toolbar';tools.innerHTML='<button class="btn small" id="ux-undo">取り消し</button><button class="btn small" id="ux-redo">やり直し</button><button class="btn small" id="ux-view-output">完成文を表示</button>';
    $('.t3-output').prepend(tools);$('#ux-undo').onclick=()=>undoStep();$('#ux-redo').onclick=()=>undoStep(false);$('#ux-view-output').onclick=()=>$('.t3-output').classList.toggle('ux-show-output');
    const v=document.createElement('div');v.innerHTML='<p id="ux-version-note" class="hint" role="status"></p><div class="ux-pills"><button class="btn small" id="ux-use-auto" aria-pressed="true">自動版を使う</button><button class="btn small" id="ux-use-manual" aria-pressed="false">手動版を使う</button><button class="btn small" id="ux-version-diff">両版を確認</button></div>';
    $('#t3-live').before(v);$('#ux-use-auto').onclick=()=>chooseVersion('auto');$('#ux-use-manual').onclick=()=>chooseVersion('manual');$('#ux-version-diff').onclick=showVersions;
    sheet('uxVersions','完成文の版を確認','<p class="hint">元の手動文は、置き換えを確定するまで保持されます。</p><div class="ux-diff"><div><label class="lbl" for="ux-auto-text">現在の自動版</label><textarea id="ux-auto-text" readonly></textarea></div><div><label class="lbl" for="ux-manual-text">保持している手動版</label><textarea id="ux-manual-text" readonly></textarea></div></div><button class="btn" id="ux-replace-manual">自動版で手動版を置き換える</button>');
    $('#ux-replace-manual').onclick=()=>askConfirm('保持している手動文を現在の自動版で置き換えます。取り消しで復元できます。',()=>{checkpoint();versions.manual=autoText();versions.baseAuto=autoText();versions.selected='manual';state.manualEdit=false;render();closeSheet('uxVersions');},'置き換える');
    onCapture('btnRebuild',showVersions);
    onCapture('btnCopy',()=>copyPrompt());onCapture('btnCopy2',()=>copyPrompt());
    onCapture('t3-load',()=>askConfirm('現在のフォームと採用版を作例へ置き換えます。取り消しで全文を復元できます。',()=>{checkpoint();freshVersions();state.t3={...freshT3(),...T3_EXAMPLES[$('#t3-example').value]};syncT3UI();render();},'作例を適用'));
    onCapture('t3-reset',()=>askConfirm('現在の入力と完成文をリセットします。保存済みデータは残り、取り消しで戻せます。',()=>{checkpoint();freshVersions();state.t3=freshT3();syncT3UI();render();},'リセット'));
    sheet('uxTransfer','素材を専用作業台へ移す','<label class="lbl" for="ux-transfer-text">移す内容</label><textarea id="ux-transfer-text" rows="5" readonly></textarea><p class="hint" id="ux-transfer-current"></p><button class="btn" id="ux-transfer-add">現在の内容に追加</button><button class="btn" id="ux-transfer-replace">作業台を置き換える</button>');
    onCapture('t3-transfer',()=>{const text=$('#pvArea').value.trim();if(!text){toast('移す素材が空です');return;}$('#ux-transfer-text').value=text;$('#ux-transfer-current').textContent='現在の作業台内容：'+(state.t3.request||'（空欄）')+'。元の素材は残ります。';openSheet('uxTransfer');});
    function transfer(replace){const text=$('#ux-transfer-text').value;checkpoint();if(replace){freshVersions();state.t3={...freshT3(),request:text};}else{state.t3.request=[state.t3.request,text].filter(Boolean).join('\n');state.manualEdit=false;}syncT3UI();forceSwitchModeUI('t3');render();closeSheet('uxTransfer');}
    $('#ux-transfer-add').onclick=()=>transfer(false);$('#ux-transfer-replace').onclick=()=>askConfirm('専用作業台の入力と採用版を、この素材で置き換えます。取り消しで復元できます。',()=>transfer(true),'置き換える');
    document.addEventListener('input',e=>{if(e.target.closest('#pane-t3,#sheetPreview')&&!e.target.readOnly)checkpoint(e.target.id||'person');},true);
    document.addEventListener('change',e=>{if(e.target.closest('#pane-t3')&&!e.target.matches('[data-person-field]'))checkpoint();},true);
    document.addEventListener('click',e=>{if(e.target.closest('[data-task],[data-ref],[data-keep],#t3-charaChips .x'))checkpoint();},true);
    $('#ux-people').addEventListener('input',e=>{const field=e.target.dataset.personField;if(!field)return;const person=state.t3.people.find(p=>p.id===e.target.closest('[data-person]').dataset.person);if(person){person[field]=e.target.value;state.manualEdit=false;render();}});
    $('#ux-people').addEventListener('click',e=>{const node=e.target.closest('[data-person]');if(!node)return;const p=state.t3.people.find(x=>x.id===node.dataset.person);if(!p)return;
      if(e.target.closest('[data-person-remove]')){checkpoint();state.t3.people=state.t3.people.filter(x=>x!==p);if(!state.t3.people.some(x=>x.tag===p.tag))state.t3.charas=state.t3.charas.filter(t=>t!==p.tag);syncT3UI();state.manualEdit=false;render();}
      if(e.target.closest('[data-person-move]'))askConfirm('共通の外見補足を「'+p.name+'」へ移動します。元の共通欄は空になります。',()=>{checkpoint();p.appearance=[p.appearance,state.t3.appearance].filter(Boolean).join('\n');state.t3.appearance='';syncT3UI();state.manualEdit=false;render();},'移動する');
    });
    $('#t3-charaChips').addEventListener('click',e=>{const b=e.target.closest('.x');if(!b)return;e.preventDefault();e.stopImmediatePropagation();if(b.dataset.uxPerson){const p=state.t3.people.find(x=>x.id===b.dataset.uxPerson);state.t3.people=state.t3.people.filter(x=>x!==p);if(p&&!state.t3.people.some(x=>x.tag===p.tag))state.t3.charas=state.t3.charas.filter(t=>t!==p.tag);}else state.t3.charas.splice(+b.dataset.i,1);state.manualEdit=false;syncT3UI();render();},true);
    updateUndo();
  }
  function showVersions(){$('#ux-auto-text').value=autoText();$('#ux-manual-text').value=versions.manual??'（手動版はまだありません）';openSheet('uxVersions');}
  function installSheets(){
    openSheet=function(id){const el=$('#'+id);if(!el)return;const pos=sheetStack.indexOf(id);if(pos>=0)sheetStack.splice(pos,1);if(!sheetStack.length){lockBodyScroll();history.pushState({tsubakiSheet:true},'');sheetHistoryActive=true;}sheetOrigins.set(id,document.activeElement);sheetStack.push(id);el.classList.add('on');$('#veil').classList.add('on');syncSheets();queueMicrotask(()=>el.querySelector('input:not([type=hidden]),button,textarea,select')?.focus());};
    closeSheet=function(id){const i=sheetStack.indexOf(id);if(i<0){$('#'+id)?.classList.remove('on');return;}const origin=sheetOrigins.get(id);sheetStack.splice(i,1);$('#'+id).classList.remove('on');$('#'+id).inert=false;syncSheets();if(!sheetStack.length){$('#veil').classList.remove('on');unlockBodyScroll();if(sheetHistoryActive){sheetHistoryActive=false;history.back();}}if(origin?.isConnected)origin.focus();};
    closeAllSheets=function(){sheetStack.slice().reverse().forEach(id=>closeSheet(id));};
    function syncSheets(){const top=sheetStack.at(-1);$$('.sheet').forEach(el=>{el.inert=!el.classList.contains('on')||el.id!==top;el.style.zIndex=String(50+sheetStack.indexOf(el.id));el.setAttribute('aria-modal',String(el.id===top));});$('main').inert=!!top;$('.ux-nav').inert=!!top;$('header').inert=!!top;$('#previewBar').inert=!!top;}
    window.addEventListener('popstate',e=>{e.stopImmediatePropagation();sheetHistoryActive=false;if(sheetStack.length){const id=sheetStack.at(-1);closeSheet(id);if(sheetStack.length){history.pushState({tsubakiSheet:true},'');sheetHistoryActive=true;}}},true);
    document.addEventListener('keydown',e=>{if(!sheetStack.length)return;const top=$('#'+sheetStack.at(-1));if(e.key==='Escape'){e.preventDefault();closeSheet(top.id);return;}if(e.key==='Tab'){const els=[...top.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary')].filter(x=>!x.closest('[hidden]')&&x.getClientRects().length);if(!els.length)return;const first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  }
  function installLibrary(){
    const controls=document.createElement('div');controls.innerHTML=`<div class="ux-grid"><div><label class="lbl" for="ux-work-search">作品を探す</label><input id="ux-work-search" placeholder="作品名の一部"><label class="lbl" for="ux-work">作品</label><select id="ux-work"></select></div><div><label class="lbl" for="ux-library-view">表示形式</label><select id="ux-library-view"><option value="work">作品別</option><option value="list">一覧</option></select><label class="ux-inline"><input type="checkbox" id="ux-fav-first">お気に入りを先頭に</label></div></div><div class="ux-pills" id="ux-filters">${[['all','すべて'],['fav','お気に入り'],['used','最近使った'],['unclassified','未分類']].map(([k,l])=>`<button class="btn small" data-filter="${k}" aria-pressed="false">${l}</button>`).join('')}</div><div class="ux-toolbar"><button class="btn small" id="ux-clear-filters">条件をクリア</button><span class="hint" id="ux-library-count" role="status"></span></div>`;
    $('#charaLibSearch').after(controls);
    $('#ux-library-view').value=prefs.view;$('#ux-fav-first').checked=!!prefs.favFirst;
    const footer=document.createElement('div');footer.className='ux-footer';footer.innerHTML='<p id="ux-selected-count" class="hint" role="status"></p><div class="ux-toolbar"><button class="btn primary" id="ux-add-selected">選択したキャラを追加</button><button class="btn" id="ux-see-selected">選択内容を見る</button><button class="btn" id="ux-clear-selected">選択を解除</button><button class="btn" id="ux-bulk-work">作品を一括変更</button></div><label class="lbl" for="ux-add-mode">追加方法（OCは外見を優先）</label><select id="ux-add-mode"><option value="default">登録内容に合わせる</option><option value="tag">タグ</option><option value="appearance">外見</option><option value="both">タグ＋外見</option></select>';
    $('#charaLibList').after(footer);
    const form=$('#cl-tag').closest('.card')||$('#cl-tag').parentElement;
    // Move the existing registration controls into an explicit editor without removing data fields.
    const editSheet=sheet('uxCharEditor','キャラの登録・編集','<p class="hint">保存しないで閉じても入力を保持します。</p>');
    const body=editSheet.querySelector('.sheet-body');
    const start=$('#cl-work').previousElementSibling;let node=start;
    while(node){const next=node.nextSibling;body.append(node);if(node.id==='clSave')break;node=next;}
    // Existing form may be nested; move each label/input and its save button if needed.
    for(const id of ['cl-work','cl-name','cl-tag','cl-note','cl-appearance','clSave']){const el=$('#'+id);if(!body.contains(el)){const label=el.previousElementSibling;if(label?.tagName==='LABEL')body.append(label);body.append(el);}}
    const extra=document.createElement('div');extra.innerHTML='<label class="lbl" for="ux-char-aliases">検索用の別名（カンマ区切り）</label><input id="ux-char-aliases" placeholder="日本語名, よみ"><label class="ux-inline"><input type="checkbox" id="ux-char-auto">作品を自動判定に戻す（次の再判定で確認）</label><p class="hint" id="ux-char-duplicate"></p>';
    $('#clSave').before(extra);$('#clSave').textContent='キャラを保存';
    const newButton=document.createElement('button');newButton.id='ux-new-character';newButton.className='btn';newButton.textContent='＋ 新規登録';footer.after(newButton);
    const oldTitle=[...$('#sheetCharaLib').querySelectorAll('h4,h3')].find(x=>x.textContent.includes('新規登録'));if(oldTitle)oldTitle.hidden=true;
    if(!form.querySelector('input,textarea,button'))form.hidden=true;
    newButton.onclick=()=>openEditor(null);
    $('#ux-library-view').onchange=()=>{prefs.view=$('#ux-library-view').value;prefs.sort=prefs.view==='work'?'work':'name';savePrefs();renderCharaLibList();};
    $('#ux-fav-first').onchange=()=>{prefs.favFirst=$('#ux-fav-first').checked;savePrefs();renderCharaLibList();};
    $('#ux-work').onchange=()=>{ui.work=$('#ux-work').value;renderCharaLibList();};
    $('#ux-work-search').oninput=()=>renderWorks();
    $('#ux-filters').onclick=e=>{const b=e.target.closest('[data-filter]');if(b){ui.filter=b.dataset.filter;if(ui.filter==='used'){prefs.view='list';prefs.sort='used';$('#ux-library-view').value='list';savePrefs();}renderCharaLibList();}};
    $('#ux-clear-filters').onclick=()=>{ui.work='';ui.filter='all';$('#charaLibSearch').value='';$('#ux-work-search').value='';renderCharaLibList();};
    $('#ux-clear-selected').onclick=()=>{ui.selected.clear();renderCharaLibList();};
    $('#ux-see-selected').onclick=()=>{ui.filter='selected';renderCharaLibList();};
    $('#ux-add-selected').onclick=()=>addSelected();$('#ux-bulk-work').onclick=()=>openWorkEditor();
    onCapture('charaLibSort',()=>{prefs.sort=$('#charaLibSort').value;savePrefs();renderCharaLibList();},'change');
    let searchTimer;$('#charaLibSearch').addEventListener('input',e=>{e.stopImmediatePropagation();if(e.isComposing)return;clearTimeout(searchTimer);searchTimer=setTimeout(renderCharaLibList,150);},true);
    $('#charaLibSearch').addEventListener('compositionend',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(renderCharaLibList,150);});
    onCapture('charaAutoSort',showClassification);
    $('#charaLibList').addEventListener('click',e=>{if(!e.target.closest('[data-act],[data-ux-work],[data-ux-more]'))return;e.preventDefault();e.stopImmediatePropagation();handleLibraryClick(e);},true);
    $('#charaLibList').addEventListener('change',e=>{if(e.target.matches('[data-select-char]')){const id=e.target.dataset.selectChar;if(e.target.checked)ui.selected.add(id);else ui.selected.delete(id);renderSelection();}});
    $('#sheetCharaLib .sheet-body').addEventListener('scroll',e=>{ui.scroll=e.target.scrollTop;});
    onCapture('clSave',saveCharacter);
    sheet('uxDuplicateCharacter','同じタグの登録があります','<p id="ux-duplicate-name" class="hint"></p><button class="btn" id="ux-duplicate-edit">既存を編集</button><button class="btn" id="ux-duplicate-variant">衣装差分として別登録</button><button class="btn" id="ux-duplicate-cancel">キャンセル</button>');
    $('#ux-duplicate-edit').onclick=()=>{const tag=formatCharaTag($('#cl-tag').value),existing=getCharaLib().find(c=>c.id!==ui.editor&&norm(c.tag)===norm(tag));if(existing)askConfirm('現在の登録入力を既存キャラの内容で置き換えて編集します。',()=>{ui.editorDirty=false;closeSheet('uxDuplicateCharacter');openEditor(existing);},'既存を編集');};
    $('#ux-duplicate-variant').onclick=()=>{closeSheet('uxDuplicateCharacter');saveCharacter(true);};$('#ux-duplicate-cancel').onclick=()=>closeSheet('uxDuplicateCharacter');
    $('#uxCharEditor').addEventListener('input',()=>{ui.editorDirty=true;const tag=formatCharaTag($('#cl-tag').value);const dup=getCharaLib().find(c=>c.id!==ui.editor&&norm(c.tag)===norm(tag));$('#ux-char-duplicate').textContent=dup?'同じタグの登録があります：'+(dup.name||dup.tag)+'。既存編集か、衣装差分として別登録を選べます。':'';});
    sheet('uxWorkEditor','作品の一括変更','<p id="ux-work-targets" class="hint"></p><label class="lbl" for="ux-work-name">作品名（空欄は未分類）</label><input id="ux-work-name" list="charaWorkList"><button class="btn primary" id="ux-work-save">対象の作品を変更</button>');
    $('#ux-work-save').onclick=()=>{const ids=[...ui.selected];askConfirm(ids.length+'人の作品名を変更します。',()=>{const lib=getCharaLib();if(!safeSave(classificationKey,lib))return;lib.forEach(c=>{if(ids.includes(c.id)){c.work=$('#ux-work-name').value.trim()||'未分類';c.workAuto=false;c.workSource='manual';}});safeSave(K.charaLib,lib);renderCharaLibList();closeSheet('uxWorkEditor');},'変更する');};
    sheet('uxClassification','作品分類の変更を確認','<p class="hint">既知タグと矛盾のない手動対応だけ初期選択します。未知・競合は確認してください。</p><div id="ux-classification-plan" class="ux-plan"></div><button class="btn primary" id="ux-classification-apply">選択した分類を適用</button><button class="btn" id="ux-classification-undo">前回の分類を戻す</button>');
    $('#ux-classification-apply').onclick=applyClassification;
    $('#ux-classification-undo').onclick=()=>askConfirm('前回の分類操作の作品名を戻します。追加・削除・メモは保持します。',()=>{const saved=store.get(classificationKey,null);if(!saved){toast('戻せる分類がありません');return;}const previous=new Map(saved.map(c=>[c.id,c]));const lib=getCharaLib().map(c=>{const old=previous.get(c.id);if(!old)return c;return {...c,...Object.fromEntries(['work','workAuto','workKey','workSource'].map(k=>[k,old[k]]))};});safeSave(K.charaLib,lib);renderCharaLibList();closeSheet('uxClassification');},'戻す');
    openCharaLib=function(listRef,chipsId){charaLibCtx={listRef,chipsId};renderCharaLibList();openSheet('sheetCharaLib');$('#sheetCharaLib .sheet-body').scrollTop=ui.scroll;};
    installBulkRegistration();
  }
  function savePrefs(){safeSave(prefKey,prefs);safeSave(K.charaSort,['work','recent','name'].includes(prefs.sort)?prefs.sort:'name');}
  function renderWorks(){const list=getCharaLib();const counts=new Map();list.forEach(c=>counts.set(c.work,(counts.get(c.work)||0)+1));const workSearch=norm($('#ux-work-search').value);const works=[...counts.keys()].sort((a,b)=>a==='未分類'?1:b==='未分類'?-1:a.localeCompare(b,'ja')).filter(x=>!workSearch||norm(x).includes(workSearch)||x===ui.work);$('#ux-work').innerHTML='<option value="">すべての作品</option>'+works.map(work=>`<option value="${esc(work)}">${esc(work)}（${counts.get(work)}人）</option>`).join('');$('#ux-work').value=ui.work;$('#charaWorkList').innerHTML=[...counts.keys()].map(x=>`<option value="${esc(x)}">`).join('');}
  renderCharaLibList=function(){
    const all=getCharaLib(),words=norm($('#charaLibSearch').value).trim().split(/\s+/).filter(Boolean);
    renderWorks();
    const filtered=all.filter(c=>(!ui.work||c.work===ui.work)&&(ui.filter!=='fav'||c.fav)&&(ui.filter!=='used'||c.lastUsedAt)&&(ui.filter!=='unclassified'||c.work==='未分類')&&(ui.filter!=='selected'||ui.selected.has(c.id))&&words.every(w=>norm([c.work,c.name,c.tag,c.note,...(c.aliases||[])].join(' ')).includes(w)));
    const sorting=prefs.view==='work'?[['work','作品名順'],['recent','最近登録した作品順']]:[['name','キャラ名順'],['new','登録が新しい順'],['used','最近使った順']];
    if(!sorting.some(([v])=>v===prefs.sort))prefs.sort=sorting[0][0];
    $('#charaLibSort').innerHTML=sorting.map(([v,l])=>`<option value="${v}">${l}</option>`).join('');$('#charaLibSort').value=prefs.sort;
    $('#ux-library-count').textContent=filtered.length+'人表示 / 総登録 '+all.length+'人'+(ui.work?' / '+ui.work:'')+(ui.filter==='selected'?' / 選択中':'');
    $('#ux-filters').querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===ui.filter)));
    filtered.sort((a,b)=>(prefs.favFirst?Number(!!b.fav)-Number(!!a.fav):0)||(prefs.view==='list'&&prefs.sort==='new'?(b.ts||0)-(a.ts||0):prefs.view==='list'&&prefs.sort==='used'?(b.lastUsedAt||0)-(a.lastUsedAt||0):0)||compare(a,b));
    const card=c=>`<div class="hist-item ux-card" data-id="${esc(c.id)}"><div class="ux-card-head"><input type="checkbox" data-select-char="${esc(c.id)}" ${ui.selected.has(c.id)?'checked':''} aria-label="${esc(c.name||c.tag)}を選択"><strong class="h-mode">${esc(c.name||c.tag)}</strong>${charaLibCtx.listRef?.includes(c.tag)?'<span class="status-pill">追加済み ✓</span>':''}<button class="star ${c.fav?'on':''}" data-act="fav" aria-label="${esc(c.name||c.tag)}のお気に入り" aria-pressed="${!!c.fav}">★</button></div><div class="hint">${esc(c.work)} ${c.workAuto?'・タグ判定':''}</div><div class="ux-tag">${esc(c.tag)}</div><div class="h-acts"><button class="btn small primary" data-act="quickadd">追加</button><details><summary>詳細・管理</summary><p>${esc(c.note||'メモなし')}</p><p>${esc(c.appearance||'外見メモなし')}</p><button class="btn small" data-act="editwork">編集・作品を変更</button><button class="btn small danger" data-act="del">削除</button></details></div></div>`;
    if(!filtered.length)$('#charaLibList').innerHTML='<div class="ux-empty">'+(!all.length?'キャラがまだ登録されていません。新規登録またはバックアップから読み込めます。':ui.filter==='unclassified'&&!words.length&&!ui.work?'未分類のキャラはありません。':'条件に一致するキャラがありません。「条件をクリア」で全件へ戻せます。')+'</div>';
    else if(prefs.view==='list')$('#charaLibList').innerHTML=filtered.slice(0,ui.limit).map(card).join('')+(filtered.length>ui.limit?'<button class="btn wide" data-ux-more="">さらに30人を表示（残り'+(filtered.length-ui.limit)+'人）</button>':'');
    else {const groups=new Map();filtered.forEach(c=>{if(!groups.has(c.work))groups.set(c.work,[]);groups.get(c.work).push(c);});const times=new Map();all.forEach(c=>times.set(c.work,Math.max(times.get(c.work)||0,c.ts||0)));const works=[...groups.keys()].sort((a,b)=>a==='未分類'?1:b==='未分類'?-1:(prefs.sort==='recent'?(times.get(b)||0)-(times.get(a)||0):0)||a.localeCompare(b,'ja'));$('#charaLibList').innerHTML=works.map((work,i)=>{const expanded=!ui.collapsed.has(work)&&(words.length||ui.work||ui.expanded.has(work)||i===0);const members=groups.get(work),limit=ui.groupLimits.get(work)||30;return `<div class="dict-cat"><button class="dcat-head ${expanded?'open':''}" data-ux-work="${esc(work)}" aria-expanded="${!!expanded}">${esc(work)} <span class="cnt">${members.length}人</span></button><div class="chara-work-body" ${expanded?'':'hidden'}>${expanded?members.slice(0,limit).map(card).join('')+(members.length>limit?`<button class="btn wide" data-ux-more="${esc(work)}">さらに30人を表示（残り${members.length-limit}人）</button>`:''):''}</div></div>`;}).join('');}
    renderSelection();updateStatus();
  };
  function renderSelection(){const available=new Set(getCharaLib().map(c=>c.id));for(const id of ui.selected)if(!available.has(id))ui.selected.delete(id);$('#ux-selected-count').textContent='選択 '+ui.selected.size+'人（検索に隠れているキャラを含む）';$('#ux-add-selected').textContent='選択した'+ui.selected.size+'人を追加';$('#ux-add-selected').disabled=!ui.selected.size;$('#ux-bulk-work').disabled=!ui.selected.size;}
  function handleLibraryClick(e){
    const more=e.target.closest('[data-ux-more]');if(more){const work=more.dataset.uxMore;if(work)ui.groupLimits.set(work,(ui.groupLimits.get(work)||30)+30);else ui.limit+=30;renderCharaLibList();return;}
    const head=e.target.closest('[data-ux-work]');if(head){const expanded=head.getAttribute('aria-expanded')!=='true';if(expanded){ui.expanded.add(head.dataset.uxWork);ui.collapsed.delete(head.dataset.uxWork);}else{ui.expanded.delete(head.dataset.uxWork);ui.collapsed.add(head.dataset.uxWork);}renderCharaLibList();return;}
    const b=e.target.closest('[data-act]');if(!b)return;const id=b.closest('[data-id]').dataset.id,lib=getCharaLib(),c=lib.find(x=>x.id===id);if(!c)return;
    if(b.dataset.act==='fav'){c.fav=!c.fav;safeSave(K.charaLib,lib);renderCharaLibList();}
    if(b.dataset.act==='quickadd')addSelected([id]);
    if(b.dataset.act==='editwork')openEditor(c);
    if(b.dataset.act==='del'){safeSave(K.charaLib,lib.filter(x=>x.id!==id));renderCharaLibList();toastUndo('キャラを削除しました',()=>{const now=getCharaLib();if(!now.some(x=>x.id===id))now.push(c);safeSave(K.charaLib,now);renderCharaLibList();});}
  }
  function addSelected(ids=[...ui.selected]){
    const lib=getCharaLib(),ref=charaLibCtx.listRef;if(!ref)return;checkpoint();let count=0;
    for(const id of ids){const c=lib.find(x=>x.id===id);if(!c)continue;const chosen=$('#ux-add-mode').value;const mode=chosen==='default'?(isOcEntry(c)&&c.appearance?'appearance':c.appearance?'both':'tag'):chosen;
      if(state.mode==='t3'){
        if(state.t3.people.some(p=>p.id===id)||(ref.includes(c.tag)&&!state.t3.people.some(p=>p.tag===c.tag)))continue;
        if(mode==='appearance'&&!c.appearance){toast((c.name||c.tag)+'には外見メモがありません');continue;}
        const p={id:c.id,name:c.name||c.tag,tag:mode==='appearance'?'':c.tag,position:'',appearance:mode==='tag'?'':c.appearance||'',outfit:'',pose:''};
        state.t3.people.push(p);if(p.tag&&!ref.includes(p.tag))ref.push(p.tag);
      }else{if(mode!=='appearance'&&!ref.includes(c.tag))ref.push(c.tag);if(mode!=='tag'&&c.appearance)state.adv.lookMain=[state.adv.lookMain,c.appearance].filter(Boolean).join('\n');}
      c.lastUsedAt=Date.now();count++;ui.selected.delete(id);
    }
    safeSave(K.charaLib,lib);state.manualEdit=false;syncT3UI();render();renderCharaLibList();toast(count?count+'人を追加しました。取り消しで戻せます':'追加済みです');
  }
  function openEditor(c){if(ui.editorDirty&&ui.editor!==(c?.id||null)){askConfirm('保存前のキャラ入力があります。入力を置き換えますか？',()=>{ui.editorDirty=false;openEditor(c);},'入力を置き換える');return;}
    if(!ui.editorDirty){ui.editor=c?.id||null;$('#cl-work').value=c?.work||'';$('#cl-name').value=c?.name||'';$('#cl-tag').value=c?.tag||'';$('#cl-note').value=c?.note||'';$('#cl-appearance').value=c?.appearance||'';$('#ux-char-aliases').value=(c?.aliases||[]).join(', ');$('#ux-char-auto').checked=false;$('#ux-char-duplicate').textContent='';}
    openSheet('uxCharEditor');
  }
  function saveCharacter(allowDuplicate=false){const tag=formatCharaTag($('#cl-tag').value);if(!tag){toast('タグを入力してください');return;}const lib=getCharaLib();const dup=lib.find(c=>c.id!==ui.editor&&norm(c.tag)===norm(tag));if(dup&&!allowDuplicate){$('#ux-duplicate-name').textContent=(dup.name||dup.tag)+' が登録済みです。登録方法を選んでください。';openSheet('uxDuplicateCharacter');return;}
    const existing=lib.find(c=>c.id===ui.editor);const c={...(existing||{}),id:existing?.id||uid('c'),tag,name:$('#cl-name').value.trim(),work:$('#cl-work').value.trim()||'未分類',note:$('#cl-note').value.trim(),appearance:$('#cl-appearance').value.trim(),aliases:$('#ux-char-aliases').value.split(/[,、]/).map(x=>x.trim()).filter(Boolean),fav:!!existing?.fav,ts:existing?.ts||Date.now(),workAuto:$('#ux-char-auto').checked,workSource:$('#ux-char-auto').checked?'unclassified':'manual'};
    if(!existing&&c.work==='未分類'&&!$('#cl-work').value.trim()){const key=workKeyFromCharacterTag(tag);if(key&&WORK_LABELS[key]){c.work=WORK_LABELS[key];c.workKey=key;c.workAuto=true;c.workSource='known-tag';}}
    if(existing)lib[lib.findIndex(x=>x.id===c.id)]=c;else lib.unshift(c);
    const done=safeSave(K.charaLib,lib);ui.editorDirty=false;ui.editor=null;closeSheet('uxCharEditor');renderCharaLibList();toast(done?'キャラを保存しました':'キャラは一時保持中です。バックアップしてください');
  }
  function bulkRows(){const lib=getCharaLib(),seen=new Set(lib.map(c=>norm(c.tag)));return $('#bulkCharaArea').value.split('\n').map((line,i)=>{
    if(!line.trim())return null;const parts=line.split(/[|｜]/).map(x=>x.trim());let work='',name='',tag='',note='';
    if(parts.length>=4)[work,name,tag,note]=parts;else if(parts.length>=2)[name,tag,note='']=parts;else tag=parts[0];
    const error=parts.length>4?'区切りが多すぎます':!tag?'タグが空です':'';const formatted=formatCharaTag(tag);const key=work?'':workKeyFromCharacterTag(formatted);
    const duplicate=seen.has(norm(formatted));if(!error)seen.add(norm(formatted));
    return {line:i+1,error,duplicate,work:work||WORK_LABELS[key]||'未分類',workAuto:!work&&!!WORK_LABELS[key],workKey:key,name,tag:formatted,note};
  }).filter(Boolean);}
  function installBulkRegistration(){
    const options=document.createElement('label');options.className='ux-inline';options.innerHTML='<input type="checkbox" id="ux-bulk-duplicates">重複タグも衣装差分として登録する';$('#bulkCharaPreview').before(options);
    renderBulkCharaPreview=function(){const rows=bulkRows();$('#bulkCharaCount').textContent=rows.filter(x=>!x.error&&!x.duplicate).length;$('#bulkCharaPreview').innerHTML=rows.map(x=>`<div class="ux-card">${x.line}行目：${esc(x.error||x.work+' / '+(x.name||x.tag))} ${x.duplicate?'（重複。既定ではスキップ）':''}</div>`).join('');};
    // The original listener captured the earlier function; replace its input dispatch explicitly.
    onCapture('bulkCharaArea',renderBulkCharaPreview,'input');
    onCapture('btnOpenBulkChara',()=>{renderBulkCharaPreview();openSheet('sheetBulkChara');});
    const save=$('#bulkCharaConfirm');
    if(save)onCapture(save.id,()=>{const rows=bulkRows(),include=$('#ux-bulk-duplicates').checked,valid=rows.filter(x=>!x.error&&(!x.duplicate||include));if(!valid.length){toast('登録できる行がありません');return;}askConfirm('正常行'+valid.length+'件を登録します。エラー'+rows.filter(x=>x.error).length+'件、重複除外'+rows.filter(x=>x.duplicate&&!include).length+'件は登録しません。',()=>{const lib=getCharaLib();if(lib.length+valid.length>2000){toast('キャラ上限2000件を超えるため中止しました');return;}const seen=new Set(lib.map(c=>norm(c.tag)));let added=0;for(const x of valid){if(!include&&seen.has(norm(x.tag)))continue;seen.add(norm(x.tag));lib.push({...x,id:uid('c'),fav:false,ts:Date.now(),workSource:x.workAuto?'known-tag':x.work==='未分類'?'unclassified':'manual'});added++;}safeSave(K.charaLib,lib);renderCharaLibList();toast(added+'件を登録しました。入力は確認のため保持しています。');},'正常行を登録');});
  }
  function openWorkEditor(){if(!ui.selected.size)return;$('#ux-work-targets').textContent=[...ui.selected].map(id=>getCharaLib().find(c=>c.id===id)?.name||id).join('、');$('#ux-work-name').value='';openSheet('uxWorkEditor');}
  function classificationPlan(lib){
    const mapping=new Map();for(const c of lib){if(!c.workAuto&&c.work!=='未分類'){const key=workKeyFromCharacterTag(c.tag);if(key){if(!mapping.has(key))mapping.set(key,new Set());mapping.get(key).add(c.work);}}}
    return lib.filter(c=>c.workSource!=='manual'&&(c.work==='未分類'||c.workAuto)).map(c=>{const body=c.tag.replace(/^\s*character\s*:\s*/i,'');const keys=[...body.matchAll(/_\(([^()]+)\)/g)].map(m=>norm(m[1]).trim().replace(/\s+/g,'_')).filter(k=>!NON_WORK_TAG_QUALIFIERS.has(k));const unique=[...new Set(keys)];const key=unique[0]||'';const known=mapping.get(key);const conflict=unique.length>1||(known&&known.size>1);const work=known?.size===1?[...known][0]:WORK_LABELS[key]||workLabelFromKey(key);return {id:c.id,name:c.name||c.tag,before:c.work,work,key,tag:c.tag,reason:conflict?'競合':!key?'判定不可':known?.size===1?'手動対応':WORK_LABELS[key]?'既知タグ':'要確認',checked:!conflict&&!!key&&(known?.size===1||!!WORK_LABELS[key])};}).filter(x=>x.before!==x.work||x.reason==='競合'||x.reason==='判定不可');
  }
  function showClassification(){ui.plan=classificationPlan(getCharaLib());$('#ux-classification-plan').innerHTML=ui.plan.length?ui.plan.map((p,i)=>`<label><input type="checkbox" data-plan="${i}" ${p.checked?'checked':''} ${['競合','判定不可'].includes(p.reason)?'disabled':''}> ${esc(p.name)}：${esc(p.before)} → ${esc(p.work)} <span class="status-pill">${esc(p.reason)}</span><small>根拠：${esc(p.tag)}</small></label>`).join(''):'<p>変更候補はありません。</p>';$('#ux-classification-undo').disabled=!store.get(classificationKey,null);openSheet('uxClassification');}
  function applyClassification(){const picks=[...$('#ux-classification-plan').querySelectorAll('[data-plan]:checked')].map(el=>ui.plan[+el.dataset.plan]);if(!picks.length){toast('変更候補を選択してください');return;}const lib=getCharaLib();if(!safeSave(classificationKey,lib)){toast('分類前の退避に失敗したため、適用を中止しました');return;}const byId=new Map(picks.map(p=>[p.id,p]));lib.forEach(c=>{const p=byId.get(c.id);if(p){c.work=p.work;c.workKey=p.key;c.workAuto=true;c.workSource=p.reason==='要確認'?'candidate':'known-tag';}});safeSave(K.charaLib,lib);renderCharaLibList();closeSheet('uxClassification');toast(picks.length+'人の作品を更新しました');}

  function installSaved(){
    sheet('uxSaved','保存した内容','<div class="ux-pills" id="ux-saved-tabs"><button class="btn" data-saved="prompts">プロンプト</button><button class="btn" data-saved="projects">プロジェクト</button><button class="btn" data-saved="history">コピー履歴</button></div><label class="lbl" for="ux-saved-search">保存内容を検索</label><input id="ux-saved-search" class="ux-search"><label class="ux-inline"><input type="checkbox" id="ux-saved-fav">お気に入りのみ</label><button class="btn" id="ux-project-new">現在内容を別名で保存</button><div id="ux-saved-list"></div>');
    $('#ux-saved-tabs').onclick=e=>{const b=e.target.closest('[data-saved]');if(b){savedFilter=b.dataset.saved;renderSaved();}};$('#ux-saved-search').oninput=renderSaved;$('#ux-saved-fav').onchange=()=>{savedFav=$('#ux-saved-fav').checked;renderSaved();};$('#ux-project-new').onclick=()=>{$('#btnProjects').click();};
    $('#ux-saved-list').onclick=handleSaved;
    sheet('uxPromptSave','プロンプトを保存','<label class="lbl" for="ux-prompt-name">名前</label><input id="ux-prompt-name" maxlength="120"><label class="lbl" for="ux-prompt-target">保存先</label><select id="ux-prompt-target"><option value="">新しいプロンプト</option></select><p class="hint">採用中の完成文とNegativeを保存します。フォームはプロジェクトとして別途保存できます。</p><button class="btn primary" id="ux-prompt-save">保存する</button>');
    onCapture('btnFav',()=>{if(!$('#pvArea').value.trim()){toast('プロンプトが空です');return;}$('#ux-prompt-name').value='';$('#ux-prompt-target').innerHTML='<option value="">別名で新規保存</option>'+store.get(K.hist,[]).filter(h=>h.fav).map(h=>`<option value="${esc(h.id)}">${esc(h.name||h.text.slice(0,40))}</option>`).join('');openSheet('uxPromptSave');});
    $('#ux-prompt-save').onclick=()=>{const name=$('#ux-prompt-name').value.trim();if(!name){toast('保存する名前を入力してください');return;}const id=$('#ux-prompt-target').value;const doSave=()=>{const list=store.get(K.hist,[]),old=list.find(h=>h.id===id);const item={id:old?.id||uid('h'),name,text:$('#pvArea').value,sourceText:$('#pvArea').value,negative:state.negative,mode:state.mode,fav:true,ts:Date.now(),kind:'prompt',state:captureSnapshot()};if(old)list[list.indexOf(old)]=item;else list.unshift(item);safeSave(K.hist,list);closeSheet('uxPromptSave');renderSaved();toast(store.failures.size?'保存できません。バックアップしてください':'プロンプトを保存しました');};if(id)askConfirm('選択した保存プロンプトを上書きします。',doSave,'上書きする');else doSave();};
    onCapture('projectList',e=>{const b=e.target.closest('[data-act]');if(!b)return;const p=getProjects().find(x=>x.id===b.closest('[data-id]').dataset.id);if(!p)return;projectAction(p,b.dataset.act);});
    onCapture('btnProjectSave',()=>{const name=$('#projectName').value.trim();if(!name){toast('プロジェクト名を入力してください');return;}const list=getProjects(),id=uid('p');list.unshift({id,name,created:Date.now(),updated:Date.now(),prompt:$('#pvArea').value,state:captureSnapshot()});safeSave(K.projects,list);state.activeProjectId=id;safeSave(K.activeProject,id);renderProjects();toast(store.failures.size?'プロジェクトは一時保持中です':'別名で保存しました');});
    onCapture('t3-history',()=>openSaved());onCapture('btnHist',()=>openSaved('history'));
    onCapture('histList',e=>{const b=e.target.closest('[data-act]');if(!b)return;const p=store.get(K.hist,[]).find(x=>x.id===b.closest('[data-id]').dataset.id);if(p)savedAction(p,b.dataset.act);});
  }
  function openSaved(filter='prompts'){savedFilter=filter;renderSaved();openSheet('uxSaved');}
  function renderSaved(){const q=norm($('#ux-saved-search').value);const list=savedFilter==='projects'?getProjects():store.get(K.hist,[]).filter(h=>savedFilter==='prompts'?h.fav:h.kind!=='prompt');const shown=list.filter(h=>(!savedFav||h.fav)&&norm([h.name,h.text,h.prompt,h.negative].join(' ')).includes(q)).sort((a,b)=>(b.updated||b.ts||0)-(a.updated||a.ts||0));$('#ux-saved-tabs').querySelectorAll('[data-saved]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.saved===savedFilter)));$('#ux-project-new').hidden=savedFilter!=='projects';$('#ux-saved-list').innerHTML=shown.length?shown.map(h=>`<div class="ux-card" data-id="${esc(h.id)}"><strong>${esc(h.name||h.text?.slice(0,55)||'無題')}</strong><p class="hint">${new Date(h.updated||h.ts||h.created||0).toLocaleString('ja-JP')} ${h.fav?'★':''}</p><p>${esc((h.text||h.prompt||'').slice(0,220))}</p><div class="ux-toolbar"><button class="btn small" data-saved-act="load">開く</button><button class="btn small" data-saved-act="duplicate">差分を作る</button><button class="btn small" data-saved-act="copy">コピー</button><details><summary>管理</summary><button class="btn small" data-saved-act="fav">お気に入りを切替</button>${savedFilter==='projects'?'<button class="btn small" data-saved-act="overwrite">現在内容で上書き</button>':''}<button class="btn small danger" data-saved-act="delete">削除</button></details></div></div>`).join(''):'<p class="ux-empty">'+(q?'条件に一致する保存内容がありません。':'この一覧にはまだ保存内容がありません。')+'</p>';}
  function handleSaved(e){const b=e.target.closest('[data-saved-act]');if(!b)return;const id=b.closest('[data-id]').dataset.id,p=(savedFilter==='projects'?getProjects():store.get(K.hist,[])).find(x=>x.id===id);if(!p)return;if(savedFilter==='projects')projectAction(p,b.dataset.savedAct);else savedAction(p,b.dataset.savedAct);}
  function loadSafely(action){askConfirm('現在の作業を選択した内容で置き換えます。取り消しで戻せます。',()=>{checkpoint();action();closeSheet('uxSaved');},'開く');}
  function savedAction(p,act){const list=store.get(K.hist,[]);
    if(act==='copy')writeClipboard(p.text).then(ok=>{toast(ok?'コピーしました':'コピーできません。開いて本文を選択してください');});
    if(act==='fav'){p.fav=!p.fav;list[list.findIndex(x=>x.id===p.id)]=p;safeSave(K.hist,list);renderSaved();}
    if(['delete','del'].includes(act))askConfirm('この保存内容を削除します。',()=>{safeSave(K.hist,list.filter(x=>x.id!==p.id));renderSaved();toastUndo('削除しました',()=>{const now=store.get(K.hist,[]);now.push(p);safeSave(K.hist,now);renderSaved();});},'削除する');
    if(['load','duplicate','dup'].includes(act))loadSafely(()=>{if(act!=='load'&&p.state)applySnapshot(p.state);else {freshVersions();versions.manual=p.sourceText||p.text;versions.selected='manual';versions.baseAuto=autoText();state.manualEdit=false;state.negative=p.negative||p.state?.negative||'';render();}state.activeProjectId=null;closeSheet('sheetHist');});
  }
  function projectAction(p,act){const list=getProjects();
    if(act==='copy')writeClipboard(p.prompt||'').then(ok=>toast(ok?'コピーしました':'コピーできません'));
    if(act==='load')loadSafely(()=>{applySnapshot(p.state);state.activeProjectId=p.id;safeSave(K.activeProject,p.id);closeSheet('sheetProjects');});
    if(act==='duplicate'){loadSafely(()=>{const copy=clone(p);copy.id=uid('p');copy.name=p.name+'（差分）';copy.created=copy.updated=Date.now();list.unshift(copy);safeSave(K.projects,list);applySnapshot(copy.state);state.activeProjectId=copy.id;safeSave(K.activeProject,copy.id);closeSheet('sheetProjects');renderProjects();});}
    if(act==='overwrite')askConfirm('「'+p.name+'」を現在の作業で上書きします。',()=>{const before=clone(p);const now=getProjects(),index=now.findIndex(x=>x.id===p.id);if(index<0)return;now[index]={...p,state:captureSnapshot(),prompt:$('#pvArea').value,updated:Date.now()};safeSave(K.projects,now);renderProjects();renderSaved();toastUndo('上書きしました',()=>{const latest=getProjects(),i=latest.findIndex(x=>x.id===p.id);if(i>=0)latest[i]=before;else latest.push(before);safeSave(K.projects,latest);renderProjects();renderSaved();});},'上書きする');
    if(act==='fav'){const current=list.find(x=>x.id===p.id);current.fav=!current.fav;safeSave(K.projects,list);renderSaved();}
    if(act==='delete')askConfirm('プロジェクト「'+p.name+'」を削除します。',()=>{safeSave(K.projects,list.filter(x=>x.id!==p.id));renderProjects();renderSaved();toastUndo('削除しました',()=>{const now=getProjects();now.push(p);safeSave(K.projects,now);renderProjects();renderSaved();});},'削除する');
  }

  function exportBackup(){
    const data={...currentBackupObject(),exported:new Date().toISOString()},json=JSON.stringify(data,null,2);$('#exportArea').hidden=false;$('#exportArea').value=json;
    const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='tsubaki_koubou_v5_backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
    safeSave('tsubaki.lastExport',Date.now());updateBackupNote();let warning='';try{validateImportData(data);}catch(e){warning=e.message;}toast(blob.size>2*1024*1024?'書き出しを開始しました。ただし2MB上限を超え、この版では読み戻せません。':warning?'救出データを書き出しました。通常の読み戻しには確認が必要です：'+warning:'書き出しを開始しました。端末にファイルを保存してください');
  }
  function updateBackupNote(){const time=store.get('tsubaki.lastExport',null);$('#ux-backup-note').textContent='このブラウザに保存。別端末には自動同期されません。読み込み上限2MB。対応形式v1〜v5。最終書き出し操作：'+(time?new Date(time).toLocaleString('ja-JP'):'未実施')+'。ファイルの保存完了は端末側で確認してください。';}
  currentBackupObject=function(){const data=originals.currentBackupObject();data.ver=5;data.uxPrefs=clone(prefs);data.classificationBackup=store.get(classificationKey,null);const rawRecovery={};for(const [key,message]of store.failures){if(message.includes('読み込めません')){try{rawRecovery[key]=localStorage.getItem(key);}catch(e){}}}if(Object.keys(rawRecovery).length)data.rawRecovery=rawRecovery;return data;};
  validateImportData=function(data){
    if(Number(data?.ver)>5)throw new Error('この版で対応していないバックアップです');
    if(new Blob([JSON.stringify(data)]).size>2*1024*1024)throw new Error('読み込み上限2MBを超えています');
    for(const [key,max] of [['history',500],['charaLibrary',2000],['projects',500],['styleNames',1000],['myPresets',1000],['favTags',1000],['recentTags',1000]])if(data?.[key]?.length>max)throw new Error(key+'が上限'+max+'件を超えています。切り捨てず中止しました');
    if(data?.charaLibrary?.some(x=>!x||typeof x.tag!=='string'))throw new Error('無効なキャラ行があります');
    if(data?.history?.some(x=>!x||typeof x.text!=='string'))throw new Error('無効な履歴行があります');
    if(data?.projects?.some(x=>!x||typeof x.id!=='string'||typeof x.name!=='string'||!x.state))throw new Error('無効なプロジェクト行があります');
    if(data?.charaLibrary?.some(x=>x.aliases!==undefined&&(!Array.isArray(x.aliases)||x.aliases.some(s=>typeof s!=='string'))))throw new Error('キャラの別名が不正です');
    function snapshotShape(s){
      if(!s||typeof s!=='object'||Array.isArray(s))throw new Error('下書き・プロジェクト形式が不正です');
      for(const key of ['t3','basic','adv','tag','tpl','versions'])if(s[key]!==undefined&&(!s[key]||typeof s[key]!=='object'||Array.isArray(s[key])))throw new Error(key+'の保存形式が不正です');
      if(s.t3){for(const key of Object.keys(freshT3()))if(s.t3[key]!==undefined){const value=s.t3[key];if(['charas','people'].includes(key)){if(!Array.isArray(value))throw new Error(key+'が配列ではありません');}else if(['characterLora','styleLora'].includes(key)){if(typeof value!=='boolean')throw new Error('LoRA形式が不正です');}else if(typeof value!=='string'||value.length>10000)throw new Error('入力欄の文字数・形式が不正です');}
        if(s.t3.charas?.some(x=>typeof x!=='string'||x.length>4000))throw new Error('キャラタグ形式が不正です');if(s.t3.people?.some(p=>!p||typeof p.id!=='string'||['name','tag','position','appearance','outfit','pose'].some(k=>p[k]!==undefined&&(typeof p[k]!=='string'||p[k].length>4000))))throw new Error('人物別入力の形式が不正です');}
      if(s.adv){for(const key of ['charas','quality'])if(s.adv[key]!==undefined&&!Array.isArray(s.adv[key]))throw new Error('素材構築の配列形式が不正です');if(s.adv.aes&&AES_CATS.some(c=>s.adv.aes[c.key]!==undefined&&!Array.isArray(s.adv.aes[c.key])))throw new Error('撮影設定の形式が不正です');}
      if(s.tag&&s.tag.tags!==undefined&&!Array.isArray(s.tag.tags))throw new Error('タグ資産の形式が不正です');
    }
    if(data?.draft)snapshotShape(data.draft);for(const p of data?.projects||[])snapshotShape(p.state);for(const h of data?.history||[])if(h.state)snapshotShape(h.state);
    if(data?.userDict){if(Object.keys(data.userDict).length>300)throw new Error('辞書分類が300件を超えています');for(const key of Object.keys(data.userDict))if(['__proto__','constructor','prototype'].includes(key))throw new Error('辞書分類名が不正です');for(const items of Object.values(data.userDict))if(!Array.isArray(items)||items.length>3000||items.some(x=>!x||typeof x.en!=='string'||x.en.length>1000||(x.ja&&x.ja.length>500)))throw new Error('辞書に上限超過または無効な行があります');}
    // Reject silent field truncation before the legacy sanitizer runs.
    const limits={id:80,work:120,workKey:160,name:200,tag:1000,note:1000,appearance:4000,text:50000,sourceText:50000};
    [...(data?.charaLibrary||[]),...(data?.history||[])].forEach(item=>Object.entries(limits).forEach(([k,max])=>{if(typeof item[k]==='string'&&item[k].length>max)throw new Error(k+'が文字数上限を超えています');}));
    const out=originals.validateImportData(data);
    if(out.charaLibrary)out.charaLibrary.forEach((c,i)=>{const src=data.charaLibrary[i];c.aliases=Array.isArray(src.aliases)?src.aliases.filter(x=>typeof x==='string'):[];c.lastUsedAt=Number(src.lastUsedAt)||0;if(['manual','known-tag','candidate','unclassified'].includes(src.workSource))c.workSource=src.workSource;});
    if(out.history)out.history.forEach((h,i)=>{const src=data.history[i];if(typeof src.name==='string')h.name=src.name;if(typeof src.negative==='string')h.negative=src.negative;if(src.kind==='prompt')h.kind='prompt';});
    if(data.uxPrefs)out.uxPrefs={view:data.uxPrefs.view==='list'?'list':'work',sort:['work','recent','name','new','used'].includes(data.uxPrefs.sort)?data.uxPrefs.sort:'work',favFirst:!!data.uxPrefs.favFirst};
    if(Array.isArray(data.classificationBackup))out.classificationBackup=validateImportData({app:'tsubaki-koubou',ver:5,charaLibrary:data.classificationBackup}).charaLibrary;
    return out;
  };
  applyImportedData=function(data,mode){
    const backup=currentBackupObject();clearTimeout(draftSaveTimer);
    if(!safeSave(K.importBackup,backup))throw new Error('適用前の退避に失敗しました。書き出してから再試行してください');
    const merged=(key,incoming,keyFn,max)=>{const current=mode==='replace'?[]:store.get(key,[]);const map=new Map(current.map(x=>[keyFn(x),x]));for(const x of incoming){const id=keyFn(x);if(map.has(id)&&JSON.stringify(map.get(id))!==JSON.stringify(x)){const copy={...x,id:uid(key===K.projects?'p':'c')};map.set(copy.id,copy);}else map.set(id,x);}const values=[...map.values()];if(values.length>max)throw new Error('統合後の件数が上限を超えます。適用を中止しました');return values;};
    const writes=new Map();
    if(data.charaLibrary)writes.set(K.charaLib,merged(K.charaLib,data.charaLibrary,x=>x.id,2000));
    if(data.history)writes.set(K.hist,merged(K.hist,data.history,x=>x.id,500));
    if(data.projects)writes.set(K.projects,merged(K.projects,data.projects,x=>x.id,500));
    if(data.userDict){const dict=mode==='replace'?{}:clone(getUserDict());for(const [g,items] of Object.entries(data.userDict)){const current=dict[g]||[],map=new Map(current.map(x=>[x.en,x]));for(const x of items){if(map.has(x.en)&&JSON.stringify(map.get(x.en))!==JSON.stringify(x))throw new Error('辞書の競合：'+g+' / '+x.en+'。追加統合では上書きしません');map.set(x.en,x);}if(map.size>3000)throw new Error('辞書の統合後上限超過');dict[g]=[...map.values()];}if(Object.keys(dict).length>300)throw new Error('辞書分類の統合後上限超過');writes.set(K.userDict,dict);}
    for(const [src,key] of [['styleNames',K.styles],['myPresets',K.myPresets],['favTags',K.favTags],['recentTags',K.recentTags]])if(data[src]){const list=mode==='replace'?data[src]:[...store.get(key,[]),...data[src]].filter((x,i,a)=>a.findIndex(y=>JSON.stringify(x)===JSON.stringify(y))===i);if(list.length>1000)throw new Error(src+'の統合後上限超過');writes.set(key,list);}
    for(const [src,key] of [['aiAssist',K.ai],['theme',K.theme],['engFirst',K.engFirst],['twoLine',K.twoLine],['singleLine',K.singleLine],['fontLarge',K.fontLarge],['charaSort',K.charaSort]])if(data[src]!==undefined)writes.set(key,data[src]);
    if(data.uxPrefs)writes.set(prefKey,data.uxPrefs);if(data.classificationBackup)writes.set(classificationKey,data.classificationBackup);
    if(mode==='replace'&&data.draft)writes.set(K.draft,data.draft);
    // Stage and validate every write before changing persistent data. A failed commit rolls back written keys.
    const removals=mode==='replace'?[...Object.values(K),prefKey,classificationKey].filter(k=>k!==K.importBackup&&!writes.has(k)):[];
    if(!store.transaction([...writes],removals)){updateStatus();throw new Error('保存に失敗しました。直前データは退避されています。');}
    if(mode==='replace'){Object.assign(prefs,{view:'work',sort:'work',favFirst:false});freshVersions();applySnapshot(data.draft||{mode:'t3',t3:freshT3()});}
    if(data.uxPrefs)Object.assign(prefs,data.uxPrefs);$('#ux-library-view').value=prefs.view;$('#ux-fav-first').checked=prefs.favFirst;renderCharaLibList();renderSaved();renderProjects();applyDisplayPrefs();updateStatus();
  };
  function installBackup(){
    const note=document.createElement('p');note.id='ux-backup-note';note.className='hint';$('#btnExport').parentElement.before(note);updateBackupNote();
    const restore=document.createElement('button');restore.id='ux-restore-import';restore.className='btn';restore.textContent='前回の読み込み前へ戻す';note.after(restore);
    restore.onclick=()=>{const backup=store.get(K.importBackup,null);if(!backup){toast('戻せる退避データがありません');return;}askConfirm('直前の読み込み前へ戻します。現在内容も退避します。',()=>{try{applyImportedData(validateImportData(backup),'replace');toast('直前データへ戻しました');}catch(e){toast(e.message);}},'復元する');};
    onCapture('btnExport',exportBackup);
    onCapture('btnImportRun',()=>{try{const data=validateImportData(JSON.parse($('#importArea').value));const mode=$('#importMode').value;const perform=()=>{try{applyImportedData(data,mode);toast('読み込みました。直前データは退避済みです');}catch(e){toast('読み込みを中止：'+e.message);}};if(mode==='replace')askConfirm('キャラ・履歴・プロジェクト・辞書・設定・下書きをバックアップ内容で全置換します。',perform,'退避して全置換');else perform();}catch(e){toast('読み込みを中止：'+e.message);}});
    previewImport=function(){try{const data=validateImportData(JSON.parse($('#importArea').value));const duplicateCount=(data.charaLibrary||[]).filter(c=>getCharaLib().some(x=>x.id===c.id)).length;$('#importSummary').textContent='形式v'+data.ver+' / キャラ'+(data.charaLibrary?.length||0)+'件 / プロジェクト'+(data.projects?.length||0)+'件 / 履歴'+(data.history?.length||0)+'件。ID重複 '+duplicateCount+'件（異なる内容は別登録として保持）。';return data;}catch(e){$('#importSummary').textContent=$('#importArea').value.trim()?'確認エラー：'+e.message:'';return null;}};
    onCapture('btnClearAll',()=>askConfirm('キャラ・履歴・辞書・プロジェクト・設定・現在の下書きを全消去します。まず書き出すことを推奨します。',()=>{const backup=currentBackupObject();if(!safeSave(K.importBackup,backup)){toast('退避できないため全消去を中止しました');return;}for(const key of [...Object.values(K),prefKey,classificationKey])if(key!==K.importBackup)store.del(key);checkpoint();freshVersions();applySnapshot({mode:'t3',t3:freshT3()});renderCharaLibList();renderSaved();toast('初期化しました。「前回の読み込み前へ戻す」で退避内容を復元できます');},'退避して全消去'));
    window.addEventListener('storage',e=>{if(e.key?.startsWith('tsubaki.')&&e.oldValue!==e.newValue){store.markConflict();updateStatus();}});
  }
  addStyle();installLayout();installSheets();installLibrary();installSaved();installBackup();
  // No eager migration or classification: existing values stay byte-for-byte unchanged until an explicit edit.
  return {classificationPlan,showClassification,applyClassification,undoStep,versions:()=>clone(versions),prefs,ui,exportBackup,openEditor,renderSaved};
})();
