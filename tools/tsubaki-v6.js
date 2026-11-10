/* Integration installed after the maintained UX layer, before draft restoration. */
const T3V6=(()=>{
 const roleOptions='<option value="custom">自由記述</option>'+['identity','outfit','pose','composition','style'].map(v=>`<option value="${v}">${({identity:'人物の特徴',outfit:'衣装',pose:'ポーズ',composition:'構図',style:'画風'})[v]}</option>`).join('');
 const panel=document.createElement('details');panel.className='t3-details';panel.id='t3-structure';panel.innerHTML=`<summary>Tsubaki.3 構造・仕上げ</summary><p id="t3-compiler-note" class="hint"></p><button class="btn small" id="t3-optimize">旧・新の構造を比較</button><label class="lbl" for="t3-ref1Role">画像1から借りる要素（編集では元画像）</label><select id="t3-ref1Role">${roleOptions}</select><label class="lbl" for="t3-ref2Role">画像2から借りる要素</label><select id="t3-ref2Role">${roleOptions}</select><p class="hint" id="t3-attach-order"></p><label class="lbl" for="t3-textRole">文字の役割</label><select id="t3-textRole"><option value="text">文字</option><option value="title">タイトル</option><option value="caption">説明</option><option value="dialogue">台詞</option><option value="character name">人物名</option></select><fieldset><legend>追加の品質・画風（任意）</legend>${T3Core.presets.map(p=>`<label style="display:block"><input type="checkbox" data-t3-quality="${p.id}"> ${p.label}</label>`).join('')}</fieldset><p class="hint">資料を参考に作成した短い英文です。未選択の条件は追加しません。</p><fieldset><legend>画像編集で今回変更する仕上げ項目</legend>${[['style','画風・追加ブロック'],['light','光'],['camera','カメラ'],['layout','レイアウト']].map(([k,v])=>`<label style="display:block"><input type="checkbox" data-t3-edit="${k}"> ${v}</label>`).join('')}</fieldset><p class="hint">編集時の非採用項目も入力は保持します。画像はPixAIへ手動で添付してください。出力比率はPixAI側でも設定します。</p>`;
 $('#ux-style-details').append(panel);
 const oldRender=render,oldSync=syncT3UI;
 function sync(){if(!$('#t3-compiler-note'))return;const t=state.t3;
  $('#t3-compiler-note').textContent=t.compilerVersion==='t3-structured-v1'?'構造最適化版を使用中。更新: 2026-11-10':'旧形式の出力を保持中。比較して最適化できます。';
  ['ref1Role','ref2Role','textRole'].forEach(k=>$('#t3-'+k).value=t[k]||({textRole:'text'}[k]||'custom'));
  $$('[data-t3-quality]').forEach(el=>el.checked=(t.qualityBlocks||[]).some(p=>p.id===el.dataset.t3Quality));
  $$('[data-t3-edit]').forEach(el=>el.checked=(t.editFields||[]).includes(el.dataset.t3Edit));
  $('#t3-attach-order').textContent=t.task==='generate'?'新規生成では参照を使用しません。':`PixAI添付順: @image1（${['edit','referenceEdit'].includes(t.task)?'元画像':t.ref1Role||'特徴参照'}）${t.ref2?.trim()||t.ref2Role!=='custom'?' → @image2（'+(t.ref2Role||'参照')+'）':''}`;
 }
 syncT3UI=function(){oldSync();sync();};render=function(){oldRender();sync();};
 panel.addEventListener('change',e=>{const el=e.target;let key;
  if(el.dataset.t3Quality){const id=el.dataset.t3Quality;state.t3.qualityBlocks=(state.t3.qualityBlocks||[]).filter(p=>p.id!==id);if(el.checked)state.t3.qualityBlocks.push({...T3Core.presets.find(p=>p.id===id)});}
  else if(el.dataset.t3Edit){key=el.dataset.t3Edit;state.t3.editFields=(state.t3.editFields||[]).filter(x=>x!==key);if(el.checked)state.t3.editFields.push(key);}
  else if(['t3-ref1Role','t3-ref2Role','t3-textRole'].includes(el.id))state.t3[el.id.slice(3)]=el.value;
  else return;
  state.manualEdit=false;render();
 });
 const sheet=document.createElement('div');sheet.className='sheet ux-managed';sheet.id='t3-compare';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-label','構造の比較');sheet.innerHTML='<div class="sheet-body"><h2>旧・新の構造を比較</h2><label class="lbl" for="t3-before">現在の自動版</label><textarea id="t3-before" readonly rows="7"></textarea><label class="lbl" for="t3-after">最適化した自動版</label><textarea id="t3-after" readonly rows="7"></textarea><p class="hint">採用時は現在のプロジェクトを複製します。手動版は保持し、自動版への変更は「自動版を使う」で確認できます。</p><button class="btn" id="t3-adopt">複製して採用</button><button class="btn" id="t3-compare-close">閉じる</button></div>';document.body.append(sheet);
 $('#t3-optimize').onclick=()=>{$('#t3-before').value=joinSegments(buildSegments());$('#t3-after').value=T3Core.compile({...state.t3,compilerVersion:'t3-structured-v1'}).blocks.map(b=>b.text).join('\n\n');openSheet('t3-compare');};
 $('#t3-compare-close').onclick=()=>closeSheet('t3-compare');
 $('#t3-adopt').onclick=()=>{const snapshot=captureSnapshot(),projects=getProjects();if(projects.length>=500){toast('プロジェクト上限です。採用を中止しました');return;}const id='p'+crypto.randomUUID();const copy=JSON.parse(JSON.stringify(snapshot));copy.t3.compilerVersion='t3-structured-v1';copy.activeProject=id;
  if(!store.set(K.projects,[...projects,{id,name:'T3構造最適化 '+new Date().toLocaleString('ja-JP'),created:Date.now(),updated:Date.now(),state:copy}])){toast('保存できないため中止しました');return;}
  applySnapshot(copy);closeSheet('t3-compare');toast('最適化したプロジェクトを複製しました');};
 function validate(t){
  if(t.compilerVersion!==undefined&&!['legacy-v5','t3-structured-v1'].includes(t.compilerVersion))throw new Error('未知のコンパイラ版です');
  for(const k of ['ref1Role','ref2Role'])if(t[k]!==undefined&&!['custom','identity','outfit','pose','composition','style'].includes(t[k]))throw new Error('参照の役割が不正です');
  if(t.textRole!==undefined&&!['text','title','caption','dialogue','character name'].includes(t.textRole))throw new Error('文字の役割が不正です');
  if(t.editFields!==undefined&&(!Array.isArray(t.editFields)||t.editFields.length>4||t.editFields.some(x=>!['style','light','camera','layout'].includes(x))))throw new Error('編集対象が不正です');
  if(t.qualityBlocks!==undefined&&(!Array.isArray(t.qualityBlocks)||t.qualityBlocks.length>32||t.qualityBlocks.some(p=>!p||typeof p.id!=='string'||p.id.length>80||typeof p.text!=='string'||p.text.length>4000||!Number.isInteger(p.version)||typeof p.group!=='string')))throw new Error('品質ブロックが不正です');
  for(const p of t.people||[])for(const k of ['promptAlias','appearancePolicy'])if(p[k]!==undefined&&(typeof p[k]!=='string'||p[k].length>4000))throw new Error('人物別設定が不正です');
 }
 sync();return {validate};
})();
