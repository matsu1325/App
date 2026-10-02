import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
export function buildDpsRuntime(root) {
  const dir=path.join(root,'data/elden-ring-dps');
  const payload=JSON.parse(fs.readFileSync(path.join(dir,'payload.json'),'utf8'));
  const raw=gunzipSync(Buffer.from(payload.data,'base64'));
  if(createHash('sha256').update(raw).digest('hex')!==payload.sha256)throw Error('DPS payload hash mismatch');
  const data=JSON.parse(raw),reviewBytes=fs.readFileSync(path.join(dir,'readiness.json'));
  const review=JSON.parse(reviewBytes);
  if(review.base_payload_sha256!==payload.sha256)throw Error('DPS review belongs to another snapshot');
  const models={},blocked={};
  const physical={Standard:'Phys',Strike:'Strike',Slash:'Slash',Pierce:'Pierce'};
  for(const [id,p] of Object.entries(review.profiles)){
    if(p.status!=='model_candidate'){blocked[id]=p.blockers;continue;}
    const source=data.profiles[id];
    if(p.ranking_eligible!==false||!source||!Number.isFinite(p.cycle_seconds)||p.cycle_seconds<=0)throw Error('Invalid model');
    let duration=0;
    const hits=p.steps.map((s,i)=>{
      const binding=source.window_bindings.find(b=>b.animation_id===s.animation_id&&b.window_index===s.window_index);
      const a=data.attacks[s.attack_key]?.source_fields;
      if(!a||binding?.resolution!=='unique_applicable_reference'||binding.matched_attack_keys[0]!==s.attack_key
        ||s.next_animation_id!==p.steps[(i+1)%p.steps.length].animation_id)throw Error('Invalid model reference');
      if(data.animations[s.animation_id].speed_gradients.length)throw Error('Unsupported speed gradient');
      duration+=s.transition_source_frame;
      const mv=['physical','magic','fire','lightning','holy'].map(t=>a[t+'DamageMV']);
      if(mv.some(n=>!Number.isFinite(n)||n<0)||!physical[a.physAttribute])throw Error('Unsupported hit type');
      if(['physical','magic','fire','lightning','holy'].some(t=>a[t+'DamageFlat']!==0)
        ||['phys','magic','fire','lightning','holy'].some(t=>a[t+'DamageRateFinal']!==1))throw Error('Unsupported damage component');
      return {mv,physical:physical[a.physAttribute],time:s.cycle_hit_source_frame/30};
    });
    if(duration!==p.cycle_source_frames||Math.abs(duration/30-p.cycle_seconds)>1e-9)throw Error('Invalid cycle time');
    models[id]={seconds:p.cycle_seconds,hits};
  }
  return {schema:1,verification:'model-only',snapshot:payload.sha256,
    revision:createHash('sha256').update(reviewBytes).digest('hex'),models,blocked};
}
