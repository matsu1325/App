// Embed the maintained UI module so the application remains a portable single HTML.
const fs = require('node:fs');
const path = require('node:path');
const dir=path.join(__dirname,'../apps');
const file=path.join(dir,fs.readdirSync(dir).find(x=>x.includes('Tsubaki')));
const start='/* TSUBAKI_UX_V5_START */', end='/* TSUBAKI_UX_V5_END */';
const source=fs.readFileSync(path.join(__dirname,'tsubaki-ux.js'),'utf8');
if(source.includes('</script'))throw new Error('Unsafe inline script content');
let html=fs.readFileSync(file,'utf8');
const moduleText=`${start}\n${source}\n${end}\n\n`;
if(html.includes(start))html=html.slice(0,html.indexOf(start))+moduleText+html.slice(html.indexOf(end)+end.length).replace(/^\s*\n/, '');
else html=html.replace('/* ---------- 初期化 ---------- */',moduleText+'/* ---------- 初期化 ---------- */');
fs.writeFileSync(file,html);
console.log('Embedded Tsubaki UX v5');
