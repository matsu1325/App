const assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib');
const Engine=require('./elden-ring/engine.js'),{optimize}=require('./elden-ring/optimizer.js');
const payload=JSON.parse(fs.readFileSync('data/elden-ring-payload.json'));
const data=JSON.parse(zlib.gunzipSync(Buffer.from(payload.data,'base64'))),e=Engine.create(data),S=Engine.STATS;
const blank=c=>e.validateState({schema:1,className:c.name_en,stats:{...c.stats},settings:{upgradeMode:'max'},weapons:[],armor:[],talismans:[],memorized:[],compare:[]});
let seed=0x20261108;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
const fast={yieldControl:()=>Promise.resolve()};
async function main(){
const start=performance.now();
// Independent enumeration of 3 bounded attack stats; other five held fixed.
for(let i=0;i<1000;i++){
 const c=data.classes[random(data.classes.length)],state=blank(c),v=data.variants[random(data.variants.length)];
 if(v.sorcery_tool||v.incantation_tool){i--;continue;}
 state.settings.twoHand=!!random(2);state.settings.upgradeMode='custom';state.settings.normal=random(26);state.settings.somber=random(11);
 if(i%3===0){const item=data.talismans.find(t=>data.effects[t.name_en]?.always&&Object.keys(data.effects[t.name_en].fields).some(k=>k.startsWith('add')));if(item)state.talismans[0]=item.id;}
 const chosen=[...Engine.ATTRS].sort(()=>0);for(let k=chosen.length-1;k>0;k--){const j=random(k+1);[chosen[k],chosen[j]]=[chosen[j],chosen[k]];}
 const free=new Set(chosen.slice(0,3)),lo={},hi={},bounds={};
 // A base at/above all raw requirements makes enumeration feasible in either handling.
 for(const a of S){lo[a]=Math.max(c.stats[a],v.requirements[a]||1);hi[a]=Math.min(99,lo[a]+(free.has(a)?3:0));bounds[a]={min:lo[a],max:hi[a]};}
 const extra=random(7),level=c.level+S.reduce((n,a)=>n+lo[a]-c.stats[a],0)+extra;
 let best=-Infinity,count=0;
 const visit=(j,remaining,stats)=>{if(j===8){if(remaining)return;const r=e.weapon(v,e.equipment({...state,stats}).stats,{twoHand:state.settings.twoHand,upgrade:e.getUpgrade(v,state.settings)});if(r.usable){best=Math.max(best,r.total);count++;}return;}const a=S[j];for(let n=lo[a];n<=hi[a]&&n-lo[a]<=remaining;n++)visit(j+1,remaining-n+lo[a],{...stats,[a]:n});};
 visit(0,extra,{});
 const input={state,variantId:v.id,targetLevel:level,mode:'respec',bounds},copy=JSON.stringify(input);
 if(!count)await assert.rejects(optimize(e,input,fast));else{
 const r=await optimize(e,input,fast);assert.ok(Math.abs(r.result.total-best)<1e-7,`${i} ${v.id}`);assert.equal(e.buildLevel(r.state),level);assert.ok(r.result.usable);
 for(const a of S)assert.ok(r.stats[a]>=lo[a]&&r.stats[a]<=hi[a]);
 }assert.equal(JSON.stringify(input),copy);
}
const c=data.classes[0],state=blank(c),v=data.variants.find(v=>!v.sorcery_tool&&!v.incantation_tool&&Object.keys(v.requirements).length===0)||data.variants[0];
const input={state,variantId:v.id,targetLevel:150,mode:'respec'};
const r=await optimize(e,input,fast);assert.equal(e.buildLevel(r.state),150);
const top=await optimize(e,{...input,targetLevel:713},fast);assert.ok(S.every(a=>top.stats[a]===99));
await assert.rejects(optimize(e,{...input,targetLevel:1},fast));
await assert.rejects(optimize(e,{...input,bounds:{str:{fixed:1}}},fast));
await assert.rejects(optimize(e,{...input,bounds:{vig:{min:50,max:40}}},fast));
const grow=await optimize(e,{...input,state:r.state,targetLevel:155,mode:'grow'},fast);for(const a of S)assert.ok(grow.stats[a]>=r.stats[a]);
await assert.rejects(optimize(e,{...input,state:r.state,targetLevel:149,mode:'grow'},fast));
const controller=new AbortController();await assert.rejects(optimize(e,input,{signal:controller.signal,onProgress:()=>controller.abort(),...fast}),{name:'AbortError'});
// All regulation rows are additive on their legal domain, both handling modes.
for(const v of data.variants)for(const twoHand of [false,true]){
 const stats=Object.fromEntries(S.map(a=>[a,Math.max(c.stats[a],v.requirements[a]||1)])),options={twoHand};
 const base=e.weapon(v,stats,options).total;
 const predicted=base+Engine.ATTRS.reduce((n,a)=>n+e.weapon(v,{...stats,[a]:99},options).total-base,0);
 const actual=e.weapon(v,{...stats,...Object.fromEntries(Engine.ATTRS.map(a=>[a,99]))},options).total;
 assert.ok(Math.abs(actual-predicted)<1e-7,v.id);
}
console.log(`PASS: 1,000 seeded exhaustive comparisons, 6,592 additive-model checks, growth/respec, equipment, constraints, cancellation, Lv713 (${Math.round(performance.now()-start)}ms)`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
