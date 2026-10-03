import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {buildDpsRuntime} from './elden-ring/dps/runtime.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const enemyNames=JSON.parse(fs.readFileSync(path.join(root,'tools/elden-ring/enemy-names-ja.json'),'utf8'));
const payload=JSON.parse(fs.readFileSync(path.join(root,'data/elden-ring-payload.json'),'utf8'));
const enemies=JSON.parse(gunzipSync(Buffer.from(payload.data,'base64'))).enemies;
const missing=[...new Set(enemies.filter(e=>typeof enemyNames[e.name]!=='string'||!/[ぁ-んァ-ヶ一-龠]/.test(enemyNames[e.name])).map(e=>e.name))];
if(missing.length)throw new Error('Missing Japanese enemy names: '+missing.join(', '));
let html=fs.readFileSync(path.join(root,'tools/elden-ring/template.html'),'utf8');
for(const [token,file] of [['__ER_PAYLOAD__','data/elden-ring-payload.json'],['__ER_ENGINE__','tools/elden-ring/engine.js'],['__ER_UI__','tools/elden-ring/ui.js']]){
  const content=fs.readFileSync(path.join(root,file),'utf8');
  if(content.includes('</script'))throw new Error('Unexpected closing script tag in '+file);
  html=html.replace(token,()=>content.trim());
}
html=html.replace('__ER_DPS_DATA__',()=>JSON.stringify(buildDpsRuntime(root)));
const enemyNamesJson=JSON.stringify(enemyNames);
if(enemyNamesJson.includes('</script'))throw new Error('Unexpected closing script tag in enemy names');
html=html.replace('__ER_ENEMY_NAMES_JA__',()=>enemyNamesJson);
if(/__ER_\w+__/.test(html))throw new Error('Unreplaced build token');
const dest=path.join(root,'apps/elden-ring-build-helper.html');fs.writeFileSync(dest,html);console.log(`${dest}: ${Buffer.byteLength(html)} bytes`);
