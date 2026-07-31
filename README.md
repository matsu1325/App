# 器械台帳

自作の単一HTMLアプリを GitHub Pages に置き、一覧・検索・オフライン利用できるようにする台帳。
HTMLを `apps/` に投げ込めば、あとは自動で台帳に載る。

---

## 一度だけやること

### 1. リポジトリを作る

公開リポジトリを作り、この一式をそのまま置いて push する。

```bash
git init
git add -A
git commit -m "台帳を据える"
git branch -M main
git remote add origin https://github.com/ユーザ名/リポジトリ名.git
git push -u origin main
```

### 2. Pages の公開元を Actions にする

**Settings → Pages → Build and deployment → Source** を
**「GitHub Actions」** に変える。（「Deploy from a branch」ではない）

これで push のたびに `.github/workflows/register.yml` が

1. `apps/` を走査して `apps.json` を作り直す
2. 差分があればコミットする
3. Pages に公開する

を通しでやる。所要はおよそ1分。

公開先は `https://ユーザ名.github.io/リポジトリ名/`。

> `raw.githubusercontent.com` は HTML を `text/plain` で返すので、
> そのままでは画面にならない。必ず Pages 経由で開くこと。

### 3. 合鍵を作る（投函所を使う場合のみ）

GitHub → Settings → Developer settings → **Fine-grained personal access tokens**

- Repository access: このリポジトリだけ
- Permissions → Repository permissions → **Contents: Read and write**

生成された `github_pat_…` を控える。投函所の合鍵欄に入れると
その端末の localStorage にだけ残り、GitHub 以外には送られない。

### 4. ホーム画面に台帳を置く

iPhone の Safari で `https://ユーザ名.github.io/リポジトリ名/` を開き、
共有 → **ホーム画面に追加**。

**これ1回だけでよい。** 以後どれだけ器械を増やしても、
ホーム画面の操作は不要。台帳の中から開く。

（PWA として登録されるので、起動するとアドレスバーの無い全画面になる）

---

## 器械を増やす

### 方法A：投函所（iPhone向け）

台帳の下部の **投函所** を開く → HTMLを貼る → ファイル名を決める → 投函する。

貼った時点で「台帳にどう載るか」が下見として出る。
既にある名前で投函すると差し替えになる。

### 方法B：git（PC向け）

`apps/` に `.html` を置いて push するだけ。

```bash
cp ~/Downloads/新しい器械.html apps/atarashii-kikai.html
git add apps/ && git commit -m "収蔵" && git push
```

### 方法C：iOSショートカット

投函所の代わりにショートカットで済ませたい場合。

1. **入力を要求** → ファイル名を訊く
2. **クリップボードを取得**
3. **テキストをエンコード**（Base64、行区切り: なし）
4. **URLの内容を取得**
   - URL: `https://api.github.com/repos/ユーザ名/リポジトリ名/contents/apps/[ファイル名].html`
   - 方法: `PUT`
   - ヘッダ: `Authorization: Bearer 合鍵` / `Accept: application/vnd.github+json`
   - 本文: JSON → `message`（文字列）と `content`（手順3の結果）
5. **URLを開く** → Pages のアドレス

差し替えの場合は同じURLに `GET` して `sha` を取り、本文に足す必要がある。
この分岐が面倒なので、iPhoneからは投函所のほうが楽。

---

## 台帳への載り方を指定する

各HTMLの `<head>` に次を書いておくと、そのまま台帳に写る。

```html
<script type="application/json" id="app-manifest">
{
  "name": "律動検波卓",
  "reading": "りつどうけんぱたく",
  "desc": "動画や音声から音圧波形を描き、周期音の周期を検出する。",
  "category": "計測",
  "icon": "◎",
  "tags": ["波形", "解析"]
}
</script>
```

| 鍵 | 役目 | 無い場合 |
|---|---|---|
| `name` | 名称 | `<title>` の先頭（`—` `\|` `/` の手前まで） |
| `reading` | 検索用の読み | 空 |
| `desc` | 摘要 | `<meta name="description">` |
| `category` | 分類（見出しになる） | 未分類 |
| `icon` | 左欄の一文字 | ◇ |
| `tags` | 検索に効く語 | なし |

`apps/_template.html` が雛形。`_` で始まるファイルは台帳に載らない。

---

## 管理番号について

`No.001` は**一度付いたら動かない**。
新しい器械には常に「既存の最大値+1」が振られるので、
名前順で先頭に来るファイルを後から足しても既存の番号はずれない。

番号は `apps.json` が持っている。`apps.json` を消すと振り直しになる。

---

## 台帳の使い方

- **朱印「常」** — 押すと最上段の「常備」に繰り上がる。よく使うものを留める。
- **並び** — 番号順／更新順／使用順。
- **検索** — 名称・読み・摘要・分類・番号・タグを横断。
- **機外** — 一度開いた器械は控えに残り、電波が無くても開く。
  まだ開いていない器械は「控えがありません」と出る。
  常備・使用履歴はこの端末の localStorage にある。

---

## ファイルの役目

| | |
|---|---|
| `index.html` | 台帳本体。単一ファイル |
| `post.html` | 投函所。ブラウザから GitHub API を叩く |
| `sw.js` | 控え（オフライン保持） |
| `manifest.webmanifest` | PWA 定義 |
| `apps.json` | **自動生成**。手で触らない |
| `tools/build-register.mjs` | 台帳生成器 |
| `tools/make-icons.py` | アイコン生成（作り直したい時だけ） |
| `.github/workflows/register.yml` | 記帳と公開 |
| `.nojekyll` | Jekyll に触らせない |

手元で台帳を作り直す場合：

```bash
node tools/build-register.mjs
```

---

## 詰まりやすいところ

**台帳が空のまま**
Actions が走ったか確認する。Settings → Pages の Source が
「GitHub Actions」でないと `apps.json` は更新されても公開されない。

**投函が 403**
合鍵の Contents が Read only になっている。

**投函が 404**
書庫名の綴りか、合鍵の Repository access に
そのリポジトリが入っていない。

**更新したのに古い画面が出る**
Service Worker が控えを出している。台帳下部の「台帳を取り直す」を押すか、
ホーム画面のアイコンから一度閉じて開き直す。

**ホーム画面のアイコンが真っ白**
`icons/` が公開されていない。Pages の公開が終わってから追加し直す。
