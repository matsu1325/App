import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';
import {digest} from './runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const dir=path.join(root,'data/elden-ring-skills/all');
if(!fs.existsSync(path.join(dir,'parameters.json')))
  execFileSync('python3',[path.join(root,'tools/elden-ring/skills/snapshot.py'),'unpack'],{cwd:root,stdio:'inherit'});
const indexBytes=fs.readFileSync(path.join(dir,'index.json')),index=JSON.parse(indexBytes);
for(const [file,entry] of Object.entries(index.files)){
  const bytes=fs.readFileSync(path.join(dir,file));
  if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)throw Error('Source changed: '+file);
}
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name+'.json')));
const sourceSkills=read('skills'),sourceActions=read('actions'),variants=read('attack-variants'),params=read('parameters');
const compatibility=read('compatibility'),animations=read('animations');
const weaponPayload=JSON.parse(fs.readFileSync(path.join(root,'data/elden-ring-payload.json')));
const weaponData=JSON.parse(gunzipSync(Buffer.from(weaponPayload.data,'base64')));
const names=new Map(weaponData.weapons.map(w=>[w.name_en,w]));
const physical={Standard:'Phys',Strike:'Strike',Slash:'Slash',Pierce:'Pierce'};
const types=['physical','magic','fire','lightning','holy'];
const curated={};
function label(skill,section,suffix,text,cost){
  const id=`${skill}:a${section}_${suffix}`;
  if(!sourceActions[id])throw Error('Curated action missing: '+id);
  curated[id]={label:text,fp:cost,scope:'base_cost_before_equipment_reductions; input_mapping_model_not_in_game_verified'};
}
for(const [skill,section,starts,normalFp] of [[100,600,['040000'],20],[101,601,['040000','040200','040300','044200'],9]]){
  for(const suffix of starts){label(skill,section,suffix,'L2',normalFp);label(skill,section,String(Number(suffix)+5).padStart(6,'0'),'L2（残りFP0）',0);}
}
for(const [skill,section,light,heavy] of [[114,614,10,15],[115,615,6,8],[1178,778,15,20]]){
  label(skill,section,'040060','構え → R1',light);label(skill,section,'040065','構え → R1（残りFP0）',0);
  label(skill,section,'040070','構え → R2',heavy);label(skill,section,'040075','構え → R2（残りFP0）',0);
}
label(4150,882,'040000','始動 L2',20);label(4150,882,'040005','始動 L2（残りFP0）',0);
label(4150,882,'040010','追撃部分（始動後）',10);label(4150,882,'040015','追撃部分（始動後・残りFP0）',0);

const components={},actions={},skills={};
const weaponIds=new Map(weaponData.variants.map(v=>[v.id,v.weapon_id]));
const knownSupport=new Set([301,600,601,602,603,604,605,606,650,651,654,700,701,800,801,802,1008,1010,1042,1053,1182,1197]);
function missingDependencies(roots){
  const seen=new Set(),missing=new Set(),pending=[...roots];
  while(pending.length){
    const key=pending.pop();if(seen.has(key))continue;seen.add(key);
    const node=params[key];
    if(!node?.fields){missing.add(key);continue;}
    for(const edge of node.edges)pending.push(edge.node);
  }
  return [...missing].sort();
}
function component(ref){
  if(components[ref])return components[ref];
  const v=variants[ref],node=params['attack:'+v?.refs.atkParamId],f=node?.fields;
  const mv=types.map(t=>node?.typed_mv[t]??null),flat=types.map(t=>node?.typed_flat[t]??null);
  const missing=missingDependencies(v?.parameter_roots||[]);
  let reason=null;
  if(!node)reason='missing_attack';
  else if(missing.length)reason='missing_dependency';
  else if(v.validation.raw_generated_mv!=='matched'||v.validation.raw_generated_flat!=='matched')reason='coefficient_mismatch';
  else if(v.behavior_connection==='unresolved_generated_connection')reason='unresolved_route';
  else if(v.refs.bulletId)reason='projectile_formula';
  else if(flat.some(x=>x!==0)||f.isAddBaseAtk||f.overwriteAttackElementCorrectId!==-1)reason='independent_scaling';
  else if(f.throwFlag||f.throwTypeId)reason='grab_condition';
  else if(f.atkBehaviorId||f.atkBehaviorId_2||f.isArrowAtk)reason='special_behavior';
  else if(f.isDisableBothHandsAtkBonus!==1)reason='both_hand_bonus';
  else if(!physical[v.source_fields.physAttribute]||mv.some(x=>!Number.isFinite(x)||x<0)||!mv.some(x=>x>0))reason='non_damage';
  const result={attack_id:v?.refs.atkParamId??null,bullet_id:v?.refs.bulletId??null,mv,flat,
    physical:physical[v?.source_fields.physAttribute]??null,reason,missing_dependencies:missing,
    provenance:{source:'attacks.json',key:ref,parameter:'AtkParam_Pc.json'}};
  components[ref]=result;return result;
}
for(const source of Object.values(sourceSkills)){
  if(source.classification!=='player_linked_candidate')continue;
  const defaults=new Set(source.availability.default_weapon_ids);
  const compatible=new Set(source.availability.compatibility_variant_ids);
  const ashes=weaponData.ashes.filter(a=>a.skill_id===source.skill_id);
  const users=new Set(source.actions.flatMap(id=>animations[sourceActions[id].animation_id].users
    .filter(user=>user.type==='Weapon').map(user=>user.name)));
  const availabilityEvidence={};
  const legal=weaponData.variants.filter(v=>{
    const w=weaponData.weapons.find(w=>w.id===v.weapon_id);
    const paramId=w.game_id+(v.affinity_id<0?0:v.affinity_id*100);
    let evidence=defaults.has(v.weapon_id)?'default_weapon':w.allow_ash_of_war===true&&compatible.has(paramId)?'reference_compatibility_sheet':null;
    // The sheet omits DLC ashes. Cross-check raw category and affinity flags with actual animation users.
    if(!evidence&&(!compatible.size||!compatibility[paramId])&&w.allow_ash_of_war===true&&users.has(w.name_en)){
      const category=weaponData.regulation.weapons[v.source_regulation_index].weaponType;
      // Non-infusible bows/perfume bottles can change ashes. Their -1 variant is the original affinity.
      const affinity=v.affinity_id<0?0:v.affinity_id;
      if(ashes.some(ash=>ash.types.includes(category)&&params['gem:'+ash.id.split(':')[1]]?.fields[
        'configurableWepAttr'+String(affinity).padStart(2,'0')]===1))
        evidence='raw_category_affinity_and_animation_user_candidate';
    }
    if(evidence==='raw_category_affinity_and_animation_user_candidate')availabilityEvidence[v.id]=evidence;
    return !!evidence;
  }).map(v=>v.id);
  const ids=[];
  for(const aid of source.actions){
    const a=sourceActions[aid];
    const windows=a.windows.map(window=>{
      const bindings={};
      for(const [name,binding] of Object.entries(window.weapon_bindings)){
        const weapon=names.get(name);if(!weapon)continue;
        if(binding.resolution==='unique_or_exact_alias'){
          const ref=binding.exact_alias_groups[0][0];component(ref);bindings[weapon.id]={ref};
        }else{
          const refs=binding.matched_refs;
          for(const ref of refs)component(ref);
          bindings[weapon.id]={refs,reason:refs.length?'ambiguous_components':'missing_binding'};
        }
      }
      return {index:window.index,type:window.source_type,range:window.source_range,bindings,
        reason:window.candidate_refs.length?null:'missing_binding'};
    });
    const mapped=curated[aid];
    const actionWeapons=[...new Set(animations[a.animation_id].users.filter(user=>user.type==='Weapon')
      .map(user=>names.get(user.name)?.id).filter(Boolean))];
    const kind=a.windows.length?'attack_candidate':source.name_en==='Kick'?'attack_reference_missing':
      knownSupport.has(source.skill_id)?'support_action':'action_reference_missing';
    actions[aid]={id:aid,skill_id:source.skill_id,label:mapped?.label??a.source_label,
      source_label:a.source_label,fp:mapped?.fp??null,fp_branch:a.fp_branch_label,
      cost_scope:mapped?.scope??'input_cost_unmapped',windows,weapon_ids:actionWeapons,kind,
      missing_dependencies:a.missing_dependency_nodes,
      calculation_blocker:a.missing_dependency_nodes.length?'missing_dependency':null,
      source_blockers:a.blockers,provenance:{animation_id:a.animation_id,source:'animations.json'}};
    ids.push(aid);
  }
  const effects=source.candidate_effect_roots.filter(key=>params[key]).map(key=>{
    const f=params[key].fields;
    return {id:params[key].parameter_id,duration:params[key].duration_seconds_raw,
      enemy_rates:['Physics','Magic','Fire','Thunder','Dark'].map(t=>f['atkEnemyDmgCorrectRate_'+t]??null),
      player_rates:['Physics','Magic','Fire','Thunder','Dark'].map(t=>f['atkPlayerDmgCorrectRate_'+t]??null),
      activation_verified:false};
  });
  skills[source.skill_id]={id:source.skill_id,name_ja:source.name_ja,name_en:source.name_en,
    costs:Object.fromEntries(Object.entries(source.costs).map(([key,cost])=>[key,cost.fp])),
    legal_variants:legal,availability_evidence:availabilityEvidence,actions:ids,effects,blockers:source.validation.blockers,
    missing_dependencies:source.missing_dependency_nodes||[],kind:knownSupport.has(source.skill_id)?'support_candidate':'attack_or_unresolved_candidate'};
}
for(const skill of Object.values(skills)){
  const bases=[...new Set(skill.legal_variants.map(id=>weaponIds.get(id)))],reasons=new Set();
  const counts={complete_actions:0,partial_actions:0,unmodeled_actions:0,actions_without_hit_data:0,mapped_fp_actions:0};
  for(const id of skill.actions){
    const a=actions[id];let best=0;
    if(a.fp!==null)counts.mapped_fp_actions++;
    if(!a.windows.length){counts.actions_without_hit_data++;reasons.add(a.kind);}
    if(!a.weapon_ids.length||!bases.some(wid=>a.weapon_ids.includes(wid)))reasons.add('action_weapon_unverified');
    if(a.fp===null)reasons.add('input_cost_unmapped');
    if(a.calculation_blocker)reasons.add(a.calculation_blocker);
    for(const wid of bases){
      if(!a.weapon_ids.includes(wid)||!a.windows.length||a.calculation_blocker)continue;
      const modeled=a.windows.filter(window=>{
        const b=window.bindings[wid],c=components[b?.ref];
        const reason=window.reason||b?.reason||(!c?'missing_binding':c.reason);
        if(reason)reasons.add(reason);
        return !reason;
      }).length;
      best=Math.max(best,modeled===a.windows.length?2:modeled?1:0);
    }
    if(best===2)counts.complete_actions++;else if(best===1)counts.partial_actions++;else counts.unmodeled_actions++;
  }
  skill.coverage={...counts,status:counts.complete_actions?'complete_action_candidate':counts.partial_actions?'partial_only':'unmodeled',reasons:[...reasons].sort()};
}
const summary={catalog_rows:Object.keys(skills).length,action_candidates:Object.keys(actions).length,
  skills_with_weapon_component:Object.values(skills).filter(s=>s.coverage.status!=='unmodeled').length,
  skills_with_complete_action:Object.values(skills).filter(s=>s.coverage.status==='complete_action_candidate').length,
  skills_partial_only:Object.values(skills).filter(s=>s.coverage.status==='partial_only').length,
  skills_unmodeled:Object.values(skills).filter(s=>s.coverage.status==='unmodeled').length,
  actions_without_hit_data:Object.values(actions).filter(a=>!a.windows.length).length,
  mapped_fp_actions:Object.values(actions).filter(a=>a.fp!==null).length,
  skills_without_legal_weapons:Object.values(skills).filter(s=>!s.legal_variants.length).length,
  measured_skills:0};
const runtime={schema:1,version:'1.17',verification:'conditional_weapon_mv_model',
  contract_revision:2,
  source_index_sha256:digest(indexBytes),weapon_payload_sha256:weaponPayload.sha256,summary,skills,actions,components};
const raw=Buffer.from(JSON.stringify(runtime)),payload={encoding:'gzip-base64',sha256:digest(raw),raw_bytes:raw.length,
  data:gzipSync(raw,{level:9,mtime:0}).toString('base64')};
fs.writeFileSync(path.join(root,'data/elden-ring-skills/runtime.json'),JSON.stringify(payload)+'\n');
const output=path.join(root,'data/elden-ring-skills/runtime');
fs.mkdirSync(output,{recursive:true});
const parts=[];
for(let offset=0;offset<payload.data.length;offset+=96000){
  const bytes=Buffer.from(payload.data.slice(offset,offset+96000)),file=`part-${String(parts.length).padStart(3,'0')}.b64`;
  fs.writeFileSync(path.join(output,file),bytes);parts.push({file,bytes:bytes.length,sha256:digest(bytes)});
}
const {data,...header}=payload;
const csvValue=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
const columns=['skill_id','name_ja','name_en','kind','status','weapon_variants','actions','complete_actions','partial_actions','unmodeled_actions','actions_without_hit_data','mapped_fp_actions','missing_dependencies','reasons','version','measured'];
const csv=Object.values(skills).map(s=>[s.id,s.name_ja,s.name_en,s.kind,s.coverage.status,s.legal_variants.length,s.actions.length,
  ...['complete_actions','partial_actions','unmodeled_actions','actions_without_hit_data','mapped_fp_actions'].map(k=>s.coverage[k]),
  s.missing_dependencies.join(';'),s.coverage.reasons.join(';'),'1.17',false].map(csvValue).join(','));
const coverageBytes=Buffer.from([columns.join(','),...csv].join('\n')+'\n');
fs.writeFileSync(path.join(root,'data/elden-ring-skills/simulator-coverage.csv'),coverageBytes);
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({...header,parts,
  compiler_sha256:digest(fs.readFileSync(fileURLToPath(import.meta.url))),coverage_sha256:digest(coverageBytes)},null,2)+'\n');
console.log(JSON.stringify({...summary,raw_bytes:raw.length,packed_bytes:JSON.stringify(payload).length}));
