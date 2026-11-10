/* Pure Tsubaki.3 compiler. Presets below are independently written, not official quotations. */
const T3Core = (() => {
 const presets=[
 ['line','線を明瞭に','Clean, precise contours and readable silhouettes.',''],
 ['detail','情報量を増やす','Rich environmental detail and carefully rendered materials.',''],
 ['contrast','深い明暗','Deep shadows and strong directional highlights.','light'],
 ['flat','フラット塗り','Uniform flat colors without shadows, gradients or highlights.','flat'],
 ['mono','モノクロ漫画','Monochrome ink drawing with screentones.','mono'],
 ['cel','セルアニメ','Anime cel shading with clear color separation.','color'],
 ['background','背景の質感','Subtle realistic textures in the background.',''],
 ['3d','3D感','Smooth modeled forms with soft volumetric lighting.','light']
 ].map(([id,label,text,group])=>({id,label,text,group,version:1}));
 const styles={anime:'Render as an anime illustration with clear contours and readable shapes.',manga:'Render as a monochrome manga with expressive ink lines and screentones.',watercolor:'Render as a watercolor illustration with soft pigment transitions and paper texture.',photo:'Use photographic textures and natural perspective.',lineart:'Render as uncolored line art.',flat:'Use uniform flat colors without shading or gradients.'};
 function compile(t){
  const blocks=[],diagnostics=[];const add=(block,text,path)=>{if(text?.trim())blocks.push({block,text:text.trim(),sourcePaths:[path]});};
  const warn=(msg,path)=>diagnostics.push({type:'warn',msg,sourcePaths:[path]});
  const editing=['edit','referenceEdit'].includes(t.task), people=t.people||[], quality=t.qualityBlocks||[];
  const content=[t.request,t.appearance,t.outfit,t.pose,t.scene,t.text,...(t.charas||[]),...people.map(p=>[p.name,p.tag,p.appearance,p.outfit,p.pose].join(''))].some(x=>x?.trim());
  if(!content){warn('描きたい内容・変更したい箇所を入力してください。','request');return {blocks,diagnostics};}
  if(editing)add('chara','Edit @image1 as the source image.','task');
  if(t.task!=='generate'){
   if(t.ref1?.trim())add('chara',`${editing?'Source image context:':'Create a new image using @image1 as the reference for'} ${t.ref1Role&&t.ref1Role!=='custom'?t.ref1Role+': ':''}${t.ref1.trim()}.`,'ref1');
   else if(!editing)add('chara',`Use @image1 as the reference for ${t.ref1Role&&t.ref1Role!=='custom'?t.ref1Role:"the character's identity"}.`,'ref1');
   if(t.ref2?.trim()||t.ref2Role&&t.ref2Role!=='custom')add('chara',`Use @image2 only as the reference for ${t.ref2Role&&t.ref2Role!=='custom'?t.ref2Role+': ':''}${t.ref2||''}.`,'ref2');
   if(t.task==='referenceEdit'&&!t.ref2?.trim()&&(!t.ref2Role||t.ref2Role==='custom'))warn('@image2の役割を指定してください。','ref2');
  }
  const include=k=>!editing||(t.editFields||[]).includes(k);
  const effects=()=>{
   if(!t.styleLora&&include('style')){add('style',styles[t.style],'style');add('style',t.styleDetail,'styleDetail');quality.forEach(p=>add('quality',p.text,'qualityBlocks'));}
   if(include('light'))add('aes',t.light,'light');if(include('camera'))add('aes',t.camera,'camera');
  };
  if(!editing)effects();
  add('subject',t.request,'request');
  (t.charas||[]).filter(c=>!people.some(p=>p.tag===c)).forEach(c=>add('chara',c,'charas'));
  const aliases=new Set();people.forEach((p,i)=>{const alias=p.promptAlias||p.name||`Character-${i+1}`;
   if(aliases.has(alias))warn('人物の呼称が重複しています。人物別に異なる呼称を指定してください。','people');aliases.add(alias);
   add('chara',[`Character: ${alias}.`,p.tag,p.position&&`Position: ${p.position}.`,!(p.appearancePolicy==='external-lora'||t.characterLora)&&p.appearance,p.outfit&&`Outfit: ${p.outfit}`,p.pose&&`Action: ${p.pose}`].filter(Boolean).join('\n'),'people');
  });
  if(!t.characterLora)add('look',t.appearance,'appearance');add('look',t.outfit,'outfit');add('pose',t.pose,'pose');add('scene',t.scene,'scene');
  if(editing)effects();
  if(t.text?.trim())add('tpl',`${t.textRole||'text'}: ${JSON.stringify(t.text)}. ${t.textPlace?'Place it at '+t.textPlace+'. ':''}Render the text exactly as written, preserving its spelling and language.`,'text');
  if(include('layout'))add('aes',t.layout,'layout');
  if(t.task!=='generate'&&t.keep?.trim())add('look',`Preserve ${t.keep.trim()}.`,'keep');
  if(editing)add('look','Keep all elements outside the explicitly requested changes unchanged.','keep');
  const groups=new Set(quality.map(x=>x.group));
  if((groups.has('flat')||['flat','lineart'].includes(t.style))&&(groups.has('light')||t.light?.trim()))warn('影なし・線画と、明暗または光の指定が併存しています。','qualityBlocks');
  if((groups.has('mono')||t.style==='manga')&&groups.has('color'))warn('モノクロとカラーの指定が併存しています。','qualityBlocks');
  if(people.length>1&&[t.appearance,t.outfit,t.pose].some(x=>x?.trim()))warn('共通の外見・衣装・動作が複数人物に適用されます。特定人物の条件は人物別欄へ移してください。','people');
  const prose=[t.request,t.appearance,t.outfit,t.pose,t.scene,...people.flatMap(p=>[p.appearance,p.outfit,p.pose])].join(' ');
  if(/[\u3040-\u30ff\u4e00-\u9fff]/.test(prose))diagnostics.push({type:'info',msg:'日本語の草案です。精密な英語整形は「AI連携」の指示文を利用できます。画像内の文字は翻訳しません。'});
  if(/@image(?:[3-9]|\d{2,})\b/.test(blocks.map(b=>b.text).join('\n')))warn('この作業台の参照案内は@image1・@image2です。追加の参照指定を確認してください。','request');
  return {blocks,diagnostics};
 }
 return {presets,compile};
})();
if(typeof module!=='undefined')module.exports=T3Core;
