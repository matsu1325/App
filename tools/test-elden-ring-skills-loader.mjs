import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildSkillRuntime,digest} from './elden-ring/skills/runtime.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'er-skill-loader-'));
try{
  const files=['data/elden-ring-skills/all/index.json','data/elden-ring-payload.json',
    'data/elden-ring-skills/simulator-coverage.csv','tools/elden-ring/skills/compile-runtime.mjs'];
  for(const file of files){const target=path.join(temp,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);}
  fs.cpSync(path.join(root,'data/elden-ring-skills/runtime'),path.join(temp,'data/elden-ring-skills/runtime'),{recursive:true});
  assert.equal(buildSkillRuntime(temp).sha256,buildSkillRuntime(root).sha256,'compact build needs no expanded parameter files');
  const corrupt=(file,error)=>{
    fs.appendFileSync(path.join(temp,file),'A');assert.throws(()=>buildSkillRuntime(temp),error);
    fs.copyFileSync(path.join(root,file),path.join(temp,file));
  };
  corrupt('data/elden-ring-skills/runtime/part-000.b64',/part hash mismatch/);
  corrupt('data/elden-ring-skills/all/index.json',/different source snapshot/);
  corrupt('tools/elden-ring/skills/compile-runtime.mjs',/compiler changed/);
  corrupt('data/elden-ring-skills/simulator-coverage.csv',/coverage hash mismatch/);
  const manifestFile='data/elden-ring-skills/runtime/manifest.json',manifest=JSON.parse(fs.readFileSync(path.join(temp,manifestFile)));
  manifest.sha256='0'.repeat(64);fs.writeFileSync(path.join(temp,manifestFile),JSON.stringify(manifest));
  assert.throws(()=>buildSkillRuntime(temp),/runtime hash mismatch/);
  if(process.argv.includes('--regenerate')){
    // Regenerate in an isolated checkout; preserve the user's workspace and compare exact published bytes.
    for(const dir of ['tools/elden-ring/skills','data/elden-ring-skills/all'])fs.cpSync(path.join(root,dir),path.join(temp,dir),{recursive:true});
    execFileSync(process.execPath,[path.join(temp,'tools/elden-ring/skills/compile-runtime.mjs')],{cwd:temp,stdio:'pipe'});
    const fresh=JSON.parse(fs.readFileSync(path.join(temp,manifestFile)));
    for(const file of [manifestFile,'data/elden-ring-skills/simulator-coverage.csv',...fresh.parts.map(p=>'data/elden-ring-skills/runtime/'+p.file)])
      assert.equal(digest(fs.readFileSync(path.join(temp,file))),digest(fs.readFileSync(path.join(root,file))),`nondeterministic ${file}`);
  }
  console.log('PASS: compact loader, corrupted part/raw hash, source/compiler/coverage mismatch'+(process.argv.includes('--regenerate')?', exact isolated regeneration':''));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
