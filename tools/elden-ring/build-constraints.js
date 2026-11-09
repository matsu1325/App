/* Requirements-only preservation. Equipped catalysts, never comparison selections. */
(function(root){
'use strict';
const STATS=['vig','mnd','end','str','dex','int','fai','arc'];
const LABEL={vig:'生命力',mnd:'精神力',end:'持久力',str:'筋力',dex:'技量',int:'知力',fai:'信仰',arc:'神秘'};
const slotName=i=>`${i<3?'右手':'左手'}${i%3+1}`;
const name=x=>x?.name_ja||x?.name_en||'';
function context(engine,input){
 const original=engine.validateState(input.state),settings=engine.normalizeOptimizerSettings(input.optimizerSettings,original);
 if(settings.needsReview)throw Error('保存された最適化条件の版を確認し、「条件を保存」で再設定してください');
 const variant=engine.catalogs.variants.get(input.variantId);if(!variant)throw Error('対象武器が不明です');
 const state={...original,weapons:[...original.weapons]};
 if(settings.applyMode==='equip')state.weapons[settings.targetSlot]=variant.id;
 const targetSlot=settings.applyMode==='equip'?settings.targetSlot:state.weapons.indexOf(variant.id);
 const casting={};
 for(const [kind,flag] of [['sorcery','sorcery_tool'],['incantation','incantation_tool']]){
   let slot=settings.castingSlots[kind];
   const candidates=state.weapons.flatMap((id,i)=>engine.catalogs.variants.get(id)?.[flag]?[i]:[]);
   const stale=slot!==null&&(!engine.catalogs.variants.get(state.weapons[slot])?.[flag]||settings.castingVariants[kind]!==state.weapons[slot]);
   if(slot===null&&candidates.length===1){slot=candidates[0];settings.castingSlots[kind]=slot;settings.castingVariants[kind]=state.weapons[slot];}
   casting[kind]={slot,valid:slot!==null&&!stale&&!!engine.catalogs.variants.get(state.weapons[slot])?.[flag],stale,candidates};
 }
 return {original,state,settings,variant,targetSlot,casting};
}
function inspect(engine,ctx,state){
 const {settings,variant,targetSlot,casting}=ctx,equip=engine.equipment(state),rows=[];
 const calc=(v,twoHand)=>engine.weapon(v,equip.stats,{twoHand,upgrade:engine.getUpgrade(v,state.settings)});
 const target=calc(variant,state.settings.twoHand);
 rows.push({key:'target',name:'対象武器：'+name(engine.catalogs.weapons.get(variant.weapon_id)),kind:'target',protected:true,usable:target.usable,missing:target.missing,reasons:[],result:target});
 for(let i=0;i<6;i++){
  const v=engine.catalogs.variants.get(state.weapons[i]);if(!v)continue;
  const r=calc(v,i===targetSlot?state.settings.twoHand:false);
  rows.push({key:'weapon:'+i,name:slotName(i)+'：'+name(engine.catalogs.weapons.get(v.weapon_id)),kind:'weapon',slot:i,protected:settings.protectEquippedWeapons,usable:r.usable,missing:r.missing,reasons:[],result:r});
 }
 const used=state.memorized.reduce((n,id)=>n+(engine.catalogs.spells.get(id)?.memory_slots||0),0);
 const capacity=Math.min(12,state.settings.memory+(state.talismans.some(id=>engine.catalogs.talismans.get(id)?.name_en==='Moon of Nokstella')?2:0));
 for(const id of state.memorized){
  const sp=engine.catalogs.spells.get(id),kind=sp.type==='Sorcery'?'sorcery':'incantation',flag=kind==='sorcery'?'sorcery_tool':'incantation_tool',binding=casting[kind],reasons=[];
  const v=binding.slot!==null?engine.catalogs.variants.get(state.weapons[binding.slot]):null;
  const cat=v?.[flag]?calc(v,false):null;
  const missing=Object.entries(sp.requirements).filter(([a,n])=>equip.stats[a]<n).map(([stat,need])=>({stat,need,have:equip.stats[stat],short:need-equip.stats[stat]}));
  if(binding.stale)reasons.push('保存した触媒が変更されています。触媒を選び直してください');
  else if(!cat)reasons.push((kind==='sorcery'?'魔術':'祈祷')+'用の装備済み触媒を選んでください');
  if(cat?.missing.length)missing.push(...cat.missing);
  if(used>capacity)reasons.push(`記憶枠不足：必要${used} / 使用可能${capacity}`);
  rows.push({key:'spell:'+id,name:name(sp),kind:'spell',protected:settings.protectMemorizedSpells,usable:!missing.length&&!reasons.length,missing,reasons,verification:'requirements-only'});
 }
 return {equip,target,rows,memory:{used,capacity}};
}
function prepare(engine,input){
 const ctx=context(engine,input),base=inspect(engine,ctx,ctx.state);
 const structural=base.rows.filter(r=>r.protected&&r.reasons.length);
 if(structural.length)throw Error(structural.map(r=>r.name+'：'+r.reasons.join(' / ')).join('\n'));
 const minima={},reasons={};
 for(const a of STATS){
  let n=1,last=[];
  while(n<=99){
   const report=inspect(engine,ctx,{...ctx.state,stats:{...ctx.state.stats,[a]:n}});
   const missing=report.rows.filter(r=>r.protected&&r.missing.some(m=>m.stat===a));
   if(!missing.length)break;last=missing.map(r=>r.name);n++;
  }
  if(n>99)throw Error(`${LABEL[a]}は装備補正込みでも要求を満たせません：${last.join(' / ')}`);
  minima[a]=n;reasons[a]=last;
 }
 return {...ctx,minima,reasons};
}
function verify(engine,ctx,state){
 const report=inspect(engine,ctx,state),bad=report.rows.filter(r=>r.protected&&!r.usable);
 if(bad.length)throw Error('保護条件を満たしません：'+bad.map(r=>r.name).join(' / '));return report;
}
const api={context,inspect,prepare,verify,LABEL,slotName};
if(typeof module!=='undefined'&&module.exports)module.exports=api;root.ERBuildConstraints=api;
})(typeof globalThis!=='undefined'?globalThis:this);
