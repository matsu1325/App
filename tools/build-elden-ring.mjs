import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let html=fs.readFileSync(path.join(root,'tools/elden-ring/template.html'),'utf8');
for(const [token,file] of [['__ER_PAYLOAD__','data/elden-ring-payload.json'],['__ER_ENGINE__','tools/elden-ring/engine.js'],['__ER_UI__','tools/elden-ring/ui.js']]){
  const content=fs.readFileSync(path.join(root,file),'utf8');
  if(content.includes('</script'))throw new Error('Unexpected closing script tag in '+file);
  html=html.replace(token,()=>content.trim());
}
if(/__ER_\w+__/.test(html))throw new Error('Unreplaced build token');
const dest=path.join(root,'apps/elden-ring-build-helper.html');fs.writeFileSync(dest,html);console.log(`${dest}: ${Buffer.byteLength(html)} bytes`);
