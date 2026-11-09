(function(root){
'use strict';
const Constraints=typeof module!=='undefined'&&module.exports?require('./build-constraints.js'):root.ERBuildConstraints;
function compare(engine,ctx,next,{enemy,physical='Phys',multiplier=1,hits=[100]}={}){
 const before=Constraints.inspect(engine,ctx,ctx.original),after=Constraints.inspect(engine,ctx,next);
 const beforeRows=new Map(before.rows.map(r=>[r.key,r]));
 const changes=after.rows.map(r=>({...r,before:beforeRows.get(r.key),newlyUnusable:beforeRows.get(r.key)?.usable===true&&!r.usable}));
 const damage=r=>enemy&&physical&&Array.isArray(hits)&&hits.length?hits.reduce((sum,mv)=>{
  if(sum===null)return null;const value=engine.hitDamage(Object.fromEntries([0,1,2,3,4].map(t=>[t,(r.attack[t]||0)*mv/100])),enemy,physical,multiplier)?.total;
  return value==null?null:sum+value;
 },0):null;
 const oldId=ctx.settings.applyMode==='equip'?ctx.original.weapons[ctx.settings.targetSlot]:null;
 const old=oldId?engine.weapon(oldId,before.equip.stats,{twoHand:ctx.original.settings.twoHand,upgrade:engine.getUpgrade(engine.catalogs.variants.get(oldId),ctx.original.settings)}):null;
 return {before,after,changes,arDelta:after.target.total-before.target.total,equippedArDelta:old?after.target.total-old.total:null,
  damageBefore:damage(before.target),damageAfter:damage(after.target),budgetBefore:engine.loadBudget(before.equip),budgetAfter:engine.loadBudget(after.equip)};
}
const api={compare};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.ERBuildComparison=api;
})(typeof globalThis!=='undefined'?globalThis:this);
