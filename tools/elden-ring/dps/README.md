# 連続DPS実装用データ（候補整理版）

本編・DLCの既存データを、アプリの武器／魔法IDから攻撃・時間情報へ接続できる形にしたものです。**DPS値や連打周期は未検証**です。701件の装備・魔法に対して1,189プロファイルを作り、参照先を解決できた範囲と残った課題を保存しています。

## ファイルと用途

| ファイル | 用途 |
|---|---|
| `../../../data/elden-ring-dps/payload.json` | 正規化JSONをgzip＋base64で圧縮。展開後SHA-256とサイズ付き |
| `../../../data/elden-ring-dps/coverage.json` | 件数、未対応プロファイル、参照解決状況、検証課題の集計 |
| `prepare.py` | 収集済み原資料から再生成する変換処理。標準Pythonのみ |
| `types.ts` | アプリ実装用の型定義。候補版では周期はnull、ランキング可否はfalse |
| `load.mjs` | ブラウザ／Node用の検証付き読込とプロファイル参照 |
| `validate.py` | 全プロファイルの参照、候補選択、係数対応、弾の欠落を検査 |
| `test.py` / `test-loader.mjs` | 二重計上防止・詠唱の対応・欠落・改ざん等の回帰テスト |

公開アプリにはまだ読み込ませていません。実装時はプロファイルと検証済みの周期データを接続します。このv1候補形式の値をそのままランキングに昇格させることはできません。

## 収録範囲

| テーブル | 件数 | 内容 |
|---|---:|---|
| entities | 701 | 武器488件＋魔法213件。既存IDと日本語名を継承 |
| profiles | 1,189 | 武器488×片手／両手＋地上詠唱213。候補なしも明示 |
| animations | 1,553 | 通常R1候補と魔法の地上モーション。発生窓・キャンセル窓・速度勾配・効果窓 |
| attacks | 1,657 | 上記の判定窓から参照される攻撃。属性倍率・固定値・物理属性等 |
| spell_coefficients | 523 | 既存の魔法成分係数。溜め・派生成分を分けたまま保持 |
| bullets | 1,082 | 攻撃参照の弾と、その派生先。発生数・間隔・子参照等 |

展開後は約7.4MB、格納ファイルは約423KBです。弓、クロスボウ、バリスタ、素手は今回の厳密なR1名称条件では候補がなく、武器の片手・両手それぞれ32件が候補なしとなります。戦技、二刀L1、騎乗、走り、ジャンプ攻撃のプロファイルは今後の対象です。

## 参照の経路

1. 既存の `weapon:2000000` / `spell:4000` を `entities` で参照。
2. `profiles["weapon:2000000:1h-r1"]` などで操作条件を選択。
3. `animation_ids` から `animations` の発生窓・キャンセル窓へ接続。
4. `window_bindings` で当該武器／魔法に対応する攻撃候補を選択。
5. 武器の威力情報は `attacks`、魔法は `coefficient_variant_ids` から `spell_coefficients` を参照。
6. 弾の詳細が必要なら `bullet_roots` から `bullets` の子参照を辿る。

`animation_ids` はID順に並べた候補一覧です。**コンボ順序ではありません。** 例えばロングソードには攻撃窓のない `1h R1 9` もあり、名称や番号から連撃を推測しません。魔法の地上候補も、始動・詠唱段・条件違いを含みます。`transition_edges` は未確定のため空配列です。

## 候補解決と二重計上防止

武器ID／魔法IDでモーションを特定した後、攻撃レコードの元資料の対応名称と完全一致する候補だけを `matched_attack_keys` に残します。日本語名や曖昧検索では結合しません。

- `unique_applicable_reference`：対応候補が1件。ヒット回数や周期の検証完了という意味ではありません。
- `multiple_applicable_references`：対応候補が複数。全部加算せず、追加条件を調べます。
- `no_applicable_reference`：判定窓に候補はあるが、その装備名では特定できません。
- `no_attack_reference`：その窓に攻撃参照がありません。始動窓なども含むため、データ欠落と同義ではありません。
- `missing_reference`：キーが示す攻撃レコード自体がありません。

今回の結合は一意5,658窓、複数717窓、対応候補なし318窓、攻撃参照なし557窓です。同一モーションを使う複数装備の窓はそれぞれ数えます。独立したヒット件数ではありません。

ロングソード初段の2候補は、同じ武器の2ヒットではなく、石鞘の剣との選択肢です。ロングソード用 `100200000:768` のみを選択します。輝石のつぶても `40000:2904` → `spell:4000:row:2` → 弾10400000という対応を保持し、大つぶて等の成分を加算しません。

## 時間・係数・未確定値

- 原資料の時間は `source_frame` として保存。`seconds_per_unit` はnull。描画FPSや30/60fpsを仮定して換算しません。
- `speed_gradients` と `DexterityCastingSpeed` 等の条件を保持し、速度変化を平坦化しません。
- `cancel_from_types` は種別であり、遷移先IDではありません。最短キャンセルから周期を決めません。
- 攻撃窓の長さ・弾のnumShoot・候補数を、実際の命中回数に置換しません。
- `source_fields` のMVは元の百分率表記です。`*Flat` と魔法の係数も異なる意味なので、ひとつの「ダメージ」へ統合していません。
- 欠損はnullまたは明示的な欠落リストで保持し、0・倍率1などで補完しません。
- 全プロファイルは `cycle_seconds: null`、`ranking_eligible: false`、`validation.status: unverified`。

攻撃参照レコードの欠落は0件。弾の派生先 **10501011** は収集元に存在せず、爆ぜる霊炎のプロファイルに `missing_bullet_reference` を付けています。弾グラフの巡回は訪問済み集合で終了させ、循環参照を無限ヒットとして展開しません。

## 読込例

```js
import { decodeDpsPayload, inspectDpsProfile } from './tools/elden-ring/dps/load.mjs';

const payload = await fetch('./data/elden-ring-dps/payload.json').then(r => r.json());
const data = await decodeDpsPayload(payload);
const view = inspectDpsProfile(data, 'weapon:2000000', '1h-r1');
console.log(view.entity.name_ja, view.profile.validation.blockers);
```

単体HTMLに組み込む場合はpayloadを埋め込み、読込関数に渡せます。`decodeDpsPayload` はgzip展開・サイズ上限・SHA-256・候補版状態を検査します。Web CryptoとDecompressionStreamが必要です。SHA-256は破損検出であり、発行者の署名ではありません。全件の関係検証はビルド時に `validate.py` で行います。

## 再生成と検証

リポジトリのルートで実行します。

```bash
python tools/elden-ring/dps/prepare.py --source-dir /path/to/elden-ring-data
python tools/elden-ring/dps/validate.py data/elden-ring-dps/payload.json
python tools/elden-ring/dps/test.py
node tools/elden-ring/dps/test-loader.mjs
```

展開JSONが必要なら生成時に `--expanded /tmp/elden-dps-expanded.json` を指定します。原資料は既存の `elden-ring-implementation-data.zip` の展開フォルダです。内容とハッシュはpayloadの `sources` に保持されます。`mtime=0` のgzipと安定した並び順で再生成し、同一環境での2回実行がバイト単位で一致することを確認しています。

## 版・出典・次の接続作業

原資料はFrame Data Explorerの1.17スナップショット、魔法係数は既存Planner由来の正規化データです。1.17.1との全差分、実機の連打時間、最終ダメージの一致は未確認です。出典のURL・ローカル原資料のSHA-256・係数の元シート行を残して追跡できます。既存の利用条件調査は `../DPS-DATA-PLAN.md` を参照してください。原本一式を追加したものではなく、選択した数値・参照情報の整理版です。

次は時間基準・再生速度・最終段から初段への遷移・命中回数を検証し、別の検証済みプロファイル形式を追加します。候補版を読めることと、正しいDPSを算出できることは別です。
