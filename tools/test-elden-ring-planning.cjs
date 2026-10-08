const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{gunzipSync}=require('node:zlib');
const root=path.resolve(__dirname,'..'),payload=JSON.parse(fs.readFileSync(path.join(root,'data/elden-ring-payload.json'))),data=JSON.parse(gunzipSync(Buffer.from(payload.data,'base64')));
const engine=require('./elden-ring/engine.js').create(data);
const state={schema:1,name:'試験',stats:{vig:40,mnd:20,end:25,str:30,dex:25,int:30,fai:25,arc:34},className:'Vagabond',settings:{upgradeMode:'max',normal:25,somber:10,twoHand:false,memory:10},weapons:Array(6).fill(''),armor:Array(4).fill(''),talismans:Array(4).fill(''),memorized:[],compare:[],catalyst:'',enemy:data.enemies[0].id};
// Old schema-1 links and JSON remain valid, while new level targets survive round trips.
assert.equal(engine.validateState(state).settings.targetLevel,null);
for(const targetLevel of [1,150,713])assert.equal(engine.validateState({...state,settings:{...state.settings,targetLevel}}).settings.targetLevel,targetLevel);
for(const targetLevel of [0,714,150.5,'150',NaN])assert.throws(()=>engine.validateState({...state,settings:{targetLevel}}),/目標レベル/);
const c=data.classes.find(c=>c.name_en==='Vagabond');assert.equal(engine.buildLevel({...state,stats:c.stats}),c.level);
const boosted=structuredClone(state);boosted.stats.str+=1;assert.equal(engine.buildLevel(boosted),engine.buildLevel(state)+1);
// Exactly 70% requires shedding another 0.1; suggestions must never cross the boundary.
assert.deepEqual(engine.loadBudget({load:100,weight:70}),{threshold:70,canAdd:0,mustRemove:.1,below:false});
assert.equal(engine.loadBudget({load:100,weight:69.9}).canAdd,0);
assert.equal(engine.loadBudget({load:100,weight:69.8}).canAdd,.1);
assert.equal(engine.loadBudget({load:100,weight:70.01}).mustRemove,.1);
assert.equal(engine.loadBudget({load:100,weight:90}).mustRemove,20.1);
for(const load of [40,72,85.68,120.7])for(let tenth=0;tenth<1600;tenth++){
  const weight=tenth/10,b=engine.loadBudget({load,weight});
  if(b.below){assert.ok((weight+b.canAdd)/load<.7,'addition stays below 70%');assert.ok((weight+b.canAdd+.100001)/load>=.7,'largest safe 0.1 increment');}
  else {assert.ok((weight-b.mustRemove)/load<.7,'removal falls below 70%');assert.ok((weight-b.mustRemove+.100001)/load>=.7,'smallest sufficient 0.1 removal');}
}
const long=data.variants.find(v=>v.name_en==='Longsword'),giant=data.variants.find(v=>v.name_en==='Giant-Crusher');
for(const twoHand of [false,true])for(let slot=0;slot<6;slot++){
  const build=structuredClone(state);build.settings.twoHand=twoHand;build.weapons[slot]=long.id;
  const before=JSON.stringify(build),p=engine.equipmentPreview(build,slot,giant.id),expected=structuredClone(build);expected.weapons[slot]=giant.id;
  assert.equal(JSON.stringify(build),before,'preview leaves live build unchanged');assert.deepEqual(p.after,engine.equipment(expected));
  assert.equal(p.weightDelta,data.weapons.find(w=>w.id===giant.weapon_id).weight-data.weapons.find(w=>w.id===long.weapon_id).weight);
  assert.equal(p.candidate.usable,false);assert.equal(p.arDelta,p.candidate.total-p.current.total);
}
const encumbered=structuredClone(state);encumbered.stats.end=1;
const heavy=data.variants.find(v=>v.name_en==='Giant-Crusher');encumbered.weapons=Array(3).fill(heavy.id).concat(['','','']);
const jar=data.talismans.find(t=>t.name_en==="Great-Jar's Arsenal");encumbered.talismans[0]=jar.id;
const preview=engine.equipmentPreview(encumbered,0,long.id);assert.equal(preview.after.load,engine.equipment(encumbered).load);assert.ok(preview.after.weight<preview.before.weight);
assert.throws(()=>engine.equipmentPreview(state,6,long.id));assert.throws(()=>engine.equipmentPreview(state,0,'unknown'));
console.log('PASS: legacy targets, 6,400 weight-boundary scenarios, preview immutability, six slots, both hands, load bonuses and missing requirements');
