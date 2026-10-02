(async function () {
  'use strict';
  const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const LABEL={vig:'生命力',mnd:'精神力',end:'持久力',str:'筋力',dex:'技量',int:'知力',fai:'信仰',arc:'神秘'};
  const SHORT={str:'筋',dex:'技',int:'知',fai:'信',arc:'神'};
  const DAMAGE=['物理','魔力','炎','雷','聖'], STATUS={5:'毒',6:'腐敗',7:'出血',8:'冷気',9:'睡眠',10:'発狂',11:'死'};
  const AFFINITY={'-1':'固有','0':'標準','1':'重厚','2':'鋭利','3':'上質','4':'炎','5':'焔術','6':'雷','7':'神聖','8':'魔力','9':'冷気','10':'毒','11':'血','12':'神秘'};
  const CATEGORY={1:'短剣',3:'直剣',5:'大剣',7:'特大剣',9:'曲剣',11:'大曲剣',13:'刀',14:'両刃剣',15:'刺剣',16:'重刺剣',17:'斧',19:'大斧',21:'槌',23:'大槌',24:'フレイル',25:'槍',28:'大槍',29:'斧槍',31:'鎌',35:'拳',37:'爪',39:'鞭',41:'特大武器',50:'小弓',51:'長弓',53:'大弓',55:'クロスボウ',56:'バリスタ',57:'杖',59:'複合触媒',61:'聖印',65:'小盾',67:'中盾',69:'大盾',87:'松明',88:'格闘',89:'調香瓶',90:'刺突盾',91:'投擲剣',92:'逆手剣',93:'軽大剣',94:'大刀',95:'獣爪'};
  const CLASSES={Vagabond:'放浪騎士',Warrior:'剣士',Hero:'勇者',Bandit:'盗賊',Astrologer:'星見',Prophet:'預言者',Samurai:'侍',Prisoner:'囚人',Confessor:'密使',Wretch:'素寒貧'};
  const ARMOR_LABEL=['頭','胴','腕','脚'], ARMOR_SLOT=['Head','Body','Arms','Legs'];
  const JOURNEYS=['NG','NG+','NG+2','NG+3','NG+4','NG+5','NG+6','NG+7'];
  const KEY='elden-ring-build-v1', SAVES='elden-ring-saves-v1';
  const number=(v,digits=0)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('ja-JP',{maximumFractionDigits:digits,minimumFractionDigits:digits}):'未計算';
  const lower=s=>String(s??'').normalize('NFKC').toLocaleLowerCase().replace(/\s/g,'');
  const name=x=>x?.name_ja||x?.name_en||'';
  const option=(value,label,selected=false)=>`<option value="${esc(value)}"${selected?' selected':''}>${esc(label)}</option>`;
  let toastTimer;
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
  try {
    await new Promise(resolve=>requestAnimationFrame(resolve));
    if(typeof DecompressionStream==='undefined')throw new Error('このブラウザはデータ展開に対応していません。最新のSafari・Chrome・Firefoxで開いてください。');
    const payload=JSON.parse($('er-payload').textContent),bytes=Uint8Array.from(atob(payload.data),c=>c.charCodeAt(0));
    const buffer=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    if(buffer.byteLength!==payload.raw_bytes)throw new Error('内蔵データのサイズが一致しません');
    if(globalThis.crypto?.subtle){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==payload.sha256)throw new Error('内蔵データの検証に失敗しました');}
    const data=JSON.parse(new TextDecoder().decode(buffer)), engine=EREngine.create(data,JSON.parse($('er-dps-data').textContent)), C=engine.catalogs;
    const defaultState={schema:1,name:'',stats:{vig:40,mnd:20,end:25,str:30,dex:25,int:30,fai:25,arc:34},className:'Vagabond',settings:{upgradeMode:'max',normal:25,somber:10,twoHand:false,scadu:0,inShadow:false,manualMultiplier:1,memory:10,weaponSort:'total'},weapons:Array(6).fill(''),armor:Array(4).fill(''),talismans:Array(4).fill(''),memorized:[],compare:[],catalyst:'',enemy:''};
    const defaultEnemy=data.enemies.find(e=>e.journey==='NG'&&e.name.includes('Margit, the Fell Omen'))||data.enemies[0];
    defaultState.enemy=defaultEnemy.id;
    let state=structuredClone(defaultState), activeTab='weapons', derived, weaponRows=[],spellRows=[],weaponLimit=40,spellLimit=40,saveError='',saved=[],lastWeaponDetail='',restoring=false,storageConflict=false;
    const sortedArmor=[...data.armor].sort((a,b)=>name(a).localeCompare(name(b),'ja'));
    const sortedTalismans=[...data.talismans].sort((a,b)=>name(a).localeCompare(name(b),'ja'));
    const weaponName=v=>`${name(C.weapons.get(v.weapon_id))}［${AFFINITY[v.affinity_id]||v.affinity_id}］`;
    const movesByWeapon=new Map();for(const m of data.moves){if(!movesByWeapon.has(m.weapon))movesByWeapon.set(m.weapon,[]);movesByWeapon.get(m.weapon).push(m);}
    const compatibleCatalysts=data.variants.filter(v=>v.sorcery_tool||v.incantation_tool);
    const statsLabel=stats=>EREngine.ATTRS.map(a=>`${SHORT[a]}${stats[a]}`).join(' / ');
    function memoryUsed(){return state.memorized.reduce((s,id)=>s+(C.spells.get(id)?.memory_slots||0),0);}
    function memoryAvailable(){return Math.min(12,state.settings.memory+(state.talismans.some(id=>C.talismans.get(id)?.name_en==='Moon of Nokstella')?2:0));}
    function multiplier(){return state.settings.manualMultiplier*(state.settings.inShadow?data.scadu[state.settings.scadu].attack:1);}
    function persist(){
      if(storageConflict){$('autosave-status').textContent='別タブの変更を検出したため、自動保存を停止しています。';$('conflict-actions').hidden=false;return;}
      try{localStorage.setItem(KEY,JSON.stringify(state));saveError='';$('autosave-status').textContent='この端末に自動保存済み';$('autosave-status').className='status';}
      catch(e){saveError='端末への保存に失敗しました。保存・共有からJSONを控えてください。';$('autosave-status').textContent=saveError;$('autosave-status').className='status error';}
    }
    function decodeShare(input){
      if(input.length>30000)throw new Error('共有コードが長すぎます');
      const code=(input.includes('#build=')?input.split('#build=')[1]:input.replace(/^build=/,'')).split('&')[0];
      if(!/^[A-Za-z0-9_-]+$/.test(code))throw new Error('共有コードを確認してください');
      return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(code.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));
    }
    try{const cache=localStorage.getItem(KEY);if(cache)state=engine.validateState(JSON.parse(cache));}
    catch(e){saveError='前回のビルドを復元できませんでした。元の保存値は変更していません。';}
    try{const ar=JSON.parse(localStorage.getItem(SAVES)||'[]');if(!Array.isArray(ar)||ar.length>30)throw new Error();saved=ar.map(s=>({key:s.key,updated:s.updated,state:engine.validateState(s.state)}));}
    catch(e){toast('保存一覧を復元できませんでした。元データは変更していません。');saved=null;}
    if(location.hash.startsWith('#build='))try{state=engine.validateState(decodeShare(location.hash));toast('共有されたビルドを読み込みました');}catch(e){toast('共有ビルドを読み込めません：'+e.message);}
    state.name=state.name==='無名のビルド'?'':state.name;
    function setupControls(){
      $('class-select').innerHTML=data.classes.map(c=>option(c.name_en,CLASSES[c.name_en]||c.name_en)).join('');
      $('stat-fields').innerHTML=EREngine.STATS.map(a=>`<label>${LABEL[a]}<span class="stat-input"><button type="button" data-step="${a}" data-delta="-1" aria-label="${LABEL[a]}を1下げる">−</button><input id="stat-${a}" aria-label="${LABEL[a]}" data-stat="${a}" type="number" min="1" max="99" inputmode="numeric"><button type="button" data-step="${a}" data-delta="1" aria-label="${LABEL[a]}を1上げる">＋</button></span></label>`).join('');
      $('weapon-category').innerHTML=option('','すべて')+Object.entries(CATEGORY).map(([id,n])=>option(id,n)).join('');
      $('weapon-affinity').innerHTML=option('','すべて')+Object.entries(AFFINITY).map(([id,n])=>option(id,n)).join('');
      $('catalyst-select').innerHTML=option('','装備可能な触媒から、成分威力が最大のもの')+compatibleCatalysts.map(v=>option(v.id,weaponName(v))).join('');
      $('enemy-journey').innerHTML=JOURNEYS.map(j=>option(j,j==='NG'?'1周目（NG）':`${JOURNEYS.indexOf(j)+1}周目（${j}）`)).join('');
      $('weapon-slots').innerHTML=Array.from({length:6},(_,i)=>`<div class="equip-card"><label>${i<3?'右手':'左手'} ${i%3+1}<select data-weapon-slot="${i}" aria-label="${i<3?'右手':'左手'}${i%3+1}"></select></label><small id="weapon-slot-note-${i}"></small></div>`).join('');
      $('armor-slots').innerHTML=ARMOR_LABEL.map((n,i)=>`<div class="equip-card"><label>${n}<select data-armor-slot="${i}" aria-label="${n}の防具"></select></label><small id="armor-note-${i}"></small></div>`).join('');
      $('talisman-slots').innerHTML=Array.from({length:4},(_,i)=>`<div class="equip-card"><label>タリスマン ${i+1}<select data-talisman-slot="${i}" aria-label="タリスマン${i+1}"></select></label><small id="talisman-note-${i}"></small></div>`).join('');
      fillWeaponOptions();
      for(const select of document.querySelectorAll('[data-talisman-slot]'))select.innerHTML=option('','装備なし')+sortedTalismans.map(t=>option(t.id,name(t))).join('');
      fillArmorOptions();
      fillAbout();
      renderAshes();
    }
    function syncControls(){
      restoring=true;
      for(const a of EREngine.STATS)$('stat-'+a).value=state.stats[a];
      $('class-select').value=state.className;
      $('upgrade-mode').value=state.settings.upgradeMode;$('upgrade-fields').hidden=state.settings.upgradeMode!=='custom';
      $('weapon-sort').value=state.settings.weaponSort||'total';$('normal-upgrade').value=state.settings.normal;$('somber-upgrade').value=state.settings.somber;$('two-hand').checked=state.settings.twoHand;
      $('scadu-level').value=state.settings.scadu;$('in-shadow').checked=state.settings.inShadow;$('manual-multiplier').value=state.settings.manualMultiplier;$('memory-slots').value=state.settings.memory;
      $('build-name').value=state.name;$('catalyst-select').value=state.catalyst;
      fillWeaponOptions();
      for(const select of document.querySelectorAll('[data-weapon-slot]'))select.value=state.weapons[+select.dataset.weaponSlot];
      for(const select of document.querySelectorAll('[data-talisman-slot]'))select.value=state.talismans[+select.dataset.talismanSlot];
      fillArmorOptions();
      $('enemy-journey').value=C.enemies.get(state.enemy)?.journey||'NG';fillEnemyOptions();
      restoring=false;
    }
    function fillArmorOptions(){
      const q=lower($('armor-search').value);
      for(const select of document.querySelectorAll('[data-armor-slot]')){
        const i=+select.dataset.armorSlot;
        select.innerHTML=option('','装備なし')+sortedArmor.filter(a=>a.slot===ARMOR_SLOT[i]&&(!q||lower(name(a)+' '+a.name_en).includes(q)||a.id===state.armor[i])).map(a=>option(a.id,name(a),a.id===state.armor[i])).join('');
      }
    }
    function fillWeaponOptions(){
      const q=lower($('slot-weapon-search').value);
      for(const select of document.querySelectorAll('[data-weapon-slot]')){
        const i=+select.dataset.weaponSlot;
        select.innerHTML=option('','装備なし')+data.variants.filter(v=>!q||v.id===state.weapons[i]||lower(weaponName(v)+' '+v.name_en).includes(q)).map(v=>option(v.id,weaponName(v),v.id===state.weapons[i])).join('');
      }
    }
    function renderAshes(){
      const q=lower($('ash-search').value),rows=data.ashes.filter(a=>!q||lower(name(a)+' '+a.name_en).includes(q));
      $('ash-results').innerHTML=rows.map(a=>`<article class="item"><h3 class="name">${esc(name(a))}</h3><p class="english">${esc(a.name_en)}</p><p class="field-note">主なカテゴリフラグ：${a.types.map(t=>CATEGORY[t]).filter(Boolean).map(esc).join('・')||'対応表なし'}</p></article>`).join('')||'<p class="empty">一致する戦灰がありません。</p>';
    }
    function jpEnemy(e){
      const map={'Margit, the Fell Omen':'忌み鬼マルギット','Godrick the Grafted':'接ぎ木のゴドリック','Malenia, Blade of Miquella':'ミケラの刃、マレニア','Malenia, Goddess of Rot':'腐敗の女神、マレニア','Starscourge Radahn':'星砕きのラダーン','Promised Consort Radahn':'約束の王ラダーン','Radahn, Consort of Miquella':'ミケラの王ラダーン','Messmer the Impaler':'串刺し公、メスメル','Maliketh, the Black Blade':'黒き剣のマリケス','Elden Beast':'エルデの獣','Radagon of the Golden Order':'黄金律、ラダゴン','Morgott, the Omen King':'忌み王、モーゴット','Mohg, Lord of Blood':'血の君主、モーグ','Rennala, Queen of the Full Moon':'満月の女王、レナラ','Rellana, Twin Moon Knight':'双月の騎士、レラーナ','Bayle the Dread':'暴竜ベール'};
      for(const [en,ja] of Object.entries(map))if(e.name.includes(en))return ja;
      return e.name;
    }
    function fillEnemyOptions(){
      const q=lower($('enemy-search').value),journey=$('enemy-journey').value,selected=C.enemies.get(state.enemy);
      const rows=data.enemies.filter(e=>e.journey===journey&&(!q||lower(e.name+' '+e.location+' '+jpEnemy(e)).includes(q)));
      const visible=rows.slice(0,400);if(selected&&selected.journey===journey&&!visible.some(e=>e.id===selected.id))visible.unshift(selected);
      $('enemy-select').innerHTML=visible.map(e=>option(e.id,`${jpEnemy(e)} · ${e.location}`,e.id===state.enemy)).join('');
      if(!visible.length)$('enemy-select').innerHTML=option('','一致する敵がありません');
      $('enemy-select').dataset.matches=rows.length;
      // Searching only changes options, never silently changes the selected calculation target.
      if(visible.some(e=>e.id===state.enemy))$('enemy-select').value=state.enemy;else $('enemy-select').selectedIndex=-1;
    }
    function missingText(missing){return missing.map(m=>`${LABEL[m.stat]} あと${m.short}`).join(' / ');}
    function typed(attack){return DAMAGE.map((n,i)=>attack[i]>0?`<span>${n} ${number(attack[i],1)}</span>`:'').join('');}
    function badges(v,r){const w=C.weapons.get(v.weapon_id),d=engine.decoded[v.source_regulation_index];return `<div class="badges"><span class="badge ${r.usable?'ok':'bad'}">${r.usable?'装備可能':esc(missingText(r.missing))}</span><span class="badge">${esc(CATEGORY[d.weaponType])}</span><span class="badge">${AFFINITY[v.affinity_id]}</span>${w.dlc?'<span class="badge">DLCフラグ</span>':''}</div>`;}
    function selectedEnemy(){return C.enemies.get(state.enemy);}
    const dpsMode=()=>['dps','dpsEnemy'].includes($('weapon-sort').value);
    function dpsReason(result){
      const labels={requirements:'要求能力不足',no_model:'通常攻撃モデルなし',category_not_in_initial_model:'この武器種は未対応',special_weapon_category_requires_individual_review:'固有モーションの検証待ち',speed_gradient_model_not_verified:'攻撃速度変化の検証待ち',requires_single_melee_window:'多段・攻撃判定の検証待ち',paired_weapon_requires_individual_review:'対武器の検証待ち',final_damage_multiplier_requires_individual_review:'固有倍率の検証待ち',enemy_data:'対象敵の防御データ不足'};
      return labels[result?.reasons?.[0]]||'攻撃周期の検証待ち';
    }
    function getWeaponDps(v,r){return engine.weaponDps(v,derived.stats,{result:r,twoHand:state.settings.twoHand,upgrade:r.upgrade,multiplier:multiplier(),scope:$('weapon-sort').value==='dpsEnemy'?'enemy':'raw',enemy:selectedEnemy()});}
    function weaponScore(r){const sort=$('weapon-sort').value;if(dpsMode())return r.dpsResult?.dps??null;if(sort==='total')return r.total;if(sort==='scaling')return Math.max(0,...Object.values(r.spellScaling));if(sort==='enemy')return engine.hitDamage(r.attack,selectedEnemy(),$('physical-type').value,multiplier())?.total??null;return r.attack[sort]||0;}
    function weaponMetric(){const s=$('weapon-sort').value;return s==='dps'?'理論DPS・未実測':s==='dpsEnemy'?'対敵理論DPS・未実測':s==='total'?'計算AR':s==='scaling'?'触媒補正':s==='enemy'?'推定ダメージ':+s<5?DAMAGE[+s]+'AR':(STATUS[s]||'')+'蓄積';}
    function calculateWeapons(){
      const q=lower($('weapon-search').value),category=$('weapon-category').value,affinity=$('weapon-affinity').value,content=$('weapon-content').value,usable=$('weapon-usable').checked;
      let rows=[];
      for(const v of data.variants){const w=C.weapons.get(v.weapon_id),d=engine.decoded[v.source_regulation_index];
        if(q&&!lower(name(w)+' '+w.name_en+' '+v.name_en).includes(q))continue;
        if(category&&d.weaponType!==+category)continue;if(affinity&&v.affinity_id!==+affinity)continue;if(content==='dlc'&&!w.dlc||content==='base'&&w.dlc)continue;
        const r=engine.weapon(v,derived.stats,{twoHand:state.settings.twoHand,upgrade:engine.getUpgrade(v,state.settings)});if(usable&&!r.usable)continue;
        if(dpsMode())r.dpsResult=getWeaponDps(v,r);
        rows.push({v,w,r,score:weaponScore(r)});
      }
      rows.sort((a,b)=>(b.score??-Infinity)-(a.score??-Infinity)||a.v.id.localeCompare(b.v.id));
      if($('weapon-best').checked){const seen=new Set();rows=rows.filter(x=>{if(seen.has(x.v.weapon_id))return false;seen.add(x.v.weapon_id);return true;});}
      weaponRows=rows;renderWeapons();
    }
    function renderWeapons(){
      const metric=weaponMetric(),isDps=dpsMode();
      $('dps-note').hidden=!isDps;
      $('dps-note').textContent='通常攻撃を連続で当てる場合の理論モデルです（未実測）。FP・スタミナは十分にある前提。出血・冷気の発症、条件付きバフ、回避時間は含みません。未対応は末尾に表示します。';
      $('weapon-count').textContent=`${number(weaponRows.length)}件 · ${statsLabel(derived.stats)} · ${state.settings.twoHand?'両手':'片手'}指定 · ${state.settings.upgradeMode==='max'?'最大強化':`通常+${state.settings.normal} / 喪色+${state.settings.somber}`}${['enemy','dpsEnemy'].includes($('weapon-sort').value)?' · '+jpEnemy(selectedEnemy()):''}`;
      if(isDps)$('weapon-count').textContent+=` · モデル対応 ${weaponRows.filter(x=>x.score!==null).length}/${weaponRows.length}件`;
      $('weapon-results').innerHTML=weaponRows.slice(0,weaponLimit).map(({v,w,r,score},i)=>`<article class="item${state.compare.includes(v.id)?' selected':''}"><div class="rank">${isDps&&score===null?'—':String(i+1).padStart(2,'0')} / ${esc(metric)}</div><div class="item-head"><div><h3 class="name">${esc(name(w))}</h3><p class="english">${esc(v.name_en)}</p></div><div class="score"><strong>${isDps&&score===null?'—':number(score,isDps?1:0)}</strong><small>${isDps?'ダメージ / 秒 · ':''}+${r.upgrade}</small></div></div>${badges(v,r)}${isDps?`<p class="english">${score===null?esc(dpsReason(r.dpsResult)):`${state.settings.twoHand?'両手':'片手'}通常攻撃 ${r.dpsResult.hits.length}段 · 1周 ${number(r.dpsResult.cycleSeconds,2)}秒 · 未実測`}</p>`:''}<div class="typed">${typed(r.attack)}</div><div class="typed">${Object.entries(STATUS).filter(([t])=>r.attack[t]>0).map(([t,n])=>`<span>${n} ${number(r.attack[t])}</span>`).join('')}</div><div class="actions"><button class="small" data-weapon-detail="${esc(v.id)}">詳細</button><button class="small" data-compare="${esc(v.id)}">${state.compare.includes(v.id)?'比較から外す':'比較に追加'}</button><button class="small" data-equip-weapon="${esc(v.id)}">右手1へ</button></div></article>`).join('')||'<p class="empty">一致する装備がありません。検索や「装備可能のみ」の条件を変えてください。</p>';
      $('weapon-more').hidden=weaponLimit>=weaponRows.length;$('compare-count').textContent=state.compare.length;
    }
    function calculateSpells(){
      const q=lower($('spell-search').value),type=$('spell-type').value,usable=$('spell-usable').checked,attackOnly=$('spell-attack').checked,sort=$('spell-sort').value;
      let rows=[];
      const ready=compatibleCatalysts.filter(v=>engine.weapon(v,derived.stats,{upgrade:engine.getUpgrade(v,state.settings)}).usable);
      for(const v of data.spellVariants){const s=C.spells.get(v.spell_id);if(q&&!lower(name(s)+' '+s.name_en+' '+v.name_en).includes(q))continue;if(type&&s.type!==type)continue;
        let cat=state.catalyst,r;
        if(cat)r=engine.spell(v,cat,derived.stats,state.settings);
        else{
          const candidates=ready.filter(c=>s.type==='Sorcery'?c.sorcery_tool:c.incantation_tool);let best=-Infinity;
          for(const c of candidates){const result=engine.spell(v,c.id,derived.stats,state.settings),score=result.total??result.catalyst.spellScaling[1]??0;if(score>best){best=score;r=result;cat=c.id;}}
          if(!r)r=engine.spell(v,'',derived.stats,state.settings);
        }
        if(usable&&!r.usable||attackOnly&&r.total===null)continue;
        const total=r.total===null?null:r.total*multiplier();
        const enemy=r.power?engine.hitDamage(Object.fromEntries(r.power.map((x,i)=>[i,x])),selectedEnemy(),$('physical-type').value,multiplier())?.total:null;
        const score=sort==='efficiency'?total!==null&&r.fp>0?total/r.fp:null:sort==='enemy'?enemy:total;
        rows.push({v,s,r,cat,total,enemy,score});
      }
      rows.sort(sort==='name'?(a,b)=>name(a.s).localeCompare(name(b.s),'ja')||a.v.id.localeCompare(b.v.id):(a,b)=>(b.score??-Infinity)-(a.score??-Infinity)||a.v.id.localeCompare(b.v.id));
      spellRows=rows;renderSpells();
    }
    function renderSpells(){
      const sort=$('spell-sort').value,metric=sort==='efficiency'?'成分威力 / FP':sort==='enemy'?'推定ダメージ':'防御前威力';
      $('spell-count').textContent=`${number(spellRows.length)}派生成分 / ${new Set(spellRows.map(x=>x.s.id)).size}魔法 · 記憶 ${memoryUsed()}/${memoryAvailable()}枠`;
      $('spell-results').innerHTML=spellRows.slice(0,spellLimit).map(({v,s,r,cat,score},i)=>`<article class="item"><div class="rank">${String(i+1).padStart(2,'0')} / ${metric}</div><div class="item-head"><div><h3 class="name">${esc(name(s))}</h3><p class="english">${esc(v.name_en)}</p></div><div class="score"><strong>${number(score,sort==='efficiency'?1:0)}</strong><small>${r.fp>0?`FP ${r.fp}`:'FP要確認'}</small></div></div><div class="badges"><span class="badge">${s.type==='Sorcery'?'魔術':'祈祷'}</span><span class="badge">${s.memory_slots}枠</span><span class="badge ${r.usable?'ok':'bad'}">${r.required.length?esc(missingText(r.required)):!r.correctTool?'対応触媒なし':!r.catalyst?.usable?'触媒の能力不足':'使用可能'}</span></div><p class="english">触媒：${esc(cat?name(C.weapons.get(C.variants.get(cat).weapon_id)):'なし')} ${r.catalyst?'+'+r.catalyst.upgrade:''}</p><div class="typed">${r.power?typed(r.power.map(n=>n*multiplier())):'直接攻撃成分は未計算'}</div><div class="actions"><button class="small" data-spell-detail="${esc(v.id)}">係数・詳細</button><button class="small" data-memorize="${esc(s.id)}">${state.memorized.includes(s.id)?'記憶から外す':'記憶する'}</button></div></article>`).join('')||'<p class="empty">一致する魔法がありません。触媒や能力値、検索条件を変えてください。</p>';
      $('spell-more').hidden=spellLimit>=spellRows.length;
    }
    function refreshSummary(){
      derived=engine.equipment(state);
      const baseClass=data.classes.find(c=>c.name_en===state.className),level=baseClass.level+EREngine.STATS.reduce((s,a)=>s+Math.max(0,state.stats[a]-baseClass.stats[a]),0);
      $('level-chip').textContent='Lv.'+level;
      const below=EREngine.STATS.filter(a=>state.stats[a]<baseClass.stats[a]);
      $('class-warning').textContent=below.length?`素性の初期値未満：${below.map(a=>LABEL[a]).join('・')}。実際に割り振れる能力値に調整してください。`:`装備補正後：${statsLabel(derived.stats)}`;
      $('build-summary').innerHTML=[['HP',derived.hp,''],['FP',derived.fp,''],['スタミナ',derived.stamina,''],['装備重量',number(derived.weight,1),'/ '+number(derived.load,1)]].map(([title,value,unit])=>`<div class="summary-tile"><small>${title}</small><strong>${typeof value==='number'?number(value):esc(value)}</strong><span class="unit">${esc(unit)}</span></div>`).join('');
      $('compare-count').textContent=state.compare.length;
      $('autosave-status').textContent=saveError||'入力はこの端末に保存されます';$('autosave-status').className='status'+(saveError?' error':'');
    }
    function renderEquipment(){
      for(let i=0;i<6;i++){const v=C.variants.get(state.weapons[i]);const r=v?engine.weapon(v,derived.stats,{twoHand:state.settings.twoHand,upgrade:engine.getUpgrade(v,state.settings)}):null;$('weapon-slot-note-'+i).textContent=r?`計算AR ${number(r.total)} · 重量 ${C.weapons.get(v.weapon_id).weight} · ${r.usable?'装備可能':missingText(r.missing)}`:'ランキングの「右手1へ」でも選べます';}
      for(let i=0;i<4;i++){$('armor-note-'+i).textContent=state.armor[i]?`重量 ${C.armor.get(state.armor[i]).weight}`:'';const t=C.talismans.get(state.talismans[i]);const e=t&&data.effects[t.name_en];$('talisman-note-'+i).textContent=t?`重量 ${t.weight} · ${e?.text||'特殊効果は未収録'}`:'';}
      const n=derived;
      $('equipment-summary').innerHTML=`<div class="panel"><div class="row"><h3>装備重量 ${number(n.weight,1)} / ${number(n.load,1)}</h3><span class="badge ${n.ratio<.7?'ok':'bad'}">${number(n.ratio*100,1)}% · ${n.roll}</span></div><div class="progress"><span style="width:${Math.min(100,n.ratio*100)}%"></span></div><p class="muted">軽量 &lt;30% / 中量 &lt;70% / 重量 &lt;100%</p><div class="table-wrap"><table><thead><tr><th>カット率（常時PvE）</th>${DAMAGE.map(x=>`<th>${x}</th>`).join('')}<th>強靭</th></tr></thead><tbody><tr><td>装備合成</td>${n.negation.map(x=>`<td>${number(x,1)}%</td>`).join('')}<td>${number(n.poise)}</td></tr></tbody></table></div><p class="muted">装備補正後：${EREngine.STATS.map(a=>LABEL[a]+' '+n.stats[a]).join(' / ')}</p>${n.effects.length?`<details style="margin-top:12px"><summary>装備の効果説明（${n.effects.length}件）</summary>${n.effects.map(e=>`<p class="english" style="margin:10px 0"><strong>${esc(e.name)}</strong><br>${esc(e.text)}${e.always?'':'<br>条件付き効果は未適用'}</p>`).join('')}</details>`:''}</div>`;
      $('memory-count').textContent=`${memoryUsed()} / ${memoryAvailable()}枠`;
      $('memorized-spells').innerHTML=state.memorized.map(id=>{const s=C.spells.get(id),missing=Object.entries(s.requirements).filter(([a,n])=>derived.stats[a]<n);return `<div class="save-card"><div><strong>${esc(name(s))}</strong><small> ${s.memory_slots}枠 ${missing.length?'· 能力不足':''}</small></div><button class="small" data-memorize="${esc(id)}">外す</button></div>`;}).join('')||'<p class="muted">魔術・祈祷の一覧から「記憶する」で追加できます。</p>';
      if(memoryUsed()>memoryAvailable())$('memory-count').textContent+=' · 枠不足';
      $('class-ranking').innerHTML='<table><thead><tr><th>素性</th><th>必要レベル</th><th>初期値との差</th></tr></thead><tbody>'+engine.minimumClass(state.stats).map(c=>`<tr><td>${esc(CLASSES[c.name]||c.name)}</td><td>${c.level}</td><td>${c.wasted?`初期値超過 ${c.wasted}点`:'余剰なし'}</td></tr>`).join('')+'</tbody></table>';
    }
    function renderEnemy(){
      const e=selectedEnemy();
      if(!e){$('enemy-details').innerHTML='<p class="empty">対象敵を選んでください。</p>';return;}
      $('enemy-details').innerHTML=`<div class="enemy-info"><div class="panel"><p class="eyebrow">${esc(e.journey)} / TARGET</p><h3>${esc(jpEnemy(e))}</h3><p class="english">${esc(e.name)}<br>${esc(e.location)}</p><div class="row" style="margin-top:16px"><span class="chip">HP ${number(e.hp)}</span><span class="badge">強靭 ${number(e.poise.Effective)}</span></div><div class="table-wrap"><table><thead><tr><th>属性</th><th>防御力</th><th>カット率</th></tr></thead><tbody>${DAMAGE.map((n,i)=>`<tr><td>${n}</td><td>${number(e.defense[i])}</td><td>${number(e.negation[i])}%</td></tr>`).join('')}</tbody></table></div><small>検索結果 ${$('enemy-select').dataset.matches||0}件（選択肢は最大400件＋選択中）。対象は検索を変えても維持します。</small></div><div class="panel"><h3>状態異常耐性</h3>${Object.entries(e.status).map(([n,v])=>`<div class="bar-row"><span>${esc({Poison:'毒','Scarlet Rot':'腐敗',Bleed:'出血',Frost:'冷気',Sleep:'睡眠',Madness:'発狂',Deathblight:'死'}[n]||n)}</span><div class="bar"><span style="width:${typeof v==='number'?Math.min(100,v/12):100}%"></span></div><span>${v==='Immune'?'無効':number(v)}</span></div>`).join('')}<p class="field-note">数値は初回の発症閾値。バーは比較用表示。攻撃回数や発症後の耐性上昇は別計算です。</p><div class="divider"></div><p class="muted">適用倍率：${number(multiplier(),2)}倍${state.settings.inShadow?'（影樹の加護込み）':''}</p></div></div>`;
    }
    function renderSaves(){
      $('saved-builds').innerHTML=saved===null?'<p class="notice">保存一覧の形式を確認できません。既存データを保護するため、この一覧への書込みを停止しています。</p>':saved.map(s=>`<div class="save-card"><div><strong>${esc(s.state.name||'無名のビルド')}</strong><p class="english">${statsLabel(s.state.stats)}<br>${esc(new Date(s.updated).toLocaleString('ja-JP'))}</p></div><div class="actions"><button class="small" data-load-save="${esc(s.key)}">読み込む</button><button class="small" data-delete-save="${esc(s.key)}">削除</button></div></div>`).join('')||'<p class="empty">まだ保存したビルドはありません。</p>';
    }
    function fillAbout(){
      $('about-content').innerHTML=`<div class="notice">現在の版：${esc(data.version)}。全パラメータの1.17.1差分と実機ダメージは未検証です。取得日：${esc(data.collected)}。</div><details open><summary>反映する計算</summary><ul><li>武器の派生・強化・属性補正・要求能力不足と両手の筋力補正。</li><li>杖・聖印の属性別補正、魔法の攻撃係数、限定知力／信仰補正。</li><li>選択した防具・タリスマンの常時能力値、HP・FP・スタミナ・重量、基本カット率。</li><li>敵の防御力とカット率を用いた、選んだ成分のPvE推定。</li><li>限定した通常攻撃モデルの連続DPS（理論値・未実測）。1段ずつ防御計算し、最終段から初段への時間も含む。</li><li>影樹の加護と指定した攻撃力倍率。基礎AR順位はこれらを除いて比較。</li></ul></details><details><summary>未反映・未検証</summary><ul><li>系統強化、連撃、HP条件、武器固有の攻撃効果、バフの競合、PvP、カウンター、部位。</li><li>多段・継続の総威力、魔法・戦技DPS、速度変化を含む攻撃・詠唱速度、追加弾、全段命中、状態異常の発症ダメージ。</li><li>敵の追加人数補正・特殊フェーズ・発症後耐性、遺灰の性能ランキング。</li><li>防具の打撃・斬撃・刺突個別カット率は装備合成表示では省略。</li><li>武器8件・防具18件の日本語名が欠落。英語名で表示します。</li><li>DLCフラグは元資料の分類です。現行の入手条件や所有コンテンツを保証しません。</li></ul><p>手動倍率は攻撃力に掛けます。最終ダメージに掛かる効果を代用すると誤差が生じます。未対応効果を自動で反映したとは扱いません。</p></details><details><summary>DPSモデルの範囲</summary><p>通常攻撃86プロファイルに対応。資料の30フレームを1秒として換算したモデルです。実機の入力受付・ヒットストップ・命中回数は未検証。速度変化、固有モーション、多段などは未対応として表示します。魔法・戦技のDPSはまだ計算しません。</p></details><details><summary>照合結果</summary><p>武器3,296派生の基礎値・要求能力値、触媒33件の特定能力値セット、魔法派生495行の係数を資料間で照合。元資料が同じ抽出データに由来する可能性があり、独立した実機検証ではありません。</p><p>防御式は収集したBuild Planner「Damage Calc」N19を参照。各属性・各ヒットに個別適用する推定です。</p></details><details><summary>データ出典・利用表記</summary><div class="source-list">${data.sources.filter(s=>s.id==='weapon-source:public/regulation-vanilla-v1.17.js'||s.id.startsWith('frame:')||s.id.startsWith('localization')||['build-planner','misc-effects','motion-values','pve-enemies','player-stats'].includes(s.id)).map(s=>`<div><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.id)}</a><p class="english">版：${esc(s.version)}<br>SHA-256：${esc(s.sha256)}</p></div>`).join('')}</div><p>公開資料から計算に必要な数値・名称を抽出。元のワークブック一式はこのアプリには含めません。ゲームや公式作品の権利は各権利者に帰属します。</p><pre>${esc(data.mit)}</pre></details><details><summary>保存・共有・オフライン</summary><p>HTML内に計算データを内蔵し、計算時に外部APIへ入力を送りません。Appsの台帳経由で一度開いたアプリは台帳のオフライン保持を利用できます。HTMLをダウンロードして単体でも動作します。データ展開には対応ブラウザが必要です。</p><p>共有リンクはURLの#部分にビルド情報を含みます。保存はこの端末のブラウザ内だけです。JSONの書出しを使うと端末を移れます。別タブの変更を検出した場合は知らせます。</p></details>`;
    }
    function activate(tab){
      activeTab=tab;
      for(const button of document.querySelectorAll('[data-tab]')){const yes=button.dataset.tab===tab;button.setAttribute('aria-selected',String(yes));button.tabIndex=yes?0:-1;}
      for(const panel of document.querySelectorAll('[role=tabpanel]'))panel.hidden=panel.id!=='panel-'+tab;
      renderActive();
    }
    function renderActive(){if(activeTab==='weapons')calculateWeapons();else if(activeTab==='spells')calculateSpells();else if(activeTab==='equipment')renderEquipment();else if(activeTab==='enemies')renderEnemy();else if(activeTab==='saves')renderSaves();}
    function update({save=true,reset=true}={}){if(reset){weaponLimit=40;spellLimit=40;}refreshSummary();renderActive();if(save)persist();}
    function applyState(newState){const checked=engine.validateState(newState);state=checked;syncControls();update();toast('ビルドを読み込みました');}
    function showDialog(title,html){$('dialog-title').innerHTML=title;$('dialog-content').innerHTML=html;if(!$('detail-dialog').open)$('detail-dialog').showModal();}
    function showWeaponDetail(id){
      lastWeaponDetail=id;const v=C.variants.get(id),w=C.weapons.get(v.weapon_id),r=engine.weapon(v,derived.stats,{upgrade:engine.getUpgrade(v,state.settings),twoHand:state.settings.twoHand});
      const moves=movesByWeapon.get(v.weapon_id)||[];
      const skill=data.skills?.[w.default_skill_id];
      const gains=EREngine.ATTRS.map(a=>{if(derived.stats[a]>=99)return {a,n:null};const stats={...derived.stats,[a]:derived.stats[a]+1};return {a,n:engine.weapon(v,stats,{upgrade:r.upgrade,twoHand:state.settings.twoHand}).total-r.total};});
      showDialog(`<h2>${esc(name(w))}</h2><p class="english">${esc(v.name_en)}</p>`,`${badges(v,r)}<div class="dialog-grid"><div class="panel"><small>計算AR / +${r.upgrade}</small><h2 style="color:var(--gold)">${number(r.total,1)}</h2><div class="typed">${typed(r.attack)}</div><p class="muted">重量 ${w.weight} / ${state.settings.twoHand?'両手':'片手'}指定</p><p class="english">要求：${Object.entries(v.requirements).map(([a,n])=>LABEL[a]+' '+n).join(' / ')||'なし'}</p></div><div class="panel"><h3>能力値 +1 のAR増分</h3>${gains.map(g=>`<div class="row"><span>${LABEL[g.a]}</span><strong class="increment">${g.n===null?'上限':(g.n>=0?'+':'')+number(g.n,2)}</strong></div>`).join('')}<small>装備補正後の能力値を1増やした比較。</small></div></div><div class="table-wrap"><table><thead><tr><th>攻撃属性</th><th>AR / 蓄積</th><th>触媒補正</th></tr></thead><tbody>${Array.from({length:12},(_,t)=>r.attack[t]||r.spellScaling[t]?`<tr><td>${DAMAGE[t]||STATUS[t]}</td><td>${number(r.attack[t]||0,2)}</td><td>${r.spellScaling[t]?number(r.spellScaling[t],2):'—'}</td></tr>`:'').join('')}</tbody></table></div><h3 style="margin-top:16px">対象敵と攻撃パターン</h3><p class="english">${esc(jpEnemy(selectedEnemy()))} / ${esc(selectedEnemy().journey)}</p><label>攻撃成分<select id="detail-move">${option('standard','標準比較：MV100%・選択中の物理属性')}${moves.map(m=>option(m.id,`${m.name} · MV ${m.raw}`)).join('')}</select></label><div id="detail-damage" style="margin-top:12px"></div><div class="notice">各ヒットを別々に防御計算します。条件付きMV、複合する物理属性、追加弾・固有効果は未計算です。</div>${data.effects[w.name_en]?`<p class="english">装備の効果説明：${esc(data.effects[w.name_en].text)}（攻撃効果は未反映）</p>`:''}<div class="actions"><button data-equip-weapon="${esc(id)}" class="primary">右手1に装備</button><button data-compare="${esc(id)}">比較候補を切り替える</button></div>`);
      renderDetailDamage();
      renderDpsDetail(v,r);
      $('dialog-content').insertAdjacentHTML('beforeend',`<section id="detail-curves"><h3 style="margin-top:20px">能力値別ダメージ推移</h3><p class="field-note">他の能力値・派生・強化・敵・攻撃成分を固定し、装備補正後の能力値だけを変更。5能力を同じグラフに重ねて表示。破線は要求能力不足。</p><label>横軸の範囲<select id="curve-range">${option('99','1〜99（ゲーム内）')}${option('148','1〜148（100以上は仮想）')}</select></label><div id="curve-charts"></div></section>`);
      renderWeaponCurves();
      $('dialog-content').insertAdjacentHTML('afterbegin',`<p class="muted" style="margin-bottom:10px">既定戦技：${esc(skill?name(skill):'資料なし')} · 戦灰変更 ${w.allow_ash_of_war===true?'可能':w.allow_ash_of_war===false?'不可':'未確認'} · 武器付与 ${w.is_buffable===true?'可能（派生条件は別）':w.is_buffable===false?'不可':'未確認'}</p>`);
    }
    function renderDpsDetail(v,r){
      const result=getWeaponDps(v,r),scope=$('weapon-sort').value==='dpsEnemy'?'対敵':'防御前';
      const content=result.dps===null?`<p class="notice">${esc(dpsReason(result))}。この条件のDPSは未計算です。</p>`:`<div class="notice">${scope}の理論モデル・未実測。通常攻撃 ${result.hits.length}段を1周 ${number(result.cycleSeconds,2)}秒で繰り返す仮定。FP・スタミナ、状態異常の発症・条件付きバフ・ヒットストップは含みません。</div><span class="chip">${number(result.dps,1)} ダメージ / 秒</span><p class="english">1周合計 ${number(result.cycleDamage,1)}ダメージ · 攻撃力倍率 ${number(multiplier(),2)}倍</p><div class="table-wrap"><table><thead><tr><th>段</th><th>発生（秒）</th><th>${scope}ダメージ</th></tr></thead><tbody>${result.hits.map(h=>`<tr><td>${h.index}</td><td>${number(h.time,3)}</td><td>${number(h.damage,1)}</td></tr>`).join('')}</tbody></table></div>`;
      $('dialog-content').insertAdjacentHTML('beforeend',`<section id="detail-dps"><h3 style="margin-top:16px">連続DPS（理論・未実測）</h3>${content}</section>`);
    }
    function renderDetailDamage(){
      const v=C.variants.get(lastWeaponDetail),r=engine.weapon(v,derived.stats,{upgrade:engine.getUpgrade(v,state.settings),twoHand:state.settings.twoHand}),id=$('detail-move').value,m=(movesByWeapon.get(v.weapon_id)||[]).find(x=>x.id===id);
      const physicalMap={Standard:'Phys',Strike:'Strike',Slash:'Slash',Pierce:'Pierce'};
      const physical=m?physicalMap[m.physical]:$('physical-type').value,hits=m?m.hits:[100];
      if(!hits||!physical){$('detail-damage').innerHTML='<p class="notice">この攻撃は条件付き、または複合属性のため自動計算しません。</p>';return;}
      const results=hits.map(mv=>engine.hitDamage(Object.fromEntries(Object.entries(r.attack).map(([t,n])=>[t,n*mv/100])),selectedEnemy(),physical,multiplier()));
      if(results.some(x=>!x)){ $('detail-damage').textContent='対象敵の値が不足しています';return;}
      $('detail-damage').innerHTML=`<span class="chip">推定 ${number(results.reduce((s,x)=>s+x.total,0),1)}ダメージ / ${hits.length}ヒット</span><p class="english">${results.map((x,i)=>`${i+1}段目 ${number(x.total,1)}`).join(' + ')}${m?` · スタミナ ${esc(m.stamina)} · PvE強靭削り ${esc(m.poise)}`:''}</p>`;
    }
    function weaponCurvePoints(attribute,max=99){
      const v=C.variants.get(lastWeaponDetail),move=(movesByWeapon.get(v.weapon_id)||[]).find(m=>m.id===$('detail-move').value);
      const physical=move?({Standard:'Phys',Strike:'Strike',Slash:'Slash',Pierce:'Pierce'})[move.physical]:$('physical-type').value;
      const hits=move?move.hits:[100];
      if(!physical||!hits)return [];
      return Array.from({length:max},(_,i)=>{
        const value=i+1,r=engine.weapon(v,{...derived.stats,[attribute]:value},{upgrade:engine.getUpgrade(v,state.settings),twoHand:state.settings.twoHand});
        const results=hits.map(mv=>engine.hitDamage(Object.fromEntries(Object.entries(r.attack).map(([t,n])=>[t,n*mv/100])),selectedEnemy(),physical,multiplier()));
        return {value,damage:results.some(x=>!x)?null:results.reduce((sum,x)=>sum+x.total,0),usable:r.usable};
      });
    }
    function renderWeaponCurves(){
      if(!$('curve-charts'))return;
      const max=Number($('curve-range').value),series=EREngine.ATTRS.map(a=>({a,points:weaponCurvePoints(a,max)}));
      if(series.some(s=>s.points.some(p=>p.damage===null))||!series[0].points.length){$('curve-charts').innerHTML='<p class="notice">この攻撃成分は推移を計算できません。</p>';return;}
      const top=Math.max(1,...series.flatMap(s=>s.points.map(p=>p.damage)))*1.05;
      const x=n=>48+(n-1)/(max-1)*494,y=n=>194-n/top*170;
      const colors={str:'#efa477',dex:'#83cfac',int:'#91bffc',fai:'#eed77b',arc:'#d6a1ed'};
      const lines=series.map(({a,points})=>{
        const paths=[];
        for(let i=1;i<points.length;i++){const p=points[i-1],q=points[i];paths.push(`<path d="M${x(p.value).toFixed(2)},${y(p.damage).toFixed(2)} L${x(q.value).toFixed(2)},${y(q.damage).toFixed(2)}"${!p.usable||!q.usable?' stroke-dasharray="3 3"':''}/>`);}
        const current=derived.stats[a],base=points[current-1];
        return `<g data-curve-series="${a}" stroke="${colors[a]}" fill="none" stroke-width="2"><title>${LABEL[a]}：現在 ${current}、推定 ${number(base.damage,1)}</title>${paths.join('')}<circle cx="${x(current)}" cy="${y(base.damage)}" r="4" fill="${colors[a]}" stroke="#172019"/></g>`;
      }).join('');
      const legend=series.map(({a})=>`<label class="check" style="color:${colors[a]}"><input type="checkbox" checked data-curve-visible="${a}"><span aria-hidden="true" style="display:inline-block;width:22px;border-top:3px solid ${colors[a]}"></span>${LABEL[a]}</label>`).join('');
      const controls=series.map(({a,points})=>{
        const current=derived.stats[a],base=points[current-1],next=points[current];
        return `<div data-curve="${a}" style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px"><h3 style="color:${colors[a]}">${LABEL[a]}</h3><p class="english">現在 ${current}：${number(base.damage,1)} ／ +1：${next?number(next.damage-base.damage,2):'ゲーム内上限'}${base.usable?'':' ／ 要求能力不足'}</p><label>値を確認<input type="range" min="1" max="${max}" value="${current}" data-curve-probe="${a}"></label><output data-curve-output="${a}" class="english"></output></div>`;
      }).join('');
      $('curve-charts').innerHTML=(max>99?'<p class="notice">100〜148はゲーム内で割り振れない仮想値。収録補正曲線の範囲内で計算し、両手筋力は実効148で上限処理します。</p>':'')+`<article class="panel curve-panel" style="margin-top:12px;padding:12px"><div class="row" aria-label="能力値の凡例">${legend}</div><p class="field-note">凡例のチェックで系列の表示を切り替え。丸印は各能力の現在値。破線は要求能力不足。系列が重なる場合は表示を切り替えて確認できます。</p><svg id="attribute-curve-chart" viewBox="0 0 560 245" role="img" aria-label="5能力の推定ダメージ推移" style="display:block;width:100%;height:auto"><title>筋力・技量・知力・信仰・神秘の推定ダメージを同じ座標で比較</title><text x="48" y="15" fill="#adb5a6" font-size="11">推定ダメージ</text>${[0,.5,1].map(f=>`<line x1="48" y1="${y(top*f)}" x2="542" y2="${y(top*f)}" stroke="#364235"/><text x="42" y="${y(top*f)+4}" text-anchor="end" fill="#adb5a6" font-size="11">${Math.round(top*f)}</text>`).join('')}${max>99?`<rect x="${x(99)}" y="24" width="${542-x(99)}" height="170" fill="#9bbbd3" opacity=".07"/><text x="${(x(99)+542)/2}" y="38" text-anchor="middle" fill="#adb5a6" font-size="11">仮想範囲</text>`:''}${lines}${[1,20,40,60,80,99,...(max>99?[120,148]:[])].map(n=>`<text x="${x(n)}" y="211" text-anchor="middle" fill="#adb5a6" font-size="11">${n}</text>`).join('')}<text x="290" y="233" text-anchor="middle" fill="#adb5a6" font-size="11">装備補正後の能力値</text></svg>${controls}</article>`;
      document.querySelectorAll('[data-curve-probe]').forEach(el=>updateCurveProbe(el));
    }
    function updateCurveProbe(el){
      const points=weaponCurvePoints(el.dataset.curveProbe,Number($('curve-range').value)),point=points[Number(el.value)-1],base=points[derived.stats[el.dataset.curveProbe]-1];
      document.querySelector(`[data-curve-output="${el.dataset.curveProbe}"]`).textContent=`${point.value}：${number(point.damage,1)}ダメージ ／ 現在との差 ${number(point.damage-base.damage,1)}${point.usable?'':' ／ 要求能力不足'}${point.value>99?' ／ 仮想値':''}`;
    }
    document.addEventListener('input',event=>{if(event.target.dataset.curveProbe)updateCurveProbe(event.target);});
    document.addEventListener('change',event=>{const a=event.target.dataset.curveVisible;if(a){const group=document.querySelector(`[data-curve-series="${a}"]`);if(group)group.style.display=event.target.checked?'':'none';}});
    function showSpellDetail(id){
      const v=C.spellVariants.get(id),s=C.spells.get(v.spell_id),row=spellRows.find(x=>x.v.id===id),r=row?.r;
      showDialog(`<h2>${esc(name(s))}</h2><p class="english">${esc(v.name_en)}</p>`,`<p class="muted">要求：${Object.entries(s.requirements).map(([a,n])=>LABEL[a]+' '+n).join(' / ')} · ${s.memory_slots}記憶枠</p><div class="table-wrap"><table><thead><tr><th>属性</th><th>元係数</th><th>防御前威力</th></tr></thead><tbody>${EREngine.TYPES.map((t,i)=>`<tr><td>${DAMAGE[i]}</td><td>${number(v.typed_attack_coefficient[t],2)}</td><td>${r?.power?number(r.power[i]*multiplier(),2):'未計算'}</td></tr>`).join('')}</tbody></table></div><p class="muted">FP ${esc(v.fp)} / 溜めFP欄 ${esc(v.charged_fp)} / スタミナ ${esc(v.stamina)}</p><p class="muted">${v.no_scale?'固定係数・補正なし':v.only_int?'知力のみの触媒補正':v.only_faith?'信仰のみの触媒補正':'属性別の触媒補正を使用'}</p><p class="english">攻撃ID：${esc(v.attack_id??'直接攻撃参照なし')}<br>選択触媒：${esc(row?.cat?weaponName(C.variants.get(row.cat)):'なし')}</p><div class="notice">元係数が0・空欄でも、補助効果や回復がないとは限りません。成分ごとの表であり、詠唱1回の全ヒットを表すものではありません。</div><h3>同じ魔法の派生成分</h3><div class="table-wrap"><table><thead><tr><th>元資料の成分名</th><th>FP</th></tr></thead><tbody>${s.variant_ids.map(vid=>{const x=C.spellVariants.get(vid);return `<tr><td>${esc(x.name_en)}</td><td>${esc(x.fp)}</td></tr>`;}).join('')}</tbody></table></div><button data-memorize="${esc(s.id)}" class="primary">記憶を切り替える</button>`);
    }
    function showCompare(){
      const rows=state.compare.map(id=>{const v=C.variants.get(id);return {v,r:engine.weapon(v,derived.stats,{twoHand:state.settings.twoHand,upgrade:engine.getUpgrade(v,state.settings)})};});
      showDialog('<h2>比較候補</h2><p class="english">同じ能力値・強化設定で最大6派生</p>',rows.length?`<div class="table-wrap compare-table"><table><thead><tr><th>装備</th><th>AR</th>${DAMAGE.map(n=>`<th>${n}</th>`).join('')}<th>重量</th><th>条件</th><th></th></tr></thead><tbody>${rows.map(({v,r})=>`<tr><td>${esc(weaponName(v))}<br>+${r.upgrade}</td><td>${number(r.total,1)}</td>${Array.from({length:5},(_,i)=>`<td>${number(r.attack[i]||0,1)}</td>`).join('')}<td>${C.weapons.get(v.weapon_id).weight}</td><td>${r.usable?'装備可能':esc(missingText(r.missing))}</td><td><button data-compare="${esc(v.id)}">外す</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">武器一覧の「比較に追加」で候補を残してください。</p>');
      lastWeaponDetail='';
    }
    function toggleCompare(id){if(state.compare.includes(id))state.compare=state.compare.filter(x=>x!==id);else if(state.compare.length>=6){toast('比較候補は6件までです');return;}else state.compare.push(id);update({reset:false});if($('detail-dialog').open&&!lastWeaponDetail)showCompare();}
    function toggleMemory(id){if(state.memorized.includes(id))state.memorized=state.memorized.filter(x=>x!==id);else {const slots=C.spells.get(id).memory_slots;if(memoryUsed()+slots>memoryAvailable()){toast('記憶枠が足りません。装備構成で枠数を設定してください。');return;}state.memorized.push(id);}update({reset:false});toast('記憶魔法を更新しました');}
    function serialize(){return JSON.stringify({...state,name:$('build-name').value.slice(0,80)});}
    function download(){const blob=new Blob([serialize()],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='elden-ring-build.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('ビルドJSONを書き出しました');}
    async function share(){
      const bytes=new TextEncoder().encode(serialize());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
      const code=btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      const base=location.protocol==='file:'?'https://matsu1325.github.io/App/apps/elden-ring-build-helper.html':location.href.split('#')[0];
      const link=base+'#build='+code;
      try{await navigator.clipboard.writeText(link);toast('共有リンクをコピーしました');}catch{$('share-input').value=link;$('share-input').focus();$('share-input').select();toast('共有リンクを欄に表示しました。選択してコピーしてください。');}
    }
    function writeSaves(next){try{localStorage.setItem(SAVES,JSON.stringify(next));saved=next;$('save-status').textContent='保存しました';$('save-status').className='status';renderSaves();return true;}catch(e){$('save-status').textContent='保存に失敗しました。JSONを書き出して控えを残してください。';$('save-status').className='status error';return false;}}
    function saveBuild(){
      if(saved===null){toast('保存一覧の復元エラーを解消してください');return;}
      state.name=$('build-name').value.trim().slice(0,80)||'無名のビルド';
      const existing=saved.find(s=>s.state.name===state.name),record={key:existing?.key||crypto.randomUUID(),updated:new Date().toISOString(),state:structuredClone(state)};
      if(existing&&!confirm('同じ名前のビルドを上書きしますか？'))return;
      if(saved.length>=30&&!existing){toast('保存は30件までです。不要なビルドを削除してください。');return;}
      if(writeSaves([record,...saved.filter(s=>s.key!==record.key)])){persist();toast('ビルドを保存しました');}
    }
    let inputTimer;
    document.addEventListener('input',event=>{
      const el=event.target;
      if(el.dataset.stat){const n=Number(el.value);if(el.value===''||!Number.isInteger(n)||n<1||n>99){el.setCustomValidity('1〜99の整数を入力してください');return;}el.setCustomValidity('');state.stats[el.dataset.stat]=n;clearTimeout(inputTimer);inputTimer=setTimeout(()=>update(),130);}
      if(['weapon-search','spell-search','enemy-search','armor-search','slot-weapon-search'].includes(el.id)){clearTimeout(inputTimer);inputTimer=setTimeout(()=>{if(el.id==='enemy-search'){fillEnemyOptions();renderEnemy();}else if(el.id==='armor-search')fillArmorOptions();else if(el.id==='slot-weapon-search')fillWeaponOptions();else update({save:false});},130);}
      if(el.id==='build-name'){state.name=el.value.slice(0,80);persist();}
      if(el.id==='ash-search')renderAshes();
    });
    document.addEventListener('change',event=>{
      const el=event.target;if(restoring)return;
      if(el.id==='weapon-sort'){state.settings.weaponSort=el.value;update();return;}
      if(el.dataset.stat){const n=Number(el.value);if(!el.value||!Number.isInteger(n)||n<1||n>99){el.value=state.stats[el.dataset.stat];el.setCustomValidity('');toast('能力値は1〜99の整数で入力してください');}else if(state.stats[el.dataset.stat]!==n){state.stats[el.dataset.stat]=n;update();}return;}
      const settings={'normal-upgrade':['normal',0,25],'somber-upgrade':['somber',0,10],'scadu-level':['scadu',0,20],'memory-slots':['memory',2,12],'manual-multiplier':['manualMultiplier',.1,5]};
      if(settings[el.id]){const [key,min,max]=settings[el.id];const n=Number(el.value);if(!el.value||!Number.isFinite(n)||(key!=='manualMultiplier'&&!Number.isInteger(n))||n<min||n>max){el.value=state.settings[key];toast(`値は${min}〜${max}で入力してください`);return;}state.settings[key]=n;update();return;}
      if(el.id==='class-select'){state.className=el.value;update();return;}
      if(el.id==='upgrade-mode'){state.settings.upgradeMode=el.value;$('upgrade-fields').hidden=el.value!=='custom';update();return;}
      if(el.id==='two-hand'||el.id==='in-shadow'){state.settings[el.id==='two-hand'?'twoHand':'inShadow']=el.checked;update();return;}
      if(el.id==='catalyst-select'){state.catalyst=el.value;update();return;}
      if(el.dataset.weaponSlot){state.weapons[+el.dataset.weaponSlot]=el.value;update();return;}
      if(el.dataset.armorSlot){state.armor[+el.dataset.armorSlot]=el.value;update();return;}
      if(el.dataset.talismanSlot){const i=+el.dataset.talismanSlot,item=C.talismans.get(el.value);if(item&&state.talismans.some((id,j)=>j!==i&&C.talismans.get(id)?.group===item.group)){el.value=state.talismans[i];toast('同じ系統のタリスマンは同時に装備できません');return;}state.talismans[i]=el.value;update();return;}
      if(el.id==='enemy-journey'){const old=selectedEnemy(),journey=el.value;const next=data.enemies.find(e=>e.journey===journey&&e.name===old.name&&e.location===old.location)||data.enemies.find(e=>e.journey===journey);state.enemy=next.id;fillEnemyOptions();update();return;}
      if(el.id==='enemy-select'&&el.value){state.enemy=el.value;update();return;}
      if(el.id==='detail-move'){renderDetailDamage();renderWeaponCurves();return;}
      if(el.id==='curve-range'){renderWeaponCurves();return;}
      if(el.id==='import-build'){const file=el.files?.[0];if(!file)return;if(file.size>1000000){toast('ビルドJSONは1MB以内にしてください');el.value='';return;}file.text().then(text=>applyState(JSON.parse(text))).catch(e=>toast('読み込めません：'+e.message)).finally(()=>el.value='');return;}
      // Search input blur must not replace a card between pointerdown and click.
      if((el.id.startsWith('weapon-')||el.id.startsWith('spell-')||el.id==='physical-type')&&(el.tagName==='SELECT'||el.type==='checkbox'))update({save:false});
    });
    document.addEventListener('click',event=>{
      const el=event.target.closest('button,a');if(!el)return;
      if(el.dataset.tab){activate(el.dataset.tab);return;}
      if(el.dataset.step){const a=el.dataset.step;state.stats[a]=EREngine.clamp(state.stats[a]+Number(el.dataset.delta),1,99);$('stat-'+a).value=state.stats[a];update();return;}
      if(el.dataset.weaponDetail){showWeaponDetail(el.dataset.weaponDetail);return;}
      if(el.dataset.spellDetail){lastWeaponDetail='';showSpellDetail(el.dataset.spellDetail);return;}
      if(el.dataset.compare){toggleCompare(el.dataset.compare);return;}
      if(el.dataset.equipWeapon){state.weapons[0]=el.dataset.equipWeapon;syncControls();update({reset:false});toast('右手1に装備しました');return;}
      if(el.dataset.memorize){toggleMemory(el.dataset.memorize);return;}
      if(el.dataset.loadSave){const record=saved?.find(s=>s.key===el.dataset.loadSave);if(record)applyState(record.state);return;}
      if(el.dataset.deleteSave){if(confirm('この保存ビルドを削除しますか？'))writeSaves(saved.filter(s=>s.key!==el.dataset.deleteSave));return;}
      switch(el.id){
        case 'apply-class':if(confirm('現在の能力値を素性の初期値に戻しますか？')){state.stats={...data.classes.find(c=>c.name_en===state.className).stats};syncControls();update();}break;
        case 'weapon-more':weaponLimit+=40;renderWeapons();break;
        case 'spell-more':spellLimit+=40;renderSpells();break;
        case 'show-compare':showCompare();break;
        case 'close-dialog':$('detail-dialog').close();lastWeaponDetail='';break;
        case 'scope-link':event.preventDefault();activate('about');break;
        case 'rank-for-enemy':state.settings.weaponSort='enemy';$('weapon-sort').value='enemy';activate('weapons');persist();break;
        case 'save-build':saveBuild();break;
        case 'share-build':share();break;
        case 'export-build':download();break;
        case 'import-link':try{applyState(decodeShare($('share-input').value.trim()));}catch(e){toast('読み込めません：'+e.message);}break;
        case 'delete-saves':if(confirm('このアプリの保存ビルドをすべて削除しますか？'))writeSaves([]);break;
        case 'reload-stored':try{const next=engine.validateState(JSON.parse(localStorage.getItem(KEY)));storageConflict=false;$('conflict-actions').hidden=true;applyState(next);}catch(e){toast('保存内容を読み込めません：'+e.message);}break;
        case 'keep-current':if(confirm('別タブの内容を、このタブのビルドで上書きしますか？')){storageConflict=false;$('conflict-actions').hidden=true;persist();}break;
      }
    });
    document.querySelector('.tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=[...document.querySelectorAll('[data-tab]')],i=tabs.findIndex(t=>t.dataset.tab===activeTab),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;event.preventDefault();activate(tabs[next].dataset.tab);tabs[next].focus();});
    window.addEventListener('storage',event=>{if(event.key===KEY){storageConflict=true;saveError='別タブでビルドが変更されました。自動保存を停止しています。';$('autosave-status').textContent=saveError;$('autosave-status').className='status error';$('conflict-actions').hidden=false;toast('別タブで保存内容が変わりました');}else if(event.key===SAVES){try{const ar=JSON.parse(event.newValue||'[]');if(!Array.isArray(ar)||ar.length>30)throw new Error();saved=ar.map(s=>({key:s.key,updated:s.updated,state:engine.validateState(s.state)}));if(activeTab==='saves')renderSaves();toast('別タブの保存一覧を反映しました');}catch(e){saved=null;toast('別タブの保存一覧を確認できません');}}});
    setupControls();syncControls();refreshSummary();renderActive();
    if(matchMedia('(max-width:720px)').matches){$('build-controls').open=false;$('weapon-advanced').open=false;$('weapon-assumptions').open=false;}
    $('loading').hidden=true;$('application').hidden=false;
    // Read-only snapshot plus validated import are also useful to integration tests.
    window.ERApp={engine,getState:()=>structuredClone(state),importBuild:applyState,weaponCurvePoints};
    document.dispatchEvent(new Event('er-ready'));
  } catch(error) {
    $('loading').textContent='起動できませんでした：'+error.message;
    $('loading').style.color='var(--bad)';console.error(error);
  }
})();
