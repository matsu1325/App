import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function run(binary,args){execFileSync(binary,args,{cwd:root,stdio:'inherit',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',ER_OFFLINE_HTTP:'1'}});}
run(process.execPath,['tools/build-elden-ring.mjs']);
for(const file of ['test-elden-ring.cjs','test-elden-ring-dps.cjs','test-elden-ring-planning.cjs','test-elden-ring-curves.cjs','test-elden-ring-skills.cjs','test-elden-ring-skills-loader.mjs'])run(process.execPath,['tools/'+file]);
run('python3',['-m','unittest','discover','-s','tools/elden-ring/skills','-p','test_*.py']);
run('python3',['tools/elden-ring/skills/snapshot.py','unpack']);
run('python3',['tools/elden-ring/skills/verify.py']);
run(process.execPath,['tools/test-elden-ring-skills-loader.mjs','--regenerate']);
if(!process.argv.includes('--no-browser'))for(const file of ['test-elden-ring-ui.cjs','test-elden-ring-workshop-ui.cjs','test-elden-ring-skills-ui.cjs'])run(process.execPath,['tools/'+file]);
