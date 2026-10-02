const assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib'),vm=require('node:vm');
const ER=require('./elden-ring/engine.js');
const payload=JSON.parse(fs.readFileSync('data/elden-ring-payload.json'));
const data=JSON.parse(zlib.gunzipSync(Buffer.from(payload.data,'base64'))),engine=ER.create(data);
const ui=fs.readFileSync('tools/elden-ring/ui.js','utf8');
const source=ui.slice(ui.indexOf('    function weaponCurvePoints('),ui.indexOf('    function renderWeaponCurves('));
const stats={vig:40,mnd:20,end:25,str:30,dex:25,int:30,fai:25,arc:34};
const enemy=data.enemies.find(e=>e.journey==='NG'&&e.name.includes('Margit'));
let cases=0;
for(const variant of data.variants.filter(v=>v.affinity_id===0).slice(0,40))for(const twoHand of [false,true]){
 const state={settings:{upgradeMode:'max',twoHand}},moves=[{id:'multi',physical:'Slash',hits:[100,70]}];
 for(const move of ['standard','multi','unsupported']){
  const context={engine,C:engine.catalogs,lastWeaponDetail:variant.id,derived:{stats},state,movesByWeapon:new Map([[variant.weapon_id,[...moves,{id:'unsupported',physical:'Mixed',hits:null}]]]),selectedEnemy:()=>enemy,multiplier:()=>1.4,$:id=>({value:id==='detail-move'?move:'Phys'})};
  vm.createContext(context);vm.runInContext(source+'; this.points=weaponCurvePoints;',context);
  for(const a of ER.ATTRS){const points=context.points(a,148);if(move==='unsupported'){assert.equal(points.length,0);continue;}
   assert.equal(points.length,148);
   for(const n of [1,stats[a],99,100,148]){
    const r=engine.weapon(variant,{...stats,[a]:n},{upgrade:engine.getUpgrade(variant,state.settings),twoHand});
    const expected=(move==='multi'?[100,70]:[100]).reduce((s,mv)=>s+engine.hitDamage(Object.fromEntries(Object.entries(r.attack).map(([t,x])=>[t,x*mv/100])),enemy,move==='multi'?'Slash':'Phys',1.4).total,0);
    assert.ok(Math.abs(points[n-1].damage-expected)<1e-8);assert.equal(points[n-1].usable,r.usable);cases++;
   }
  }
 }
}
console.log(`PASS: ${cases} curve samples; five attributes, requirements, 99/100/148, both hands, per-hit defense, multipliers, unsupported moves`);
