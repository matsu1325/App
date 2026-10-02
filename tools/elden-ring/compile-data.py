#!/usr/bin/env python3
"""Compile factual calculation fields from the collected research snapshot.

Usage: python3 tools/elden-ring/compile-data.py --source-dir ../elden-ring-data
The original snapshot is retained separately; do not publish full source workbooks.
"""
import argparse, base64, gzip, hashlib, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--source-dir', type=Path, required=True)
args = parser.parse_args()
SRC = args.source_dir.resolve()
def read(p): return json.loads((SRC / p).read_text())
index = read('tables/index.json')
def table(book, sheet):
    return read(next(s['path'] for b in index['workbooks'] if b['source_id'] == book for s in b['sheets'] if s['sheet'] == sheet))
effects = {}
fields = ['addLifeForceStatus','addWillpowerStatus','addEndureStatus','addStrengthStatus','addDexterityStatus','addMagicStatus','addFaithStatus','addLuckStatus','maxHpRate','maxMpRate','maxStaminaRate','equipWeightChangeRate','neutralDamageCutRate','blowDamageCutRate','slashDamageCutRate','thrustDamageCutRate','magicDamageCutRate','fireDamageCutRate','thunderDamageCutRate','darkDamageCutRate','defEnemyDmgCorrectRate_Physics','defEnemyDmgCorrectRate_Magic','defEnemyDmgCorrectRate_Fire','defEnemyDmgCorrectRate_Thunder','defEnemyDmgCorrectRate_Dark']
for r in read('normalized/planner-effect-parameters.json'):
    if r.get('Name') and r['Name'] not in effects:
        effects[r['Name']] = {'text': r.get('Effects', ''), 'always': r.get('conditionHp', -1) == -1 and r.get('conditionHpRate', -1) == -1,
                             'fields': {k:r[k] for k in fields if k in r}, 'row': r['_source']['row']}
weapons = [{k:w.get(k) for k in ['id','game_id','name_en','name_ja','weight','category','dlc','default_skill_id','allow_ash_of_war','is_buffable']} for w in read('normalized/weapons.json')]
variants = read('normalized/weapon-variants.json')
spells = read('normalized/spells.json')
sv = [{k:v[k] for k in ['id','spell_id','attack_id','name_en','fp','charged_fp','stamina','charged_stamina','typed_attack_coefficient','only_int','only_faith','no_scale']} for v in read('normalized/spell-variants.json')]
armor=[]
for a in read('normalized/armor.json'):
    p=a['parameters'] or {}
    armor.append({k:a[k] for k in ['id','game_id','name_en','name_ja','slot']} | {'weight':p.get('weight'), 'cuts':[p.get(k) for k in ['neutralDamageCutRate','magicDamageCutRate','fireDamageCutRate','thunderDamageCutRate','darkDamageCutRate']], 'poise':p.get('toughnessCorrectRate'), 'resists':[p.get(k) for k in ['resistPoison','resistDisease','resistBlood','resistFreeze','resistSleep','resistMadness','resistCurse']]})
talismans=[{k:t[k] for k in ['id','game_id','name_en','name_ja']} | {'weight':t['parameters']['weight'],'group':t['parameters']['accessoryGroup']} for t in read('normalized/talismans.json')]
enemies=[]
types=['Phys','Magic','Fire','Ltng','Holy']
for e in read('normalized/enemies.json'):
    enemies.append({'id':e['id'],'journey':e['journey'],'name':e['name_en'],'location':e['location'],'hp':e['hp'],'defense':[e['defense'].get(k) for k in types],'negation':[e['negation_percent'].get(k) for k in types], 'physical':{k:[e['defense'].get(k),e['negation_percent'].get(k)] for k in ['Phys','Strike','Slash','Pierce']},'status':e['status_thresholds'],'poise':e['poise']})
moves=[]
for m in read('normalized/weapon-moves.json'):
    if m['weapon_id']:
        moves.append({'id':m['id'],'weapon':m['weapon_id'],'name':m['move'],'hits':m['damage_motion_values'],'raw':m['motion_value_source'],'physical':m['other_properties'].get('Physical AtkAttribute'),'status':m['other_properties'].get('Status MVs'),'poise':m['other_properties'].get('Poise Damage - PvE'),'stamina':m['other_properties'].get('Stamina Cost'),'pvp':m['other_properties'].get('PvP Dmg Mult')})
stats={}
for label,sheet in [('hp','Vigor'),('fp','Mind'),('stamina','Endurance')]:
    stats[label]={str(r['cells']['A']):r['cells']['B'] for r in table('player-stats',sheet)['rows'] if isinstance(r['cells'].get('A'),int)}
stats['load']={str(r['cells']['A']):r['cells']['B'] for r in table('build-planner','RollTypeData')['rows'] if isinstance(r['cells'].get('A'),int)}
scadu={'0':{'attack':1,'remaining':1}}
for r in table('misc-effects','Effects - ScadutreeRevered')['rows']:
    c=r['cells']
    if isinstance(c.get('B'),int) and isinstance(c.get('C'),(int,float)):
        scadu[str(c['B'])]={'attack':c['C'],'remaining':c['F']}
mount_keys=['Dagger','SwordNormal','SwordLarge','SwordGigantic','SaberNormal','SaberLarge','katana','SwordDoubleEdge','SwordPierce','RapierHeavy','AxeNormal','AxeLarge','HammerNormal','HammerLarge','Flail','SpearNormal','SpearLarge','SpearAxe','Sickle','Knuckle','Claw','Whip','AxhammerLarge','BowSmall','BowNormal','BowLarge','ClossBow','Ballista','Staff','Sorcery','Talisman','ShieldSmall','ShieldNormal','ShieldLarge','Torch','HandToHand','PerfumeBottle','ThrustingShield','ThrowingWeapon','ReverseHandSword','LightGreatsword','GreatKatana','BeastClaw']
mount_ids=[1,3,5,7,9,11,13,14,15,16,17,19,21,23,24,25,28,29,31,35,37,39,41,50,51,53,55,56,57,59,61,65,67,69,87,88,89,90,91,92,93,94,95]
ashes=[]
for a in read('normalized/ashes-of-war.json'):
    ashes.append({k:a[k] for k in ['id','name_en','name_ja','skill_id']} | {'types':[i for k,i in zip(mount_keys,mount_ids) if a['parameters'].get('canMountWep_'+k)==1]})
art_names=read('normalized/localization.json')['tables']['ArtsName']
skills={str(r['Row ID']):{'name_en':r['Row Name'],'name_ja':art_names.get(str(r['Row ID']),{}).get('ja')} for r in read('raw/frame-data/SwordArtsParam.json')}
sources=read('source-manifest.json')['sources']
data={'schema':1,'version':'1.17 snapshot / 1.17.1 reference sheets','collected':'2026-10-01','regulation':read('normalized/weapon-regulation.json'),'weapons':weapons,'variants':variants,'spells':spells,'spellVariants':sv,'armor':armor,'talismans':talismans,'effects':effects,'enemies':enemies,'moves':moves,'stats':stats,'scadu':scadu,'classes':read('normalized/starting-classes.json'),'ashes':ashes,'sources':[{'id':s['id'],'url':s['url'],'sha256':s['sha256'],'version':s.get('game_version'),'license':s.get('license')} for s in sources], 'mit':(SRC/'raw/weapon-calculator/COPYING').read_text()}
data['skills']=skills
raw=json.dumps(data,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
payload={'encoding':'gzip-base64','sha256':hashlib.sha256(raw).hexdigest(),'raw_bytes':len(raw),'data':base64.b64encode(gzip.compress(raw,compresslevel=9,mtime=0)).decode()}
(ROOT/'data/elden-ring-payload.json').write_text(json.dumps(payload,separators=(',',':'))+'\n')
print(json.dumps({'raw_bytes':len(raw),'compressed_bytes':len(payload['data']),'weapons':len(weapons),'variants':len(variants),'spells':len(spells),'moves':len(moves),'enemy_records':len(enemies)}))
