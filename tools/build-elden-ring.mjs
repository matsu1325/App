import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {buildDpsRuntime} from './elden-ring/dps/runtime.mjs';
import {buildSkillRuntime} from './elden-ring/skills/runtime.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const enemyNames=JSON.parse(fs.readFileSync(path.join(root,'tools/elden-ring/enemy-names-ja.json'),'utf8'));
const payload=JSON.parse(fs.readFileSync(path.join(root,'data/elden-ring-payload.json'),'utf8'));
const enemies=JSON.parse(gunzipSync(Buffer.from(payload.data,'base64'))).enemies;
const missing=[...new Set(enemies.filter(e=>typeof enemyNames[e.name]!=='string'||!/[ぁ-んァ-ヶ一-龠]/.test(enemyNames[e.name])).map(e=>e.name))];
if(missing.length)throw new Error('Missing Japanese enemy names: '+missing.join(', '));
let html=fs.readFileSync(path.join(root,'tools/elden-ring/template.html'),'utf8');
for(const [token,file] of [['__ER_PAYLOAD__','data/elden-ring-payload.json'],['__ER_ENGINE__','tools/elden-ring/engine.js'],['__ER_OPTIMIZER__','tools/elden-ring/optimizer.js'],['__ER_UI__','tools/elden-ring/ui.js'],['__ER_SKILL_UI__','tools/elden-ring/skills/ui.js']]){
  const content=fs.readFileSync(path.join(root,file),'utf8');
  if(content.includes('</script'))throw new Error('Unexpected closing script tag in '+file);
  html=html.replace(token,()=>content.trim());
}
html=html.replace('__ER_DPS_DATA__',()=>JSON.stringify(buildDpsRuntime(root)));
html=html.replace('__ER_SKILL_DATA__',()=>JSON.stringify(buildSkillRuntime(root)));
const enemyNamesJson=JSON.stringify(enemyNames);
if(enemyNamesJson.includes('</script'))throw new Error('Unexpected closing script tag in enemy names');
html=html.replace('__ER_ENEMY_NAMES_JA__',()=>enemyNamesJson);
// Stamp the source revision, not the build clock: offline copies and repeated
// builds keep the same release identity, including Pages' generated-file commits.
const release=execFileSync('git',['log','-1','--format=%cI%x00%h','--',
  'tools/elden-ring','tools/build-elden-ring.mjs','data/elden-ring-payload.json',
  'data/elden-ring-dps','data/elden-ring-skills'],{cwd:root,encoding:'utf8'}).trim().split('\0');
const releaseDate=new Date(release[0]);
if(!Number.isFinite(releaseDate.getTime())||!/^[0-9a-f]+$/.test(release[1]||''))throw new Error('Missing release source revision');
const releaseLabel=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(releaseDate);
html=html.replace('__ER_RELEASE_ISO__',releaseDate.toISOString()).replace('__ER_RELEASE_DATE__',releaseLabel).replace('__ER_RELEASE_REV__',release[1]);
if(/__ER_\w+__/.test(html))throw new Error('Unreplaced build token');
const dest=path.join(root,'apps/elden-ring-build-helper.html');fs.writeFileSync(dest,html);console.log(`${dest}: ${Buffer.byteLength(html)} bytes`);
