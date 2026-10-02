/* Run: node tools/test-elden-ring.cjs
 * Optional full reference comparison:
 * ER_REFERENCE_DIR=/path/to/research/raw/weapon-calculator node tools/test-elden-ring.cjs
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),Engine=require('./elden-ring/engine.js');
const payload=JSON.parse(fs.readFileSync(path.join(root,'data/elden-ring-payload.json'),'utf8'));
const bytes=zlib.gunzipSync(Buffer.from(payload.data,'base64'));
assert.equal(bytes.length,payload.raw_bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),payload.sha256);
const data=JSON.parse(bytes),e=Engine.create(data);
const fixturePath=path.join(__dirname,'elden-ring/fixtures.json');
const stats={vig:40,mnd:20,end:25,str:30,dex:25,int:30,fai:25,arc:34};
const state={schema:1,name:'試験ビルド',stats,className:'Vagabond',settings:{upgradeMode:'max',normal:25,somber:10,twoHand:false,scadu:0,inShadow:false,manualMultiplier:1,memory:10},weapons:Array(6).fill(''),armor:Array(4).fill(''),talismans:Array(4).fill(''),memorized:[],compare:[],catalyst:'',enemy:data.enemies[0].id};
function close(a,b,label){assert.ok(Math.abs(a-b)<1e-8,`${label}: ${a} != ${b}`);}
function compare(r,w,label){for(const k of ['attackPower','spellScaling']){const a=k==='attackPower'?r.attack:r.spellScaling;for(let t=0;t<12;t++)close(a[t]||0,w[k][t]||0,label+'/'+k+'/'+t);}assert.deepEqual(r.missing.map(m=>m.stat),w.ineffectiveAttributes);}
async function run(){
  assert.equal(data.weapons.length,488);assert.equal(data.variants.length,3296);assert.equal(data.spells.length,213);assert.equal(data.armor.length,722);assert.equal(data.talismans.length,154);
  let referenceCount=0;
  if(process.env.ER_REFERENCE_DIR){
    const dir=path.resolve(process.env.ER_REFERENCE_DIR),decoder=await import(pathToFileURL(path.join(dir,'src/regulationData.ts'))),calc=await import(pathToFileURL(path.join(dir,'src/calculator/calculator.ts')));
    const original=decoder.decodeRegulationData(data.regulation),fixtures=[];
    const profiles=[{str:14,dex:13,int:9,fai:9,arc:7},{str:80,dex:20,int:9,fai:9,arc:7},{str:18,dex:22,int:80,fai:40,arc:50},{str:99,dex:99,int:99,fai:99,arc:99}];
    for(let i=0;i<data.variants.length;i++)for(let p=0;p<profiles.length;p++){
      const v=data.variants[i],w=original[v.source_regulation_index],upgrade=p%2?w.attack.length-1:Math.floor((w.attack.length-1)/2),twoHand=p%2===1;
      const expected=calc.default({weapon:w,attributes:profiles[p],upgradeLevel:upgrade,twoHanding:twoHand});
      const actual=e.weapon(v,profiles[p],{upgrade,twoHand});compare(actual,expected,v.id+'/'+p);referenceCount++;
      if(i%70===0||v.sorcery_tool||v.incantation_tool)fixtures.push({id:v.id,stats:profiles[p],upgrade,twoHand,expected});
    }
    fs.writeFileSync(fixturePath,JSON.stringify({reference:'ThomasJClark b8a1cf8847fe67aacc7f8fcb038a9cfd6725f19a',cases:fixtures}));
  }
  const fixtures=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
  for(const f of fixtures.cases)compare(e.weapon(f.id,f.stats,{upgrade:f.upgrade,twoHand:f.twoHand}),f.expected,f.id);
  // Bow auto two-handing, paired weapons, max-stat extrapolation and immutable inputs.
  for(const v of data.variants){const before=JSON.stringify(stats),r=e.weapon(v,stats,{upgrade:e.getUpgrade(v,state.settings),twoHand:true});assert.equal(JSON.stringify(stats),before);assert.ok(Number.isFinite(r.total));}
  const eq=e.equipment(state);assert.equal(eq.hp,1450);assert.equal(eq.fp,data.stats.fp[20]);assert.equal(eq.roll,'軽量');
  const sore=data.talismans.find(t=>t.name_en==="Radagon's Soreseal");const modified=structuredClone(state);modified.talismans[0]=sore.id;
  const bonus=e.equipment(modified);assert.equal(bonus.stats.str,35);assert.equal(bonus.stats.vig,45);close(bonus.negation[0],-15,'soreseal penalty');
  const jar=data.talismans.find(t=>t.name_en==="Great-Jar's Arsenal");modified.talismans[1]=jar.id;close(e.equipment(modified).load,bonus.load*1.19,'load bonus');
  const clash=data.talismans.filter(t=>t.group===sore.group);modified.talismans[2]=clash.find(t=>t.id!==sore.id).id;assert.throws(()=>e.validateState(modified),/同じ系統/);
  const bad=structuredClone(state);bad.stats.int=NaN;assert.throws(()=>e.validateState(bad));bad.stats.int=100;assert.throws(()=>e.validateState(bad));bad.stats.int=50;bad.weapons=['injected'];assert.throws(()=>e.validateState(bad));
  const armorBad=structuredClone(state);armorBad.armor[0]=data.armor.find(a=>a.slot==='Body').id;assert.throws(()=>e.validateState(armorBad),/部位/);
  const parsed=e.validateState({...state,name:'<script>悪意</script>',settings:{...state.settings,scadu:999}});assert.equal(parsed.settings.scadu,20);assert.equal(parsed.name,'<script>悪意</script>'); // UI escapes text; engine does not emit HTML.
  close(e.defenseDamage(100,100,0),40,'defense ratio 1');close(e.defenseDamage(250,100,0),175,'ratio 2.5');close(e.defenseDamage(800,100,0),720,'ratio 8');close(e.defenseDamage(12,100,0),1.2,'ratio .12');close(e.defenseDamage(100,100,50),20,'negation');assert.equal(e.defenseDamage(100,null,10),null);
  const mage={...stats,int:80,fai:80,arc:80,str:40,dex:40};
  const staff=data.variants.find(v=>v.name_en==='Carian Regal Scepter'),pebble=data.spellVariants.find(v=>v.name_en==='Glintstone Pebble');
  const power=e.spell(pebble,staff.id,mage,state.settings);assert.ok(power.usable);close(power.power[1],power.catalyst.spellScaling[1]*1.52,'pebble coefficient');
  const seal=data.variants.find(v=>v.name_en==='Finger Seal');assert.equal(e.spell(pebble,seal.id,mage,state.settings).correctTool,false);
  const utility=data.spellVariants.find(v=>v.name_en==='Starlight');assert.equal(e.spell(utility,staff.id,mage,state.settings).total,null);
  const same=e.validateState(JSON.parse(JSON.stringify(state)));assert.deepEqual(same.stats,state.stats);
  console.log(`PASS: ${fixtures.cases.length} committed calculation fixtures; ${referenceCount} full reference comparisons; data, equipment, defense, spell and import checks`);
}
run().catch(error=>{console.error(error);process.exitCode=1;});
