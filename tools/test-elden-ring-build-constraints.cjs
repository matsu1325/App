const assert=require('node:assert/strict'),fs=require('node:fs'),z=require('node:zlib');
const Engine=require('./elden-ring/engine.js'),Constraints=require('./elden-ring/build-constraints.js'),{optimize}=require('./elden-ring/optimizer.js');
const p=JSON.parse(fs.readFileSync('data/elden-ring-payload.json')),d=JSON.parse(z.gunzipSync(Buffer.from(p.data,'base64'))),e=Engine.create(d),S=Engine.STATS;
const base=(c=d.classes[0])=>e.validateState({schema:1,className:c.name_en,stats:{...c.stats},settings:{upgradeMode:'max'},weapons:[],armor:[],talismans:[],memorized:[],compare:[]});
const variant=(name,affinity)=>d.variants.find(v=>e.catalogs.weapons.get(v.weapon_id).name_en===name&&(affinity===undefined||v.affinity_id===affinity));
const fast={yieldControl:()=>Promise.resolve()},sword=variant('Longsword',8),giant=variant('Giant-Crusher',0),staff=variant("Astrologer's Staff"),comet=d.spells.find(s=>s.name_en==='Comet Azur');
const settings=(state,patch={})=>{const out=e.normalizeOptimizerSettings(null,state);for(const [kind,flag] of [['sorcery','sorcery_tool'],['incantation','incantation_tool']]){const slots=state.weapons.flatMap((id,i)=>e.catalogs.variants.get(id)?.[flag]?[i]:[]);if(slots.length===1){out.castingSlots[kind]=slots[0];out.castingVariants[kind]=state.weapons[slots[0]];}}return {...out,...patch};};
async function main(){
 let state=base();state.weapons[0]=giant.id;const input={state,variantId:sword.id,targetLevel:200,optimizerSettings:settings(state,{bounds:{str:{max:59}}})};
 await assert.rejects(optimize(e,input,fast),/筋力.*巨人砕き/);
 const free=await optimize(e,{...input,optimizerSettings:{...input.optimizerSettings,protectEquippedWeapons:false}},fast);assert.ok(free.stats.str<60);assert.ok(free.comparison.changes.some(r=>r.key==='weapon:0'&&!r.usable));
 const replace=await optimize(e,{...input,optimizerSettings:{...input.optimizerSettings,applyMode:'equip',targetSlot:0}},fast);assert.equal(replace.state.weapons[0],sword.id);assert.ok(replace.stats.str<60);assert.notEqual(replace.comparison.after.equip.weight,replace.comparison.before.equip.weight);
 state.weapons[1]=giant.id;await assert.rejects(optimize(e,{...input,optimizerSettings:{...input.optimizerSettings,applyMode:'equip',targetSlot:0}},fast),/巨人砕き/);
 state=base();state.settings.twoHand=true;state.weapons[0]=giant.id;
 const two=await optimize(e,{state,variantId:giant.id,targetLevel:200,optimizerSettings:settings(state,{bounds:{str:{fixed:40}}})},fast);assert.equal(two.stats.str,40);
 state.weapons[1]=giant.id;await assert.rejects(optimize(e,{state,variantId:giant.id,targetLevel:200,optimizerSettings:settings(state,{bounds:{str:{fixed:40}}})},fast),/筋力/);
 state=base();state.memorized=[comet.id];state.catalyst=staff.id;
 await assert.rejects(optimize(e,{state,variantId:sword.id,targetLevel:200,optimizerSettings:settings(state)},fast),/装備済み触媒/);
 state.weapons[3]=staff.id;
 await assert.rejects(optimize(e,{state,variantId:sword.id,targetLevel:200,optimizerSettings:settings(state,{bounds:{int:{max:59}}})},fast),/知力.*彗星アズール/);
 const spell=await optimize(e,{state,variantId:sword.id,targetLevel:200,optimizerSettings:settings(state)},fast);assert.ok(spell.comparison.changes.find(r=>r.key==='spell:'+comet.id).usable);assert.ok(spell.stats.int>=60);assert.equal(spell.state.optimizerSettings.castingVariants.sorcery,staff.id);
 state.settings.memory=2;await assert.rejects(optimize(e,{state,variantId:sword.id,targetLevel:200,optimizerSettings:settings(state)},fast),/記憶枠不足/);state.settings.memory=10;
 await assert.rejects(optimize(e,{state,variantId:sword.id,targetLevel:200,optimizerSettings:settings(state,{castingSlots:{sorcery:null,incantation:null},castingVariants:{sorcery:'',incantation:''}})},fast),/装備済み触媒/);
 const stale=settings(state,{castingSlots:{sorcery:3,incantation:null},castingVariants:{sorcery:'old-variant',incantation:''}});await assert.rejects(optimize(e,{state,variantId:sword.id,targetLevel:200,optimizerSettings:stale},fast),/選び直し/);
 // Protection of a casting tool remains active when general equipment protection is off.
 const highStaff=d.variants.find(v=>v.sorcery_tool&&(v.requirements.str||0)>10);if(highStaff){state.weapons[3]=highStaff.id;const bound=(highStaff.requirements.str||0)-1;await assert.rejects(optimize(e,{state,variantId:sword.id,targetLevel:200,optimizerSettings:settings(state,{protectEquippedWeapons:false,bounds:{str:{max:bound}}})},fast));}
 state=base();assert.equal(state.optimizerSettings,undefined);const saved=e.validateState({...state,optimizerSettings:settings(state)});assert.deepEqual(e.validateState(JSON.parse(JSON.stringify(saved))),saved);
 assert.equal(e.validateState({...state,optimizerSettings:{version:99}}).optimizerSettings.needsReview,true);
 await assert.rejects(optimize(e,{state,variantId:sword.id,targetLevel:200,optimizerSettings:{version:99}},fast),/条件の版/);
 for(const bad of [{version:1,bounds:{str:{min:30,max:20}}},{version:1,protectMemorizedSpells:'yes'},{version:1,targetSlot:6},{version:1,bounds:{str:{fixed:20,min:10}}},{version:1,castingSlots:[]}])assert.throws(()=>e.validateState({...state,optimizerSettings:bad}));
 // Independent exhaustive checks with protected side weapons, both handling modes and fixed gear bonuses.
 let seed=0x20261110;const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let i=0;i<1000;i++){
  const c=d.classes[rand(d.classes.length)],state=base(c),v=d.variants[rand(d.variants.length)],side=d.variants[rand(d.variants.length)];if(v.sorcery_tool||v.incantation_tool){i--;continue;}
  state.weapons[1]=side.id;state.settings.twoHand=!!rand(2);
  if(i%3===0){const tal=d.talismans.find(t=>t.name_en==="Radagon's Soreseal");if(tal)state.talismans[0]=tal.id;}
  const protect=!!rand(2),lo={},hi={},bounds={},attrs=[...Engine.ATTRS];for(let j=attrs.length-1;j>0;j--){const k=rand(j+1);[attrs[j],attrs[k]]=[attrs[k],attrs[j]];}
  for(const a of S){lo[a]=Math.max(c.stats[a],v.requirements[a]||1,protect?(side.requirements[a]||1):1);hi[a]=Math.min(99,lo[a]+(attrs.slice(0,3).includes(a)?3:0));bounds[a]={min:lo[a],max:hi[a]};}
  const extra=rand(7),level=c.level+S.reduce((n,a)=>n+lo[a]-c.stats[a],0)+extra;let best=-Infinity;
  const visit=(j,left,stats)=>{if(j===8){if(left)return;const effective=e.equipment({...state,stats}).stats,r=e.weapon(v,effective,{twoHand:state.settings.twoHand}),aux=e.weapon(side,effective,{twoHand:false});if(r.usable&&(!protect||aux.usable))best=Math.max(best,r.total);return;}const a=S[j];for(let n=lo[a];n<=hi[a]&&n-lo[a]<=left;n++)visit(j+1,left-n+lo[a],{...stats,[a]:n});};visit(0,extra,{});
  const input={state,variantId:v.id,targetLevel:level,optimizerSettings:settings(state,{protectEquippedWeapons:protect,bounds})},copy=JSON.stringify(input);
  if(!Number.isFinite(best))await assert.rejects(optimize(e,input,fast));else{const r=await optimize(e,input,fast);assert.ok(Math.abs(r.result.total-best)<1e-7,'case '+i);assert.equal(e.buildLevel(r.state),level);assert.ok(r.comparison.changes.filter(x=>x.protected).every(x=>x.usable));}
  assert.equal(JSON.stringify(input),copy);
 }
 console.log('PASS: 1,000 exhaustive preservation cases; replacement, duplicate slots, two-hand isolation, equipped catalysts, spell/memory requirements, settings migration and immutability');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
