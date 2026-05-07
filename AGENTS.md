# AGENTS.md

このプロジェクトにおける AI エージェント（Claude Code / OpenAI Codex 共通）の振る舞いと開発ルールを定義する。

---

## 基本方針
- **コミュニケーション**: 全て日本語で行う。
- **実装優先**: README はテンプレート由来の古い説明が残っているため、必ず実装と設定ファイルを優先して判断する。
- **承認フロー**: 実装計画を提示し、「進めて」などの明示的な指示があるまでコードを書き換えない。
- **自律的な更新**: 主要機能の完了後や要件変更時は、`AGENTS.md` を含む関連ドキュメントを実装に合わせて最新化する。
- **変更範囲の節度**: 明示指示のないリファクタはしない。特にテンプレート残骸の一括整理、命名変更、文言整理、改行整理を勝手に広げない。
- **秘密情報の非参照**: 推測で秘密情報を見に行かず、コードと設定ファイルから判断する。

---

## よく使うコマンド
```bash
npm run dev              # 開発サーバー起動
npm run build            # ビルド
npm run preview          # ローカル preview
npm run cf-typegen       # Cloudflare 型生成
npm run check            # build + tsc + production dry-run deploy
npm run deploy           # production deploy
npm run deploy:staging   # staging deploy
npx tsc --noEmit         # 型チェック
```

---

## 技術スタック

- **Astro 5** / TypeScript 5 / React 19
- **Cloudflare Workers**: `@astrojs/cloudflare` を使った SSR デプロイ
- **Content Collections**: `src/content/blog/` の Markdown / MDX を `astro:content` で配信
- **API**: `src/pages/api/` 配下の Astro API Routes
- **AI 連携**: `@google/genai` を利用した Gemini File Search

---

## ディレクトリ構造

```text
src/
  components/        共通 UI 部品
  content/
    blog/            ブログ記事（Markdown / MDX）
  layouts/           ブログ記事などのレイアウト
  pages/             Astro のページと API ルート
    api/             API エンドポイント
    blog/            ブログ一覧・詳細ルート
  styles/            グローバルスタイル
  consts.ts          サイト共通定数
  content.config.ts  Content Collections 定義
  env.d.ts           Cloudflare Runtime 型

public/              静的アセット
dist/                ビルド出力
```

---

## 💡 実装哲学（Claude Code の基本原則）

これは Claude Code が常に従っている設計原則。プロジェクト固有のルールより上位に位置する。

### 既存ファイルを編集することを優先する
新しいファイルを作る前に、既存ファイルへの追記・修正で解決できないか考える。ファイル数が増えるほど把握コストが上がる。

### 抽象化は必要になってから
同じコードが3箇所出てきたとき初めて共通化を検討する。「将来使いそう」という理由での抽象化はしない。バグ修正のついでにリファクタリングしない。

```ts
// NG: 「今後も使えるように」と汎用ユーティリティを作る
export function normalizeSearchResult(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

// OK: まず動くものを作り、繰り返しが見えてから共通化する
const normalize = (s: unknown) =>
  String(s ?? "").replace(/\s+/g, " ").trim();
```

### コメントは「なぜ」だけ書く
関数名・変数名で伝わることはコメントにしない。書くとしたら「なぜそうなっているか」が非自明な場合のみ。

```ts
// NG: 何をしているかの説明
const apiKey = env.GEMINI_API_KEY;

// OK: なぜそうなっているかの説明
// Cloudflare adapter では本番の env は locals.runtime.env から読む
const env = locals?.runtime?.env ?? {};
```

### エラーハンドリングは境界だけ
ユーザー入力・HTTP リクエスト・外部 API など「外部から来るもの」だけバリデートする。内部のコードやフレームワークの保証は信頼する。

```ts
// OK: リクエスト境界で入力をバリデート
const query = typeof body.query === "string" ? body.query.trim() : "";
if (!query) {
  return new Response(JSON.stringify({ error: "query is required" }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}
```

### 後方互換ハックを残さない
削除したコードのコメント、未使用になった補助コード、古い前提のコメントなどは残さない。不要だと確認できたものは完全に削除する。  
ただし、このリポでは依頼外のテンプレート掃除はしない。直すなら関連箇所に閉じた範囲で行う。

### 探索的な質問には実装前に方針を示す
「どうすべきか」「どう思う？」という質問には、2〜3文で推奨方針とトレードオフを伝える。ユーザーが同意するまで実装しない。

### 根本原因を直す
症状ではなく根本原因を直す。

```text
NG: 運用でカバーして production / staging の混乱を放置する
OK: package.json の deploy スクリプトを環境明示にする
```

### UI は必ずブラウザで確認してから完了とする
型チェックとテストはコードの正確性を確認するが、機能の正確性は確認しない。UI 変更は `npm run dev` または `npm run preview` で実際に動かし、主要操作とエッジケースを目で確認してから完了と報告する。確認できない場合はその旨を明示する。

---

## 🔍 作業前の調査プロトコル

**コードを書く前に、必ず現状を理解する。** 理解なき実装は技術的負債を生む。

### ステップ1 — 関連ファイルを把握する

タスクに関係しそうなファイルを **並列で** 読む。「たぶんここだろう」という推測だけで実装を始めない。

```text
調査の優先順位:
1. タスクで直接言及されたファイル
2. 変更対象を参照しているファイル
3. 変更対象が依存しているファイル
4. 類似の実装パターンを持つファイル
```

### ステップ2 — 既存パターンを探す

新しいものを作る前に、**すでに似た実装がないか** 必ず探す。

```bash
# 例: search API の参照箇所を探す
rg -n "api/search|/api/search" src

# 例: Gemini API 利用箇所を確認
rg -n "GoogleGenAI|generateContent|fileSearch" src
```

再利用できるものがあれば、新規作成より再利用を優先する。

### ステップ3 — 影響範囲を調べる

**変更するものが他でも使われていないか** 確認してから触る。

```bash
# 共有コンポーネントを変更する前に、使用箇所を全件確認
rg -n "Header|Footer|BaseHead|SITE_TITLE" src
```

共通コンポーネント、共通定数、API レスポンス形式の変更は、必ず影響範囲を把握してから変更する。

---

## 📋 計画書の作成と承認

3ファイル以上の変更・新機能・リファクタリングは、**必ず計画書を先に作成してユーザーの承認を得る。**

### 計画書に含めるべき内容

```markdown
## なぜやるか（Context）
- 現状の問題
- 変更によって何が改善されるか

## 変更ファイル一覧
| ファイル | 変更内容 |
|---|---|
| path/to/file | 〇〇を追加 |

## 実装方針
- アプローチの選択理由
- 既存コードで再利用するもの
- 懸念点・トレードオフ

## 動作確認方法
- どのコマンドで何を確認するか
```

### 承認前にやってはいけないこと

- ファイルの新規作成・削除
- 既存ファイルの編集
- パッケージのインストール

---

## 🛠️ 実装時の規律

### 一度に一つの関心事
1回の変更に詰め込まない。「バグ修正」と「リファクタリング」は分ける。変更の意図が1文で説明できる粒度が理想。

### 編集前に必ず読む
ファイルを編集する前に必ず読む。読まずに書くと、既存の構造を壊す。

### 削除前に使用箇所を確認
何かを削除・リネームする前に `rg` で使用箇所をゼロにしてから削除する。

```bash
# 削除してよいか確認
rg -n "functionName|FileName|SymbolName" src
```

### スコープを守る
頼まれていないことはしない。作業中に「ここも直せそう」と気づいても、タスク外の変更は行わない。気になる点はユーザーに一言添えるにとどめる。

---

## 🧠 多角的チェックリスト

実装後、コードをコミットする前に以下を自問する。

**ルーティングとビルド**
- [ ] 変更したページや API が `src/pages/` のルーティング前提を壊していないか
- [ ] `astro build` 時に破綻する import や server-only / client-only の混在がないか

**Cloudflare Workers**
- [ ] 本番 API ルートで `process.env` を使っていないか
- [ ] `locals.runtime.env` とローカル補助スクリプトの責務が混ざっていないか
- [ ] `wrangler.json` の環境名、domain、deploy スクリプトの向き先に齟齬がないか

**API 契約**
- [ ] API の JSON shape を変えた場合、呼び出し元も追従しているか
- [ ] エラー時レスポンス、`debug`、`raw` などの分岐を壊していないか

**コンテンツとレイアウト**
- [ ] `src/content.config.ts` と blog ページの前提を崩していないか
- [ ] `Header` / `Footer` / `BaseHead` / `global.css` の変更が他画面に波及していないか

**UI**
- [ ] 文言、レイアウト、主要操作が壊れていないか
- [ ] UI 変更なのに見た目確認を省略していないか

**文字化け**
- [ ] 表示上の文字化けだけでファイル破損と誤判定していないか
- [ ] 日本語を触る変更で不要な全置換やファイル再生成をしていないか

---

## ✅ 検証プロトコル

**実装が終わったら、以下を必ず実行してから「完了」と報告する。**

```bash
# 1. ビルドの確認
npm run build

# 2. 型エラーの確認
npx tsc --noEmit
```

必要に応じて追加で確認する。

```bash
# 3. ローカル preview
npm run preview

# 4. production dry-run deploy
npm run check
```

### エラーの扱い方

**新しく発生したエラー**: 自分の変更が原因なので、必ず修正してから完了とする。  
**作業前から存在していたエラーや文字化け**: 修正しない（スコープ外）。ただし、ユーザーに切り分けて報告する。  
**UI 変更**: コマンド実行だけでなく、画面確認できたかどうかも明記する。

---

## このリポの実態

- Astro 5 系のサイトで、`@astrojs/cloudflare` を使って Cloudflare Workers に SSR デプロイする。
- React 統合は入っているが、現状の主要画面は `.astro` 中心。
- ブログ機能は `src/content/blog/` の Markdown / MDX を `astro:content` で配信している。
- API ルートは `src/pages/api/` 配下にあり、少なくとも以下がある。
  - `search.ts`: Gemini File Search を使う検索 API
  - `chat.ts`: 現状は簡易スタブ
  - `search.mjs`: ローカル実行用の補助スクリプト
- Cloudflare Workers の環境は `wrangler.json` で管理している。
  - `production`: `salmonmikan.dev`
  - `staging`: `staging.salmonmikan.dev`

## 主要ファイル
- `astro.config.mjs`: Astro 本体設定。Cloudflare adapter, MDX, sitemap, React を設定。
- `wrangler.json`: Workers 環境設定と custom domain の定義。
- `src/pages/`: ルーティング本体。ページと API はここが正。
- `src/content.config.ts`: content collection 定義。
- `src/consts.ts`: サイト共通のタイトル・説明文。
- `src/components/`, `src/layouts/`, `src/styles/`: UI 共通部品とスタイル。

## API 実装ルール
- `src/pages/api/search.ts` は Cloudflare Workers 上の実装を正とする。
- Workers 上の秘密情報は `locals.runtime.env` から読む。`process.env` を Astro の本番 API ルートに持ち込まない。
- `search.mjs` はローカル補助用途。`search.ts` を変えたら、必要に応じて追従させる。
- API 入出力の shape を変えるときは、呼び出し元の `src/pages/search.astro` も必ず確認する。

## フロントエンド編集ルール
- 既存 UI は Astro テンプレートベース。デザイン刷新が目的でない限り、見た目の大幅変更はしない。
- 共通レイアウトに関わる変更では `src/components/Header.astro`, `Footer.astro`, `BaseHead.astro`, `src/styles/global.css` を先に確認する。
- ブログページは content collection 前提なので、`src/pages/blog/` と `src/layouts/BlogPost.astro` の整合を崩さない。
- `src/pages/index.astro` や `README.md` にはテンプレート文言や文字化けが残っている。別タスクならともかく、無関係な作業で巻き取らない。

---

## 文字化けと日本語
- Windows / PowerShell では表示上の文字化けが起きうる。見た目だけでファイル破損と断定しない。
- 日本語ファイルの読取りや置換が怪しいときは `japanese-lang-view-edit` の手順を使う。
- 文字化け回避を目的にファイル全体を作り直さない。
- 日本語文言の変更は、依頼がない限り最小限に留める。

## 秘密情報
- `.env`、`.dev.vars`、Credential 類は読まない。
- 値の表示だけでなく、存在確認・条件分岐・SET/MISSING 判定などの間接参照も行わない。
- 確認が必要な場合は、ユーザーが手元で実行する確認コマンドのみを提示する。

## 変更時の確認ポイント
- `astro.config.mjs` を触ったら `npm run build` で静的ビルドと SSR 出力を確認する。
- `wrangler.json` を触ったら対象環境名と custom domain の取り違えがないか確認する。
- `src/pages/api/search.ts` を触ったら、エラー時レスポンスと `debug` / `raw` 分岐を崩していないか見る。
- `src/pages/search.astro` を触ったら、`/api/search` の返却 JSON 前提と表示文言の整合を確認する。
- content / blog 周りを触ったら `src/content.config.ts` と `src/pages/blog/[...slug].astro` の両方を見る。

## 禁止事項
- 秘密情報ファイルの閲覧、解析、存在確認。
- 依頼されていない大規模リファクタ。
- 既存挙動に関係ないテンプレート掃除の抱き合わせ。
- Cloudflare Workers 本番コードでの `process.env` 依存追加。
- 文字化け回避だけを目的にした日本語エスケープや全置換。

## ドキュメント更新の扱い
- 実装変更により `AGENTS.md` の記述が古くなったら、このファイルも一緒に更新してよい。
- 逆に、実装が追いついていない理想論は書かない。常に「今のリポで本当にそうなっていること」を優先する。
