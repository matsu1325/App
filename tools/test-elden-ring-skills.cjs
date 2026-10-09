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
const state={schema:1,stats,className:'Vagabond',settings:{},weapons:[],armor:[],talismans:[],memorized:[],compare:[],
 skillSimulation:{skillId:4150,variantId:ls,actionId:'4150:a882_040010',selectedWindows:[1],fpOverride:null}};
assert.deepEqual(e.validateState(JSON.parse(JSON.stringify(state))).skillSimulation,state.skillSimulation);
delete state.skillSimulation;assert.equal(e.validateState(state).skillSimulation.skillId,100,'old saves migrate');
let checked=0;
for(const component of Object.values(runtime.components))if(component.reason===null){
 assert.equal(component.flat.every(x=>x===0),true);assert.equal(component.bullet_id,null);
 assert.ok(component.mv.every(Number.isFinite));checked++;
}
assert.ok(checked>100);
console.log(`PASS: skill constants, defense per hit/element, FP branches, DLC availability, partial projectiles, manual cost, saves; ${checked} simple component models`);
