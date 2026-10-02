const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),Engine=require('./elden-ring/engine.js');
(async()=>{
 const {buildDpsRuntime}=await import(pathToFileURL(path.join(__dirname,'elden-ring/dps/runtime.mjs')));
 const runtime=buildDpsRuntime(root);
 const payload=JSON.parse(fs.readFileSync(path.join(root,'data/elden-ring-payload.json')));
 const data=JSON.parse(zlib.gunzipSync(Buffer.from(payload.data,'base64'))),e=Engine.create(data,runtime);
 const stats={vig:40,mnd:20,end:25,str:30,dex:25,int:30,fai:25,arc:34};
 const v=data.variants.find(v=>v.weapon_id==='weapon:2000000'&&v.affinity_id===0);assert.ok(v);
 const r=e.weapon(v,stats),d=e.weaponDps(v,stats);
 assert.equal(d.status,'model_only');assert.equal(d.rankingEligible,false);assert.equal(d.cycleSeconds,3.8);assert.equal(d.hits.length,5);
 const mv=runtime.models['weapon:2000000:1h-r1'].hits;
 const raw=mv.reduce((sum,h)=>sum+h.mv.reduce((s,n,t)=>s+(r.attack[t]||0)*n/100,0),0);
 assert.ok(Math.abs(d.cycleDamage-raw)<1e-8);
 const enemy=data.enemies.find(x=>x.journey==='NG'&&x.name.includes('Margit'));
 const expected=mv.map(h=>e.hitDamage(h.mv.map((n,t)=>(r.attack[t]||0)*n/100),enemy,h.physical,1.4).total).reduce((a,b)=>a+b,0);
 const target=e.weaponDps(v,stats,{enemy,scope:'enemy',multiplier:1.4});
 assert.ok(Math.abs(target.cycleDamage-expected)<1e-8);
 assert.equal(e.weaponDps(v,stats,{twoHand:true}).dps,null);
 assert.equal(e.weaponDps(v,{...stats,str:1,dex:1}).status,'unusable');
 assert.equal(e.weaponDps(v,stats,{scope:'enemy'}).dps,null);
 assert.ok(e.weaponDps(v,{...stats,str:60}).dps>d.dps);
 assert.ok(e.weaponDps(v,stats,{upgrade:0}).dps<d.dps);
 assert.ok(Math.abs(e.weaponDps(v,stats,{multiplier:2}).dps-d.dps*2)<1e-8);
 let count=0;
 for(const variant of data.variants){
  for(const twoHand of [false,true]){
   const result=e.weaponDps(variant,Object.fromEntries(Engine.STATS.map(x=>[x,99])),{twoHand});
   if(result.dps!==null){count++;assert.ok(Number.isFinite(result.dps));assert.equal(result.status,'model_only');}
  }
 }
 assert.ok(count>86);
 const state={schema:1,stats,className:'Vagabond',settings:{weaponSort:'dpsEnemy'},weapons:[],armor:[],talismans:[],memorized:[],compare:[]};
 assert.equal(e.validateState(state).settings.weaponSort,'dpsEnemy');delete state.settings.weaponSort;
 assert.equal(e.validateState(state).settings.weaponSort,'total');
 console.log(`PASS: DPS references, per-hit defense, requirements, upgrade, stats, multiplier, ${count} affinity/hand combinations and save migration`);
})().catch(e=>{console.error(e);process.exitCode=1;});
