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
const compatibility=read('compatibility');
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
function component(ref){
  if(components[ref])return components[ref];
  const v=variants[ref],node=params['attack:'+v?.refs.atkParamId],f=node?.fields;
  const mv=types.map(t=>node?.typed_mv[t]??null),flat=types.map(t=>node?.typed_flat[t]??null);
  let reason=null;
  if(!node)reason='missing_attack';
  else if(v.validation.raw_generated_mv!=='matched'||v.validation.raw_generated_flat!=='matched')reason='coefficient_mismatch';
  else if(v.behavior_connection==='unresolved_generated_connection')reason='unresolved_route';
  else if(v.refs.bulletId)reason='projectile_formula';
  else if(flat.some(x=>x!==0)||f.isAddBaseAtk||f.overwriteAttackElementCorrectId!==-1)reason='independent_scaling';
  else if(f.atkBehaviorId||f.atkBehaviorId_2||f.isArrowAtk)reason='special_behavior';
  else if(f.isDisableBothHandsAtkBonus!==1)reason='both_hand_bonus';
  else if(!physical[v.source_fields.physAttribute]||mv.some(x=>!Number.isFinite(x)||x<0)||!mv.some(x=>x>0))reason='non_damage';
  const result={attack_id:v?.refs.atkParamId??null,bullet_id:v?.refs.bulletId??null,mv,flat,
    physical:physical[v?.source_fields.physAttribute]??null,reason,
    provenance:{source:'attacks.json',key:ref,parameter:'AtkParam_Pc.json'}};
  components[ref]=result;return result;
}
for(const source of Object.values(sourceSkills)){
  if(source.classification!=='player_linked_candidate')continue;
  const defaults=new Set(source.availability.default_weapon_ids);
  const compatible=new Set(source.availability.compatibility_variant_ids);
  const ashes=weaponData.ashes.filter(a=>a.skill_id===source.skill_id);
  const users=new Set(source.actions.flatMap(id=>sourceActions[id].windows.flatMap(window=>Object.keys(window.weapon_bindings))));
  const availabilityEvidence={};
  const legal=weaponData.variants.filter(v=>{
    const w=weaponData.weapons.find(w=>w.id===v.weapon_id);
    const paramId=w.game_id+(v.affinity_id<0?0:v.affinity_id*100);
    let evidence=defaults.has(v.weapon_id)?'default_weapon':w.allow_ash_of_war===true&&compatible.has(paramId)?'reference_compatibility_sheet':null;
    // The sheet omits DLC ashes. Cross-check raw category and affinity flags with actual animation users.
    if(!evidence&&(!compatible.size||!compatibility[paramId])&&w.allow_ash_of_war===true&&users.has(w.name_en)&&v.affinity_id>=0){
      const category=weaponData.regulation.weapons[v.source_regulation_index].weaponType;
      if(ashes.some(ash=>ash.types.includes(category)&&params['gem:'+ash.id.split(':')[1]]?.fields[
        'configurableWepAttr'+String(v.affinity_id).padStart(2,'0')]===1))
        evidence='raw_category_affinity_and_animation_user_candidate';
    }
    if(evidence==='raw_category_affinity_and_animation_user_candidate')availabilityEvidence[v.id]=evidence;
    return !!evidence;
  }).map(v=>v.id);
  const ids=[];
  for(const aid of source.actions){
    const a=sourceActions[aid];if(!a.windows.length)continue;
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
    actions[aid]={id:aid,skill_id:source.skill_id,label:mapped?.label??a.source_label,
      source_label:a.source_label,fp:mapped?.fp??null,fp_branch:a.fp_branch_label,
      cost_scope:mapped?.scope??'input_cost_unmapped',windows,
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
    legal_variants:legal,availability_evidence:availabilityEvidence,actions:ids,effects,blockers:source.validation.blockers};
}
const sourceActionsForWeapon=(s,wid)=>s.actions.some(id=>actions[id].windows.some(window=>{
  const ref=window.bindings[wid]?.ref;return ref&&components[ref].reason===null;
}));
const summary={catalog_rows:Object.keys(skills).length,action_candidates:Object.keys(actions).length,
  skills_with_weapon_component:Object.values(skills).filter(s=>s.legal_variants.some(vid=>sourceActionsForWeapon(s,weaponData.variants.find(v=>v.id===vid).weapon_id))).length,
  measured_skills:0};
const runtime={schema:1,version:'1.17',verification:'conditional_weapon_mv_model',
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
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({...header,parts},null,2)+'\n');
console.log(JSON.stringify({...summary,raw_bytes:raw.length,packed_bytes:JSON.stringify(payload).length}));
