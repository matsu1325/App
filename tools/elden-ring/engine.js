/* Elden Ring calculation engine. Ported regulation decoding and weapon scaling
 * from ThomasJClark/elden-ring-weapon-calculator (MIT; full notice in the app).
 * Estimates deliberately exclude action-dependent equipment effects.
 */
(function (root) {
  'use strict';
  const ATTRS=['str','dex','int','fai','arc'], STATS=['vig','mnd','end',...ATTRS];
  const TYPES=['physical','magic','fire','lightning','holy'];
  const ADD=['addLifeForceStatus','addWillpowerStatus','addEndureStatus','addStrengthStatus','addDexterityStatus','addMagicStatus','addFaithStatus','addLuckStatus'];
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const finite=(n)=>typeof n==='number'&&Number.isFinite(n);
  function graph(stages,n) {
    for(let i=1;i<stages.length;i++) {
      const a=stages[i-1],b=stages[i];
      if(n<=b.maxVal||i===stages.length-1) {
        let r=clamp((n-a.maxVal)/(b.maxVal-a.maxVal),0,1);
        if(a.adjPt>0)r=r**a.adjPt;else if(a.adjPt<0)r=1-(1-r)**-a.adjPt;
        return a.maxGrowVal+(b.maxGrowVal-a.maxGrowVal)*r;
      }
    }
    throw new Error('Invalid scaling graph');
  }
  function create(data,dpsData={models:{},blocked:{}}) {
    const reg=data.regulation;
    const byId=(rows)=>new Map(rows.map(x=>[x.id,x]));
    const catalogs={weapons:byId(data.weapons),variants:byId(data.variants),spells:byId(data.spells),spellVariants:byId(data.spellVariants),armor:byId(data.armor),talismans:byId(data.talismans),enemies:byId(data.enemies)};
    const curves={};for(const [id,stages] of Object.entries(reg.calcCorrectGraphs))curves[id]=Array.from({length:149},(_,n)=>graph(stages,Math.max(1,n)));
    const decoded=reg.weapons.map(w=>{
      const rp=reg.reinforceTypes[w.reinforceTypeId];
      const baseScaling=Object.fromEntries(w.attributeScaling);
      const gates={...reg.attackElementCorrects[w.attackElementCorrectId],5:{arc:true},7:{arc:true},9:{arc:true},10:{arc:true},6:{},8:{},11:{}};
      const attack=rp.map(r=>{
        const a={};for(const [t,v] of w.attack)a[t]=v*(r.attack[t]??0);
        for(const [i,id] of (w.statusSpEffectParamIds||[]).entries())if(id)Object.assign(a,reg.statusSpEffectParams[id+(r['statusSpEffectId'+(i+1)]??0)]);
        return a;
      });
      const scaling=rp.map(r=>Object.fromEntries(w.attributeScaling.map(([a,v])=>[a,v*r.attributeScaling[a]])));
      return {...w,attack,scaling,gates,baseScaling,maxUpgrade:rp.length-1};
    });
    function getUpgrade(v,settings) {
      const w=decoded[v.source_regulation_index];
      if(settings.upgradeMode==='max')return w.maxUpgrade;
      return Math.min(w.maxUpgrade,w.maxUpgrade===10?settings.somber:settings.normal);
    }
    function weapon(vOrId,stats,options={}) {
      const v=typeof vOrId==='string'?catalogs.variants.get(vOrId):vOrId;
      if(!v)throw new Error('Unknown weapon variant');
      const w=decoded[v.source_regulation_index],upgrade=clamp(options.upgrade??w.maxUpgrade,0,w.maxUpgrade);
      const adjusted={...stats};
      if((options.twoHand&&!w.paired)||[50,51,53,56].includes(w.weaponType))adjusted.str=Math.floor(stats.str*1.5);
      const missing=Object.entries(w.requirements).filter(([a,n])=>adjusted[a]<n).map(([a,n])=>({stat:a,need:n,have:adjusted[a],short:n-adjusted[a]}));
      const attack={},spellScaling={};
      for(let t=0;t<12;t++) {
        const base=w.attack[upgrade][t]??0;
        if(!base&&!w.sorceryTool&&!w.incantationTool)continue;
        const gate=w.gates[t]||{};let mult=1;
        if(!options.ignoreRequirements&&missing.some(m=>gate[m.stat]))mult=0.6;
        else for(const a of ATTRS)if(gate[a]&&(!options.onlyAttribute||options.onlyAttribute===a)) {
          let scaling=w.scaling[upgrade][a]??0;
          if(gate[a]!==true)scaling=gate[a]*scaling/(w.baseScaling[a]||1);
          const n=(t<5?adjusted:stats)[a];
          if(scaling)mult+=curves[w.calcCorrectGraphIds?.[t]??(t<5?0:6)][clamp(n,1,148)]*scaling;
        }
        if(base)attack[t]=base*mult;
        if(t<5&&(w.sorceryTool||w.incantationTool))spellScaling[t]=100*mult;
      }
      return {id:v.id,attack,spellScaling,missing,usable:missing.length===0,upgrade,maxUpgrade:w.maxUpgrade,total:[0,1,2,3,4].reduce((s,t)=>s+(attack[t]||0),0),effectiveStats:adjusted};
    }
    // Nymic_Razor defense formula preserved in the collected Planner Damage Calc N19.
    function defenseDamage(attack,defense,negation) {
      if(![attack,defense,negation].every(finite)||attack<0||defense<0)return null;
      if(attack===0)return 0;
      if(defense===0)return attack*0.9*(1-negation/100);
      const r=attack/defense;let f;
      if(r>=8)f=0.9;
      else if(r>2.5)f=1-(((r-8)**2*(20/30.25)+10)/100);
      else if(r>=1)f=1-(((r-2.5)**2*(30/2.25)+30)/100);
      else if(r>0.12)f=1-(((r-0.12)**2*(-30/0.7744)+90)/100);
      else f=0.1;
      return attack*f*(1-negation/100);
    }
    function hitDamage(attack,enemy,physical='Phys',multiplier=1) {
      if(!enemy||!enemy.physical||!enemy.defense||!enemy.negation)return null;
      const out=[];
      for(let t=0;t<5;t++) {
        const dn=t===0?(enemy.physical[physical]||enemy.physical.Phys):[enemy.defense[t],enemy.negation[t]];
        out[t]=defenseDamage((attack[t]||0)*multiplier,dn?.[0],dn?.[1]);
      }
      return out.some(x=>x===null)?null:{typed:out,total:out.reduce((s,v)=>s+v,0)};
    }
    function weaponDps(vOrId,stats,options={}) {
      const v=typeof vOrId==='string'?catalogs.variants.get(vOrId):vOrId;
      if(!v)throw new Error('Unknown weapon variant');
      const r=options.result||weapon(v,stats,options);
      const base={status:'unsupported',dps:null,cycleSeconds:null,cycleDamage:null,hits:[],reasons:[],verification:'model-only',rankingEligible:false};
      if(!r.usable)return {...base,status:'unusable',reasons:['requirements']};
      const id=v.weapon_id+':'+(options.twoHand?'2h-r1':'1h-r1'),model=dpsData.models[id];
      if(!model)return {...base,reasons:dpsData.blocked[id]||['no_model']};
      const multiplier=options.multiplier??1;
      if(!finite(multiplier)||multiplier<=0)return {...base,status:'error',reasons:['invalid_multiplier']};
      const hits=model.hits.map((hit,i)=>{
        const attack=hit.mv.map((mv,t)=>(r.attack[t]||0)*mv/100);
        let damage;
        if(options.scope==='enemy') {
          const e=options.enemy;
          if(!e?.physical?.[hit.physical])return null;
          damage=hitDamage(attack,e,hit.physical,multiplier)?.total;
        }else damage=attack.reduce((s,n)=>s+n,0)*multiplier;
        return finite(damage)&&damage>=0?{index:i+1,time:hit.time,damage,physical:hit.physical,mv:hit.mv}:null;
      });
      if(hits.some(x=>!x))return {...base,reasons:['enemy_data']};
      const cycleDamage=hits.reduce((s,h)=>s+h.damage,0);
      return {...base,status:'model_only',dps:cycleDamage/model.seconds,cycleSeconds:model.seconds,cycleDamage,hits,reasons:[]};
    }
    function spell(variant,catalystId,stats,settings) {
      const sp=catalogs.spells.get(variant.spell_id),cat=catalogs.variants.get(catalystId);
      const required=Object.entries(sp.requirements).filter(([a,n])=>stats[a]<n).map(([a,n])=>({stat:a,short:n-stats[a],need:n,have:stats[a]}));
      const correctTool=!!cat&&(sp.type==='Sorcery'?cat.sorcery_tool:cat.incantation_tool);
      const c=correctTool?weapon(cat,stats,{upgrade:getUpgrade(cat,settings),onlyAttribute:variant.only_int?'int':variant.only_faith?'fai':null}):null;
      const coeff=TYPES.map(t=>variant.typed_attack_coefficient[t]);
      const hasAttack=variant.attack_id!=null&&coeff.every(finite)&&coeff.some(n=>n>0);
      const power=hasAttack&&(variant.no_scale||c)?coeff.map((n,i)=>variant.no_scale?n:n*(c.spellScaling[i]||100)/100):null;
      const usable=required.length===0&&correctTool&&c.usable;
      return {required,correctTool,catalyst:c,usable,power,total:power?power.reduce((a,b)=>a+b,0):null,fp:variant.fp,slots:sp.memory_slots};
    }
    function equipment(state) {
      const items=[...state.armor.map(id=>catalogs.armor.get(id)),...state.talismans.map(id=>catalogs.talismans.get(id))].filter(Boolean);
      const stats={...state.stats},rates={hp:1,fp:1,stamina:1,load:1},cuts=[1,1,1,1,1],resists=Array(7).fill(0),effects=[];
      let weight=0,poise=0;
      for(const item of items) {
        weight+=item.weight||0;
        if(item.cuts)for(let i=0;i<5;i++)if(finite(item.cuts[i]))cuts[i]*=item.cuts[i];
        if(item.resists)for(let i=0;i<7;i++)resists[i]+=item.resists[i]||0;
        if(item.poise)poise+=item.poise*1000;
        const e=data.effects[item.name_en];
        if(e){effects.push({name:item.name_ja||item.name_en,...e});if(e.always){
          for(let i=0;i<STATS.length;i++)stats[STATS[i]]+=e.fields[ADD[i]]||0;
          for(const [r,k] of Object.entries({hp:'maxHpRate',fp:'maxMpRate',stamina:'maxStaminaRate',load:'equipWeightChangeRate'}))rates[r]*=e.fields[k]??1;
          const neutral=['neutralDamageCutRate','magicDamageCutRate','fireDamageCutRate','thunderDamageCutRate','darkDamageCutRate'];
          const pve=['defEnemyDmgCorrectRate_Physics','defEnemyDmgCorrectRate_Magic','defEnemyDmgCorrectRate_Fire','defEnemyDmgCorrectRate_Thunder','defEnemyDmgCorrectRate_Dark'];
          for(let i=0;i<5;i++)cuts[i]*=(e.fields[neutral[i]]??1)*(e.fields[pve[i]]??1);
        }}
      }
      for(const id of state.weapons) {
        const v=catalogs.variants.get(id);if(v)weight+=catalogs.weapons.get(v.weapon_id)?.weight||0;
      }
      for(const a of STATS)stats[a]=clamp(stats[a],1,99);
      const hp=Math.floor(data.stats.hp[stats.vig]*rates.hp),fp=Math.floor(data.stats.fp[stats.mnd]*rates.fp),stamina=Math.floor(data.stats.stamina[stats.end]*rates.stamina),load=data.stats.load[stats.end]*rates.load;
      const ratio=weight/load,roll=ratio<0.3?'軽量':ratio<0.7?'中量':ratio<1?'重量':'過積載';
      return {stats,hp,fp,stamina,load,weight,ratio,roll,poise:Math.floor(poise),negation:cuts.map(n=>(1-n)*100),resists,effects};
    }
    function minimumClass(stats) {
      return data.classes.map(c=>({name:c.name_en,level:c.level+STATS.reduce((s,a)=>s+Math.max(0,stats[a]-c.stats[a]),0),wasted:STATS.reduce((s,a)=>s+Math.max(0,c.stats[a]-stats[a]),0)})).sort((a,b)=>a.level-b.level||a.wasted-b.wasted);
    }
    function validateState(input) {
      if(!input||input.schema!==1||typeof input!=='object')throw new Error('この形式のビルドは読み込めません');
      const stats={};for(const a of STATS){const n=input.stats?.[a];if(!Number.isInteger(n)||n<1||n>99)throw new Error('能力値は1〜99の整数にしてください');stats[a]=n;}
      const array=(name,map,max)=>{const ar=input[name];if(!Array.isArray(ar)||ar.length>max||ar.some(x=>x!==''&&!map.has(x)))throw new Error('装備データに不明な項目があります');return [...ar];};
      const settings=input.settings||{};
      const number=(name,low,high,def)=>finite(settings[name])?clamp(Math.round(settings[name]),low,high):def;
      const out={schema:1,name:typeof input.name==='string'?input.name.slice(0,80):'無名のビルド',stats,className:data.classes.some(c=>c.name_en===input.className)?input.className:'Vagabond',settings:{upgradeMode:settings.upgradeMode==='custom'?'custom':'max',normal:number('normal',0,25,25),somber:number('somber',0,10,10),twoHand:settings.twoHand===true,scadu:number('scadu',0,20,0),inShadow:settings.inShadow===true,manualMultiplier:finite(settings.manualMultiplier)?clamp(settings.manualMultiplier,0.1,5):1,memory:number('memory',2,12,10),weaponSort:['total','0','1','2','3','4','7','5','8','scaling','enemy','dps','dpsEnemy'].includes(settings.weaponSort)?settings.weaponSort:'total'},weapons:array('weapons',catalogs.variants,6),armor:array('armor',catalogs.armor,4),talismans:array('talismans',catalogs.talismans,4),memorized:array('memorized',catalogs.spells,12),compare:array('compare',catalogs.variants,6),catalyst:catalogs.variants.has(input.catalyst)?input.catalyst:'',enemy:catalogs.enemies.has(input.enemy)?input.enemy:''};
      while(out.weapons.length<6)out.weapons.push('');while(out.armor.length<4)out.armor.push('');while(out.talismans.length<4)out.talismans.push('');
      const armorSlots=['Head','Body','Arms','Legs'];for(let i=0;i<4;i++){const a=catalogs.armor.get(out.armor[i]);if(a&&a.slot!==armorSlots[i])throw new Error('防具の部位が一致しません');}
      const groups=out.talismans.filter(Boolean).map(id=>catalogs.talismans.get(id).group);if(new Set(groups).size!==groups.length)throw new Error('同じ系統のタリスマンは重複装備できません');
      if(new Set(out.memorized).size!==out.memorized.length)throw new Error('同じ魔法が重複しています');
      out.memorized=out.memorized.filter(Boolean);
      out.enemy=out.enemy||data.enemies[0].id;
      out.compare=[...new Set(out.compare.filter(Boolean))];return out;
    }
    return {data,catalogs,decoded,weapon,spell,equipment,minimumClass,getUpgrade,defenseDamage,hitDamage,weaponDps,validateState};
  }
  const api={create,graph,ATTRS,STATS,TYPES,clamp};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.EREngine=api;
})(typeof globalThis!=='undefined'?globalThis:this);
