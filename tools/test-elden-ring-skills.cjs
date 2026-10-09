const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const Engine=require('./elden-ring/engine.js');
const root=path.resolve(__dirname,'..');
const unpack=file=>{const p=JSON.parse(fs.readFileSync(path.join(root,file)));if(p.parts)p.data=p.parts.map(part=>fs.readFileSync(path.join(root,path.dirname(file),part.file),'utf8')).join('');return JSON.parse(zlib.gunzipSync(Buffer.from(p.data,'base64')));};
const data=unpack('data/elden-ring-payload.json'),runtime=unpack('data/elden-ring-skills/runtime/manifest.json');
const e=Engine.create(data,undefined,runtime),stats={vig:40,mnd:20,end:25,str:40,dex:40,int:40,fai:40,arc:40};
const ls='weapon:2000000:0:base',uchi='weapon:9000000:0:base',moon='weapon:9060000:-1:base';
const enemy=data.enemies.find(x=>x.journey==='NG'&&x.name.includes('Margit'));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const sim=(skillId,actionId,variant=ls,extra={})=>e.skillSimulation(variant,stats,{skillId,actionId,enemy,...extra});
assert.equal(Object.keys(runtime.skills).length,267);
// Known pilot constants are independent of the runtime compiler's classification.
for(const [id,action,weapon,mv,fp,physical] of [
 [100,'100:a600_040000',ls,240,20,'Phys'],[101,'101:a601_040000',ls,187,9,'Pierce'],
 [114,'114:a614_040060',uchi,190,10,'Slash'],[114,'114:a614_040070',uchi,245,15,'Slash'],
 [115,'115:a615_040060',ls,200,6,'Phys'],[115,'115:a615_040070',ls,240,8,'Pierce']]){
 const result=sim(id,action,weapon),r=e.weapon(weapon,stats);
 assert.equal(result.status,'model_only');assert.equal(result.fp,fp);assert.equal(result.hits.length,1);
 near(result.total,e.hitDamage(Array.from({length:5},(_,t)=>(r.attack[t]||0)*mv/100),enemy,physical).total);
 near(result.damagePerFp,result.total/fp);assert.equal(result.dps,null);
}
const normal=sim(100,'100:a600_040000'),empty=sim(100,'100:a600_040005');
assert.ok(empty.total<normal.total);assert.equal(empty.fp,0);assert.equal(empty.damagePerFp,null);
assert.equal(sim(114,'114:a614_040060',ls).total,null,'illegal Unsheathe weapon');
assert.equal(sim(1178,'1178:a778_040060',ls).total,null,'fixed skill bound to Moonveil');
assert.equal(e.skillSimulation(ls,{...stats,str:1,dex:1},{skillId:100,actionId:'100:a600_040000',enemy}).status,'unusable');
assert.ok(sim(100,'100:a600_040000',ls,{upgrade:0}).total<normal.total);
assert.ok(sim(100,'100:a600_040000',ls,{twoHand:true}).total>normal.total);
const raw=sim(100,'100:a600_040000',ls,{scope:'raw'});near(sim(100,'100:a600_040000',ls,{scope:'raw',multiplier:2}).total,raw.total*2);
// Split elemental AR is reduced by defense separately. PvP final rates are not used in PvE.
const magic='weapon:2000000:8:base',rMagic=e.weapon(magic,stats);
near(sim(115,'115:a615_040060',magic).total,e.hitDamage(Array.from({length:5},(_,t)=>(rMagic.attack[t]||0)*2),enemy,'Phys').total);
// DLC ash absent from the reference compatibility sheet uses raw flags plus exact animation users.
assert.ok(e.skillVariants(4150).some(v=>v.id===ls));
assert.equal(runtime.skills[4150].availability_evidence[ls],'raw_category_affinity_and_animation_user_candidate');
const savage=sim(4150,'4150:a882_040010'),ar=e.weapon(ls,stats).attack;
assert.equal(savage.hits.length,2);assert.equal(savage.fp,10);assert.equal(savage.total,null);
assert.equal(savage.hits[0].reason,'special_behavior','unreviewed behavior does not become a complete total');
near(sim(4150,'4150:a882_040010',ls,{selectedWindows:[1]}).total,e.hitDamage(Array.from({length:5},(_,t)=>(ar[t]||0)*1.55),enemy,'Phys').total);
assert.equal(sim(4150,'4150:a882_040010',ls,{selectedWindows:[1]}).damagePerFp,null,'partial selection is not full action efficiency');
const double=sim(112,'112:a612_040000');assert.equal(double.hits.length,2);
const perHit=[92,105].map(mv=>e.hitDamage(Array.from({length:5},(_,t)=>(ar[t]||0)*mv/100),enemy,'Phys').total);
near(double.total,perHit[0]+perHit[1]);
assert.ok(Math.abs(double.total-e.hitDamage(Array.from({length:5},(_,t)=>(ar[t]||0)*1.97),enemy,'Phys').total)>1,'defense not applied after summing');
assert.equal(sim(4150,'4150:a882_040010',ls,{selectedWindows:[]}).total,null,'no selected hits is unknown');
// Projectile and parent/child aliases cannot silently disappear into a full skill total.
const composite=sim(1178,'1178:a778_040060',moon);
assert.equal(composite.status,'unsupported');assert.equal(composite.total,null);assert.equal(composite.modeledTotal,null);
assert.equal(composite.damagePerFp,null);
assert.equal(composite.hits[0].reason,'special_behavior');assert.equal(composite.hits[1].reason,'ambiguous_components');
assert.equal(sim(1178,'1178:a778_040060',moon,{selectedWindows:[0]}).total,null,'unreviewed blade behavior remains unknown');
assert.equal(sim(600,'').total,null,'buff is not zero damage');
const unknown=sim(102,'102:a602_040000');assert.ok(unknown.total>0);assert.equal(unknown.fp,null);assert.equal(unknown.damagePerFp,null);
const manual=sim(102,'102:a602_040000',ls,{fpOverride:12});assert.equal(manual.fpSource,'manual');near(manual.damagePerFp,manual.total/12);
assert.equal(sim(102,'102:a602_040000',ls,{fpOverride:0}).damagePerFp,null);
assert.equal(sim(100,'100:a600_040000',ls,{multiplier:NaN}).status,'error');
assert.equal(sim(102,'102:a602_040000',ls,{fpOverride:-1}).status,'error');
assert.equal(sim(100,'100:a600_040000',ls,{selectedWindows:[99]}).status,'error');
// Fixed-affinity does not imply a fixed ash. Bows and perfume bottles keep their original affinity.
for(const [sid,weapon] of [[404,'weapon:41000000:-1:base'],[405,'weapon:40000000:-1:base'],
 [406,'weapon:41000000:-1:base'],[4040,'weapon:61500000:-1:base'],[4050,'weapon:61510000:-1:base']]){
 assert.ok(e.skillVariants(sid).some(v=>v.id===weapon),`missing fixed-affinity ash candidate ${sid}`);
 assert.ok(e.skillActions(sid,weapon).length>0);assert.ok(!e.skillVariants(sid).some(v=>v.id===ls));
}
assert.ok(e.skillVariants(4210).length>0);assert.ok(!e.skillVariants(4210).some(v=>v.weapon_id==='weapon:42030000'),'unique Erdtree Greatbow cannot change ash');
assert.ok(!e.skillVariants(100).some(v=>v.weapon_id==='weapon:41000000'),'Lion claw cannot be put on a bow');
const missing=e.skillSimulation('weapon:21530000:-1:base',stats,{skillId:5320,actionId:'5320:a933_040000',enemy});
assert.equal(missing.total,null);assert.deepEqual(missing.reasons,['missing_dependency']);assert.ok(missing.missingDependencies.includes('effect:102370'));
const crucifixion=e.skillVariants(5220)[0],grab=sim(5220,'5220:a923_040090',crucifixion.id);
assert.equal(grab.total,null);assert.ok(grab.reasons.includes('grab_condition'));
assert.equal(sim(5220,'5220:a923_040090',crucifixion.id,{scope:'raw'}).total,null,'raw scope also requires verified grab conditions');
assert.ok(e.skillActions(503,ls).some(a=>a.id==='503:a712_040000'));
assert.deepEqual(sim(503,'503:a712_040000').reasons,['attack_reference_missing']);
const buffChoice=e.validateSkillSettings({skillId:600});
assert.ok(buffChoice.actionId);assert.equal(e.skillSimulation(buffChoice.variantId,stats,{...buffChoice,enemy}).total,null);
assert.equal(e.skillSimulation(buffChoice.variantId,stats,{...buffChoice,enemy}).reasons[0],'support_action');
const oldChoice={skillId:112,variantId:ls,actionId:'112:a612_040000',selectedWindows:[1],fpOverride:12};
const switched=e.selectSkillSettings(oldChoice,{skillId:1018,variantId:'weapon:2080000:-1:base',actionId:''});
assert.equal(switched.fpOverride,null);assert.equal(switched.selectedWindows,null);
assert.equal(e.selectSkillSettings(oldChoice,{variantId:'weapon:2000000:8:base'}).fpOverride,12,'same action keeps its FP assumption');
assert.equal(e.selectSkillSettings(oldChoice,{actionId:'112:a612_040010'}).fpOverride,null);
assert.equal(e.validateSkillSettings({...oldChoice,actionId:'missing'}).fpOverride,null,'fallback action cannot inherit FP');
assert.equal(sim(102,'102:a602_040000',ls,{selectedWindows:[],fpOverride:12}).fp,12,'manual FP survives no selected hit');
const state={schema:1,stats,className:'Vagabond',settings:{},weapons:[],armor:[],talismans:[],memorized:[],compare:[],
 skillSimulation:{skillId:4150,variantId:ls,actionId:'4150:a882_040010',selectedWindows:[1],fpOverride:null}};
assert.deepEqual(e.validateState(JSON.parse(JSON.stringify(state))).skillSimulation,state.skillSimulation);
delete state.skillSimulation;assert.equal(e.validateState(state).skillSimulation.skillId,100,'old saves migrate');
let checked=0;
for(const component of Object.values(runtime.components))if(component.reason===null){
 assert.equal(component.flat.every(x=>x===0),true);assert.equal(component.bullet_id,null);
 assert.ok(component.mv.every(Number.isFinite));checked++;
}
assert.equal(checked,1848,'review changes to component eligibility with the fixed source snapshot');
const audit=JSON.parse(fs.readFileSync(path.join(root,'data/elden-ring-skills/all/audit.json')));
assert.equal(Object.keys(runtime.skills).length,audit.counts.player_linked_candidates);
assert.equal(Object.keys(runtime.actions).length,audit.counts.skill_animation_actions);
const csv=fs.readFileSync(path.join(root,'data/elden-ring-skills/simulator-coverage.csv'),'utf8').trim().split('\n');
assert.equal(csv.length,268);assert.deepEqual(new Set(csv.slice(1).map(line=>Number(line.match(/^"(\d+)"/)[1]))),new Set(Object.values(runtime.skills).map(s=>s.id)));
let pairs=0;const statuses={complete_action_candidate:0,partial_only:0,unmodeled:0};
const high={vig:99,mnd:99,end:99,str:99,dex:99,int:99,fai:99,arc:99};
for(const skill of Object.values(runtime.skills)){
 assert.ok(skill.legal_variants.length,`no weapon candidates for ${skill.id}`);assert.ok(skill.actions.length);
 const bases=[...new Map(e.skillVariants(skill.id).map(v=>[v.weapon_id,v])).values()],counts={complete_actions:0,partial_actions:0,unmodeled_actions:0};
 for(const id of skill.actions){
  const a=runtime.actions[id];assert.equal(a.skill_id,skill.id);let best=0;
  for(const v of bases){
   if(!e.skillActions(skill.id,v.id).some(a=>a.id===id))continue;
   const out=e.skillSimulation(v,high,{skillId:skill.id,actionId:id,enemy});pairs++;
   if(out.status==='model_only'){assert.ok(out.total>0);assert.equal(out.hits.length,a.windows.length);best=2;}
   else if(out.status==='partial')best=Math.max(best,1);
   else assert.equal(out.total,null);
   if(a.calculation_blocker){assert.equal(out.modeledTotal,null);assert.ok(out.reasons.includes(a.calculation_blocker));}
  }
  counts[best===2?'complete_actions':best===1?'partial_actions':'unmodeled_actions']++;
 }
 for(const [key,value] of Object.entries(counts))assert.equal(skill.coverage[key],value,`${skill.id} ${key}`);
 const status=counts.complete_actions?'complete_action_candidate':counts.partial_actions?'partial_only':'unmodeled';
 assert.equal(skill.coverage.status,status);statuses[status]++;
}
assert.equal(statuses.complete_action_candidate,runtime.summary.skills_with_complete_action);
assert.equal(statuses.partial_only,runtime.summary.skills_partial_only);assert.equal(statuses.unmodeled,runtime.summary.skills_unmodeled);
console.log(`PASS: skill constants, defense, FP scope, fixed affinity ashes, missing dependencies/grabs, all 267 coverage rows and ${pairs} action/weapon models; ${checked} simple components`);
