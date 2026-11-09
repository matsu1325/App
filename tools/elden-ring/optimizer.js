/* Exact internal-AR optimization for the bundled, additive weapon model.
 * Equipment and handling stay fixed. This is not a game-data accuracy claim. */
(function(root){
'use strict';
const Constraints=typeof module!=='undefined'&&module.exports?require('./build-constraints.js'):root.ERBuildConstraints;
const Comparison=typeof module!=='undefined'&&module.exports?require('./build-comparison.js'):root.ERBuildComparison;
const STATS=['vig','mnd','end','str','dex','int','fai','arc'];
async function optimize(engine,input,{signal,onProgress=()=>{},yieldControl=()=>new Promise(r=>setTimeout(r,0))}={}){
  const check=()=>{if(signal?.aborted){const e=new Error('探索を中断しました');e.name='AbortError';throw e;}};
  const prepared=input.optimizerSettings?Constraints.prepare(engine,input):null;
  if(prepared)input={...input,mode:prepared.settings.mode,bounds:prepared.settings.bounds};
  const state=prepared?prepared.state:engine.validateState(input.state),c=engine.data.classes.find(c=>c.name_en===state.className);
  const target=input.targetLevel;
  if(!Number.isInteger(target)||target<c.level||target>713)throw Error('目標レベルは素性の初期レベル〜713で指定してください');
  if(!['respec','grow'].includes(input.mode))throw Error('育成または振り直しを選んでください');
  const v=engine.catalogs.variants.get(input.variantId);
  if(!v)throw Error('武器が不明です');
  if(v.sorcery_tool||v.incantation_tool)throw Error('触媒の魔法威力最適化は未対応です');
  if(input.mode==='grow'&&STATS.some(a=>state.stats[a]<c.stats[a]))throw Error('現在値が素性の初期値を下回っています');
  const options={twoHand:state.settings.twoHand,upgrade:engine.getUpgrade(v,state.settings)};
  const effective=stats=>engine.equipment({...state,stats}).stats;
  const evaluate=stats=>engine.weapon(v,effective(stats),options);
  const lo={},hi={};
  for(const a of STATS){
    const bounds=input.bounds?.[a]||{};
    if(Object.keys(bounds).some(k=>!['min','max','fixed'].includes(k)))throw Error('不明な制約です');
    for(const n of Object.values(bounds))if(!Number.isInteger(n)||n<1||n>99)throw Error('制約は1〜99の整数にしてください');
    lo[a]=Math.max(c.stats[a],input.mode==='grow'?state.stats[a]:1,bounds.min??1,prepared?.minima[a]??1);
    hi[a]=bounds.max??99;
    if(bounds.fixed!==undefined){lo[a]=Math.max(lo[a],bounds.fixed);hi[a]=Math.min(hi[a],bounds.fixed);}
    if(lo[a]>hi[a])throw Error((Constraints.LABEL[a]||a)+' の上下限・固定値が要求と矛盾しています'+(prepared?.reasons[a]?.length?'：'+prepared.reasons[a].join(' / '):''));
  }
  // Requirements use the exact equipment clamp and handling path, including auto-2H bows.
  for(const a of STATS){
    while(lo[a]<=hi[a]&&evaluate(lo).missing.some(m=>m.stat===a))lo[a]++;
    if(lo[a]>hi[a])throw Error(a+' の上限では武器の必要能力値を満たせません');
  }
  const sum=o=>STATS.reduce((n,a)=>n+o[a],0);
  const budget=target-c.level+sum(c.stats)-sum(lo);
  if(budget<0)throw Error(`指定レベルでは不足します。必要最低レベル ${target-budget}（あと${-budget}ポイント）`+(prepared?'\n'+STATS.filter(a=>lo[a]>c.stats[a]).map(a=>`${Constraints.LABEL[a]} ${lo[a]}以上：${prepared.reasons[a].join(' / ')||'指定した固定・下限'}`).join('\n'):''));
  if(budget>sum(hi)-sum(lo))throw Error('能力の上限・固定値により全ポイントを配分できません');
  const base=evaluate(lo);
  if(!base.usable)throw Error('必要能力値を満たせません');
  const tables=[];
  for(let i=0;i<STATS.length;i++){
    check();const a=STATS[i],values=[];
    for(let n=lo[a];n<=hi[a];n++)values.push(evaluate({...lo,[a]:n}).total-base.total);
    tables.push(values);onProgress({phase:'準備',completed:i+1,total:16});await yieldControl();
  }
  // engine.weapon() is a sum of independent stat curves once requirements are met.
  // Fail closed if a future model introduces interactions.
  for(const stats of [hi,Object.fromEntries(STATS.map(a=>[a,Math.floor((lo[a]+hi[a])/2)]))]){
    const predicted=base.total+STATS.reduce((n,a,i)=>n+tables[i][stats[a]-lo[a]],0);
    if(Math.abs(evaluate(stats).total-predicted)>1e-7)throw Error('この武器の非独立補正には未対応です');
  }
  let dp=new Float64Array(budget+1).fill(-Infinity);dp[0]=0;
  const paths=[];
  for(let i=0;i<STATS.length;i++){
    check();const next=new Float64Array(budget+1).fill(-Infinity),path=new Int16Array(budget+1).fill(-1);
    for(let p=0;p<=budget;p++)if(Number.isFinite(dp[p]))for(let n=0;n<tables[i].length&&p+n<=budget;n++){
      const score=dp[p]+tables[i][n];
      if(score>next[p+n]){next[p+n]=score;path[p+n]=n;}
    }
    dp=next;paths.push(path);onProgress({phase:'探索',completed:i+9,total:16});await yieldControl();
  }
  check();if(!Number.isFinite(dp[budget]))throw Error('合法な配分がありません');
  const stats={...lo};let p=budget;
  for(let i=7;i>=0;i--){const n=paths[i][p];if(n<0)throw Error('探索経路が不正です');stats[STATS[i]]=lo[STATS[i]]+n;p-=n;}
  const next=engine.validateState({...state,...(prepared?{optimizerSettings:prepared.settings}:{}),stats,settings:{...state.settings,targetLevel:target}}),result=evaluate(stats),current=evaluate(state.stats);
  if(p!==0||engine.buildLevel(next)!==target||!result.usable||Math.abs(result.total-base.total-dp[budget])>1e-7)throw Error('最終検査に失敗しました');
  if(prepared)Constraints.verify(engine,prepared,next);
  return {...(prepared?{comparison:Comparison.compare(engine,prepared,next,input.combat),constraintReport:{minima:prepared.minima,reasons:prepared.reasons},dataVersion:input.dataVersion||null}:{}),state:next,stats,current,result,delta:result.total-current.total,method:'exact-additive-dp',objective:'internal-ar',verification:'reference-data',mode:input.mode,targetLevel:target,variantId:v.id};
}
const api={optimize};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.EROptimizer=api;
})(typeof globalThis!=='undefined'?globalThis:this);
