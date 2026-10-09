// Embedded inside the main UI closure; shares validated build state and enemy selection.
    const skillReasons={incompatible_weapon:'この戦技と武器・派生の組み合わせは適合表にありません',
      requirements:'要求能力不足です。能力値または持ち方を変更してください',
      no_action_model:'この武器で計算できる攻撃動作がありません',missing_binding:'この判定の武器別攻撃参照が未解決です',
      projectile_formula:'飛び道具の独自補正式・命中条件は未対応です',
      independent_scaling:'固定成分・独自の能力値補正は未対応です',special_behavior:'固有の攻撃処理を確認中です',
      both_hand_bonus:'この攻撃の両手補正は未確認です',ambiguous_components:'同じ判定の複数成分を合算できるか未確認です',
      unresolved_route:'元パラメータと攻撃参照の接続が未解決です',coefficient_mismatch:'攻撃係数の照合が未完了です',
      non_damage:'武器ARによるダメージモデルがありません',missing_attack:'攻撃パラメータが不足しています',
      enemy_data:'選択した敵の防御データが不足しています',no_selected_hits:'命中させる判定を選んでください',
      invalid_selection:'命中判定の選択を確認してください',invalid_multiplier:'攻撃力倍率を確認してください',invalid_fp:'消費FPの指定を確認してください'};
    const skillPhysical={Phys:'標準',Strike:'打撃',Slash:'斬撃',Pierce:'刺突'};
    const sortedSkills=Object.values(skillData.skills).sort((a,b)=>name(a).localeCompare(name(b),'ja')||a.id-b.id);
    function setSkillSelection(patch){
      const old=state.skillSimulation;
      state.skillSimulation=engine.validateSkillSettings({...old,...patch});
      update();
    }
    function useSkillWeapon(id){
      const v=C.variants.get(id);if(!v)return;
      const skillId=C.weapons.get(v.weapon_id)?.default_skill_id;
      if(!skillData.skills[skillId]){toast('この武器の既定戦技は攻撃モデルの対象外です');return;}
      setSkillSelection({skillId,variantId:id,actionId:'',selectedWindows:null});
      $('detail-dialog').close();lastWeaponDetail='';activate('skills');
    }
    function renderSkills(){
      state.skillSimulation=engine.validateSkillSettings(state.skillSimulation);
      const choice=state.skillSimulation,skill=skillData.skills[choice.skillId],q=lower($('skill-search').value);
      const visible=sortedSkills.filter(s=>s.id===choice.skillId||!q||lower(name(s)+' '+s.name_en).includes(q));
      $('skill-select').innerHTML=visible.map(s=>option(s.id,`${name(s)}${s.effects.length?' · バフ候補あり':''}`,s.id===choice.skillId)).join('');
      $('skill-count').textContent=`全${skillData.summary.catalog_rows}候補 · 武器攻撃成分のモデルあり ${skillData.summary.skills_with_weapon_component}候補 · 実機未検証`;
      const variants=engine.skillVariants(choice.skillId),weaponIds=[...new Set(variants.map(v=>v.weapon_id))];
      const v=C.variants.get(choice.variantId);
      $('skill-weapon').innerHTML=weaponIds.map(id=>option(id,name(C.weapons.get(id)),id===v?.weapon_id)).join('')||option('','適合する武器資料なし');
      $('skill-affinity').innerHTML=variants.filter(x=>x.weapon_id===v?.weapon_id).map(x=>option(x.id,AFFINITY[x.affinity_id]||x.affinity_id,x.id===v?.id)).join('')||option('','派生資料なし');
      const actions=engine.skillActions(choice.skillId,choice.variantId),action=skillData.actions[choice.actionId];
      $('skill-action').innerHTML=actions.map(a=>option(a.id,a.label+(a.cost_scope==='input_cost_unmapped'?'（資料の動作）':''),a.id===choice.actionId)).join('')||option('','攻撃動作のモデルなし');
      $('skill-fp-override').value=choice.fpOverride??'';$('skill-fp-override').disabled=!action||action.fp!==null;
      $('skill-use-equipped').disabled=!state.weapons[0];
      $('skill-for-enemy').textContent='対象敵：'+jpEnemy(selectedEnemy());
      $('skill-costs').textContent=Object.entries(skill.costs).filter(([,fp])=>fp!==null).map(([key,fp])=>`${key} ${fp} FP`).join(' / ')+'（装備によるFP軽減は未適用）';
      const result=engine.skillSimulation(choice.variantId,derived.stats,{...choice,
        upgrade:v?engine.getUpgrade(v,state.settings):undefined,twoHand:state.settings.twoHand,
        multiplier:multiplier(),scope:'enemy',enemy:selectedEnemy()});
      $('skill-total').textContent=number(result.total,1);$('skill-power').textContent=number(result.power,1);
      $('skill-fp').textContent=number(result.fp);$('skill-efficiency').textContent=number(result.damagePerFp,1);
      $('skill-fp-label').textContent=result.fpSource==='manual'?'指定したFP（仮定）':'選択動作の基礎FP';
      $('skill-conditions').textContent=v?`${weaponName(v)} · +${engine.getUpgrade(v,state.settings)} · ${statsLabel(derived.stats)} · ${state.settings.twoHand?'両手':'片手'} · 攻撃力倍率 ${number(multiplier(),2)}倍${skill.availability_evidence[v.id]?' · 装着可否は原フラグと動作資料からの候補（個別例外は未確認）':''}`:'';
      $('skill-status').textContent=result.status==='model_only'?'選択した各判定が1回命中する仮定で計算しています。':
        result.status==='partial'?`未計算の判定があるため合計は表示しません。計算できた成分の小計：${number(result.modeledTotal,1)}。`:
        skillReasons[result.reasons[0]]||'バフ・移動などの効果は、発動・消費条件を確認中です。';
      const selected=choice.selectedWindows??action?.windows.map(w=>w.index)??[];
      $('skill-hits').innerHTML=action?`<h3>命中させる判定</h3><p class="field-note">各判定は1回命中の仮定。距離などに応じて外すと、選択した成分だけを計算します。</p><div class="skill-hit-list">${action.windows.map(window=>{
        const hit=result.hits.find(h=>h.index===window.index),binding=window.bindings[v?.weapon_id],c=skillData.components[binding?.ref||binding?.refs?.[0]];
        const reason=hit?.reason||window.reason||binding?.reason||c?.reason||(!binding?'missing_binding':null);
        const mv=c?.mv.map((n,i)=>n?DAMAGE[i]+' '+n+'%':null).filter(Boolean).join(' / ');
        return `<article class="equip-card"><label class="check"><input type="checkbox" data-skill-hit="${window.index}"${selected.includes(window.index)?' checked':''}>判定 ${window.index+1} · ${window.type==='Bullet'?'飛び道具':c?.physical?skillPhysical[c.physical]:'未分類'}</label><strong>${hit?.selected?number(hit.damage,1):'対象外'}${hit?.damage!=null?' ダメージ':''}</strong><p class="field-note">${esc(reason?skillReasons[reason]||reason:mv||'攻撃係数なし')}</p>${reason&&c?.flat.some(n=>n>0)?`<p class="field-note">固定成分の原値：${c.flat.map((n,i)=>n?DAMAGE[i]+' '+n:null).filter(Boolean).join(' / ')}（最終威力は未計算）</p>`:''}<small>判定範囲 ${window.range.join('〜')} 資料フレーム${c?.attack_id?' · 攻撃ID '+c.attack_id:''}</small></article>`;
      }).join('')}</div>`:'<p class="notice">攻撃ダメージを0として扱わず、未計算のまま表示します。</p>';
      $('skill-effects').innerHTML=skill.effects.length?`<h3>参照できた追加効果</h3><p class="field-note">名称から結び付く候補です。発動・消費・重複は未確認で、上のダメージには自動適用しません。</p>${skill.effects.map(e=>`<p class="muted">効果 ${e.id} · 持続 ${e.duration>=0?e.duration+'秒':'未確定'}${e.enemy_rates.some(x=>x!==null&&x!==1)?' · 対敵倍率 '+e.enemy_rates.map((rate,i)=>rate!==null&&rate!==1?DAMAGE[i]+' '+rate+'倍':null).filter(Boolean).join(' / '):''}</p>`).join('')}`:'';
      $('skill-evidence').textContent=action?`版 ${skillData.version} / ${action.provenance.animation_id} / ${action.source_label}`:`版 ${skillData.version} / 戦技ID ${skill.id}`;
    }
