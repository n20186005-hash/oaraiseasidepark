# 大洗海浜公園 非公式ガイド

大洗海浜公園（茨城県大洗町）の日本語・単一ページ観光サイトです。Astro で静的ファイルを生成し、Cloudflare Worker の Static Assets から配信します。

## 技術構成

- Astro 7.1.6
- Tailwind CSS 4.3.3（Vite plugin）
- TypeScript 7.0.2
- pnpm 11.18.0
- Cloudflare Workers / Wrangler 4.115.0
- データベース、ログイン、CMS なし
- GA4: `G-HXM22WWPKP`

## ローカル起動

Node.js 22.13 以上と pnpm 11.18.0 以上を使用してください。

```bash
pnpm install
pnpm dev
```

本番ビルド：

```bash
pnpm build
pnpm preview
```

## Cloudflare Worker へデプロイ

初回のみ Wrangler で Cloudflare にログインします。

```bash
pnpm exec wrangler login
pnpm deploy
```

`wrangler.jsonc` は `dist/` を Static Assets として Worker の `ASSETS` binding に接続します。独自ドメインは Cloudflare Dashboard の Workers & Pages → 対象 Worker → Settings → Domains & Routes から追加してください。

## 本番 URL の設定

canonical URL と OGP の絶対 URL を出力したい場合は、`.env.example` を `.env` にコピーして設定します。

```bash
PUBLIC_SITE_URL=https://example.com
```

ドメイン確定前でもビルド可能です。値がない場合、canonical は出力しません。

## 旅の記念カード

`src/scripts/memorial-card.ts` で Canvas 合成を実装しています。

- カメラ、インカメラ、写真ライブラリから選択
- 1:1、はがき縦、9:16
- 朝凪、夕映え、潮風の3スタイル
- スポット名・日付の編集
- 拡大、ドラッグ移動、PNG保存
- 選択写真は `URL.createObjectURL()` でブラウザ内に読み込み、外部 API やサーバーへ送信しない
- ページ離脱時に Object URL を破棄

## 主な編集箇所

- 本文・構造: `src/pages/index.astro`
- 共通メタ・GA4: `src/layouts/BaseLayout.astro`
- 記念カード UI: `src/components/MemorialCard.astro`
- 記念カード処理: `src/scripts/memorial-card.ts`
- デザイン: `src/styles/global.css`
- Worker: `worker/index.ts`
- Cloudflare 設定: `wrangler.jsonc`

## 情報更新

交通、駐車料金、海水浴場の開設、イベント、店舗営業は変更されます。公開前・観光シーズン前に、本文の「情報確認日」と該当箇所を公式案内に合わせて更新してください。

写真の出典とライセンスは `PHOTO_CREDITS.md` を参照してください。
