# 千里同風株式会社 — 公式ウェブサイト

## ローカルプレビュー（デプロイ前の確認）

ファイルをブラウザで直接開くと一部のリンクが機能しません。必ずローカルサーバーを使用してください。

### 方法 1: VS Code の Live Server（推奨）

1. VS Code を開く
2. 拡張機能「Live Server」をインストール（未インストールの場合）
3. `index.html` を右クリック → **「Open with Live Server」**
4. ブラウザで `http://127.0.0.1:5500` が自動的に開きます

### 方法 2: Python（Node.js 不要）

```bash
# このフォルダで実行
python -m http.server 8000
# ブラウザで http://localhost:8000 を開く
```

### 方法 3: Node.js の http-server

```bash
npx http-server .
# ブラウザで http://localhost:8080 を開く
```

---

## ファイル構成

```
senridoufuu-web/
├── index.html                  ← ホームページ
├── about/
│   ├── index.html              ← チームページ
│   └── milestones.html         ← 沿革ページ
├── solutions/
│   ├── index.html              ← 製品・サービスページ
│   ├── demo.html               ← オンラインデモページ
│   └── blog/
│       └── index.html          ← ブログ一覧ページ
├── css/
│   └── main.css                ← 全スタイル
├── js/
│   └── main.js                 ← i18n・ナビ・アニメーション（翻訳データを含む）
├── assets/
│   └── images/                 ← 画像ファイルをここに配置
└── netlify.toml                ← Netlify 設定
```

---

## コンテンツの更新方法

### テキスト（翻訳）の変更

`js/main.js` の冒頭にある `const T = { ja: {...}, zh: {...}, en: {...} }` 内の値を変更してください。

例：ミッションの日本語テキストを変更する場合
```js
// js/main.js の中
mission_title: 'ここを変更する',
```

### 画像の追加

1. 画像ファイルを `assets/images/` に配置
2. 対応する HTML ファイルの `product-card__placeholder` 部分を変更:

```html
<!-- 変更前 -->
<div class="product-card__placeholder">...</div>

<!-- 変更後 -->
<img src="/assets/images/product1.jpg" alt="製品名" style="width:100%;height:100%;object-fit:cover;">
```

### ブログ記事の追加

1. `solutions/blog/` に新しい HTML ファイルを作成（例: `first-post.html`）
2. `solutions/blog/index.html` のコメント内のブログアイテムテンプレートをコピーして記入

---

## Netlify へのデプロイ手順

### 手順 1: GitHub にコードをアップロード

1. GitHub で新しいリポジトリを作成（例: `senridoufuu-web`）
2. このフォルダをリポジトリにプッシュ:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/[your-username]/senridoufuu-web.git
git push -u origin main
```

### 手順 2: Netlify に接続

1. [netlify.com](https://www.netlify.com/) にアクセス（無料アカウントを作成）
2. 「Add new site」→「Import an existing project」
3. GitHub を選択して先ほどのリポジトリを選択
4. Build settings はそのままで「Deploy site」をクリック
5. 数分後にサイトが公開されます（例: `random-name.netlify.app`）

### 手順 3: カスタムドメインの設定

1. Netlify の「Domain settings」→「Add custom domain」
2. `senridoufuu.com` と `www.senridoufuu.com` を追加
3. ドメインレジストラ（ドメインを購入した会社）の DNS 設定で以下を変更:
   - **A レコード**: `@` → `75.2.60.5`（Netlify の IP）
   - **CNAME**: `www` → `[your-site].netlify.app`
4. Netlify の「HTTPS」設定で SSL 証明書を有効化（Let's Encrypt、無料）

※ DNS の反映には最大 24〜48 時間かかる場合があります。

---

## カスタマイズの注意事項

- **フォント**: Google Fonts の Noto Serif JP / Noto Sans JP / Inter を使用
- **多言語**: `js/main.js` の翻訳データ（`T` オブジェクト）を編集
- **デザイン変数**: `css/main.css` の `:root {}` ブロックで色・フォントを変更可能
- **デモページ**: `solutions/demo.html` のプレースホルダーを実際の AI 機能に差し替え
