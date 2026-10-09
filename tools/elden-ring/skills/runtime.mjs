import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';

export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function buildSkillRuntime(root){
  const dir=path.join(root,'data/elden-ring-skills/runtime');
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  const chunks=manifest.parts.map(part=>{
    if(!/^part-\d{3}\.b64$/.test(part.file))throw Error('Invalid skill runtime part');
    const bytes=fs.readFileSync(path.join(dir,part.file));
    if(bytes.length!==part.bytes||digest(bytes)!==part.sha256)throw Error('Skill runtime part hash mismatch');
    return bytes.toString('utf8');
  });
  const {parts,...header}=manifest,payload={...header,data:chunks.join('')};
  if(payload.encoding!=='gzip-base64')throw Error('Invalid skill runtime encoding');
  const raw=gunzipSync(Buffer.from(payload.data,'base64'));
  if(raw.length!==payload.raw_bytes||digest(raw)!==payload.sha256)throw Error('Skill runtime hash mismatch');
  const data=JSON.parse(raw);
  const index=fs.readFileSync(path.join(root,'data/elden-ring-skills/all/index.json'));
  const weapons=JSON.parse(fs.readFileSync(path.join(root,'data/elden-ring-payload.json')));
  if(data.schema!==1||data.source_index_sha256!==digest(index)||data.weapon_payload_sha256!==weapons.sha256)
    throw Error('Skill runtime belongs to a different source snapshot');
  return payload;
}
