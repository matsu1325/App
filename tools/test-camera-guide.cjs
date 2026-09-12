// Run: node tools/test-camera-guide.cjs
// Logic tests use a minimal DOM stub; these are not browser or real-camera tests.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');const elements=new Map;const el=id=>{if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',hidden:false,value:'camera',classList:{toggle:()=>true},addEventListener(){},setAttribute(){},querySelectorAll(){return []}});return elements.get(id)};const saved=new Map;const ctx=vm.createContext({document:{getElementById:el,querySelectorAll:()=>[]},window:{scrollTo(){}},navigator:{},location:{protocol:'file:'},structuredClone,console,confirm:()=>true,localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)}});const html=fs.readFileSync(require('node:path').join(__dirname,'../apps/camera-settings-guide.html'),'utf8');vm.runInContext(html.match(/<script>\n([\s\S]*?)<\/script>/)[1],ctx);

vm.runInContext(String.raw`
let tested=0;
function check(v,msg){if(!v)throw Error(msg);}
function scenario(scene,overrides={},body=null){state=fresh();state.hasPlan=true;state.scene=scene;FIELDS.forEach(([id],i)=>state.conditions[id]=sceneValue(scene,i));Object.assign(state.conditions,overrides);if(body)state.gear.forEach(g=>{if(g.type!=='lens')g.active=g.id===body;});result();tested++;return current;}
// Intent-based expectations, independent of the numerical scoring formula.
let r=scenario('発表会',{light:'暗い舞台・室内'});check(r.b.id==='h2s'&&r.l.ft<=2.8,'dark stage bright tracking kit');
r=scenario('街歩き');check(r.b.id==='gr','light street compact');
r=scenario('運動会');check(r.b.af===3&&r.tele>=200&&currentSettings.ss>=1000,'sport AF/reach/shutter');
r=scenario('運動会',{priority:'荷物を減らす'});check(r.l.min<=20&&r.l.max>=200,'event one lens wide to tele');
r=scenario('入園・卒園・入学',{people:'集団'});check(r.wide<=35&&currentSettings.f>=5.6,'group framing and depth');
r=scenario('食事・料理');check(r.b.id==='gr'&&currentSettings.f>=4&&currentSettings.note.includes('12〜24cm'),'food macro depth');
r=scenario('風景');check(r.b.id==='gfx'&&r.wide<30&&currentSettings.f>=8,'landscape quality');
r=scenario('夜景',{support:'三脚・固定'});check(currentSettings.tripod&&currentSettings.iso<=160&&currentSettings.ss<1,'tripod long exposure');check(currentSettings.rows.find(x=>x[0]==='ISO AUTO上限')[1]==='使用しない','fixed ISO label');
for(const t of TROUBLES){fix(t);check(!$('fixText').innerHTML.includes('1/0.'),'fractional denominator advice');check(!$('fixText').innerHTML.includes('ISO上限'),'fixed ISO correction');}
r=scenario('夜景',{support:'三脚・固定',motion:'普通'});check(!currentSettings.tripod&&currentSettings.ss>=500,'tripod does not freeze subject');
r=scenario('夜景',{framing:'遠くの一部',distance:'遠距離'});check(r.target>=250&&r.tele>=150,'tele night framing');
r=scenario('学校・幼稚園行事',{people:'集団',distance:'遠距離'});check(r.target<250,'group needs wider field than single subject');
r=scenario('子どもの日常',{light:'暗い舞台・室内',motion:'激しい'});check(r.l.ft<=2.8&&currentSettings.ss>=500,'dark child motion');check(currentSettings.note.includes('では不足'),'exposure shortfall not silently ignored');
r=scenario('旅行',{light:'明るい室内'});const bright=currentSettings.note;check(bright.includes('EV10'),'explicit light override');
r=scenario('360度記録');check(currentSettings.is360,'360 branch');
r=scenario('子どもの日常',{motion:'激しい',priority:'背景ボケ'},'gr');currentSettings.ss=2000;fix('ブレる');check(!$('fixText').innerHTML.includes('1/4000'),'GR open-aperture shutter cap');fix('ピントが外れる');check(!$('fixText').innerHTML.includes('ゾーン'),'GR no zone AF');
r=scenario('子どもの日常',{motion:'激しい',priority:'背景ボケ'},'x100');currentSettings.ss=2000;fix('ブレる');check(!$('fixText').innerHTML.includes('1/4000'),'X100 aperture shutter cap');
r=scenario('入園・卒園・入学',{people:'集団'});for(const t of ['ISOが上がりすぎる','背景がうるさい']){fix(t);check($('fixText').innerHTML.includes('維持'),'preserve group depth');}
for(const body of ['h2s','t30','x100','gfx','a7c','gr']){r=scenario('室内',{light:'暗い舞台・室内'},body);fix('暗い');check(!$('fixText').innerHTML.includes('25600'),'ISO AUTO conservative supported ceiling');}
// Mobility, framing tolerance and detail are based on properties, not favorite model IDs.
r=scenario('旅行');check(candidates.some(x=>x.b.id==='x100'),'travel includes capable fixed lens kit');
r=scenario('街歩き');check(candidates.some(x=>x.b.id==='x100'),'street includes fixed lens alternative');
r=scenario('旅行',{priority:'画質'});check(candidates.some(x=>x.b.id==='x100'),'travel detail option');
r=scenario('運動会');check(!candidates.some(x=>x.b.id==='x100'),'do not force fixed lens into distant sports');
r=scenario('旅行',{},'x100');const nativeScore=r.rawScore;state.gear=[{...r.b,id:'generic-fixed-camera',custom:true}];check(rank()[0].rawScore===nativeScore,'same properties same score regardless of camera ID');
state.conditions.priority='画質';const highDetail=rank()[0].rawScore;state.gear[0].mp=26.1;check(rank()[0].rawScore<highDetail,'resolution matters when detail is wanted');
state.conditions.priority='軽さ';const heavier=rank()[0].rawScore;state.gear[0].weight=300;check(rank()[0].rawScore>heavier,'lighter same-spec camera scores higher for mobility');
state.conditions.distance='遠距離';check(framingTolerance()===1,'no near-range tolerance at distance');
// All initial scenarios, then cross lighting / support / framing / motion boundaries.
for(const scene of Object.keys(SCENES))for(const light of FIELDS[7][2])for(const support of FIELDS[8][2])for(const framing of FIELDS[9][2])for(const motion of ['静止','激しい']){
 scenario(scene,{light,support,framing,motion});
 for(const rr of candidates){const ss=setting(rr);check(ss.f>=rr.l.ft,'aperture availability');check(ss.is360||ss.ss<=shutterLimit(rr.b,ss.f),'shutter availability');check(Number.isFinite(rr.rawScore),'finite score');check(ss.rows.every(x=>typeof x[1]==='string'&&!/undefined|NaN|Infinity/.test(x[1])),'valid labels');}
 for(const t of TROUBLES){fix(t);check(!/undefined|NaN|Infinity|1\/0\./.test($('fixText').innerHTML),'correction labels');}
}
console.log(tested+' scenario evaluations and all 7 corrective actions PASS');
`,ctx);
