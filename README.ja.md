<h1>RR stack</h1>

<p>
  <a href="https://www.npmjs.com/package/create-rr-stack"><img alt="npm" src="https://img.shields.io/npm/v/create-rr-stack?color=3fb6a8"></a>
  <a href="https://github.com/Useless007/rr-stack/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Useless007/rr-stack/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-0e1a2b"></a>
</p>

[English](README.md) · [ไทย](README.th.md) · [简体中文](README.zh-CN.md) · **日本語**

React Router + Rust (Axum)。データベースから画面まで、型がつながったスターターです。

```bash
bun create rr-stack my-app
```

RR stack は、AI エージェントがコードを書き、人がレビューするアプリのためのスターターです。
「終わった？」に答えるコマンドは `bun run check` ひとつだけ。終了コードが 0 なら、SQL、Rust API、
OpenAPI のコントラクト、React のコードがすべて一致しています。Windows、macOS、Linux で同じように
動きます。

## なぜ必要か

AI エージェントが持ち込むバグの多くは、2 つの層の食い違いです。列名を変えたのにクライアントが古い
フィールドを送っている、誰も処理しないエラー形式がある、など。RR stack はそれらをすべて
コンパイル時に検出します。

| 層 | ツール | 誰がチェックするか |
|---|---|---|
| データベース | Postgres + SQLx `query!` | Rust コンパイラが実際のスキーマと照合 |
| API | Axum + utoipa | `openapi.json` はハンドラから自動生成 |
| コントラクト | `openapi.json` | `bun run check` のたびに再生成して差分を確認 |
| クライアント | hey-api + TanStack Query | 型付きエラーも含めてコントラクトから生成 |
| UI | React Router（`ssr: false` + `prerender`） | `tsc` とフルビルド |

本番では 1 プロセスだけです。Axum が API とビルド済みのページを配信し、実行時に Node は不要です。

## 仕組み

![変更がデータベースから画面まで伝わる流れと、bun run check が検証する場所](https://raw.githubusercontent.com/Useless007/rr-stack/main/docs/assets/change-flow.svg)

![実行時は 1 つの Rust バイナリが API とページを配信](https://raw.githubusercontent.com/Useless007/rr-stack/main/docs/assets/runtime.svg)

## 自分で組み合わせればよいのでは？

もちろんできます。どの部品も一般的で人気のあるライブラリです。時間がかかるのはそれらをつなぐ部分で、
このリポジトリが提供するのはまさにそこです。

| 自分でやるなら | RR stack に含まれるもの |
|---|---|
| サーバーを起動せずに Rust から OpenAPI spec を出力する | `cargo run --bin openapi`。サーバーと同じ router から生成 |
| TS クライアントと react-query hooks を生成し、ずれたら CI を失敗させる | `bun run gen` と `bun run check` のコントラクト差分チェック |
| データベースなしで CI と Docker で Rust をビルドする | コミット済みの `.sqlx/` オフラインクエリメタデータ |
| 不正な入力や未知のルートに、プレーンテキストではなく型付き JSON を返す | `AppJson`、`AppPath`、`AppQuery` と JSON 404/405 |
| プリレンダリングしたページ、SPA、API を 1 つのバイナリで配信する | SPA フォールバック付きの Axum。ディープリンクもテスト済み |
| Windows と Linux で同じコマンドを使う | bun スクリプト、LF 改行、両 OS での CI |
| AI エージェントに「完了」の定義と触ってはいけないファイルを伝える | `AGENTS.md` とひとつのチェックコマンド |
| 最初から安全なサインイン | Argon2id ハッシュ、HttpOnly SameSite cookie、ハッシュ化したセッショントークン、SQL での所有者チェック |
| 開いているページに変更を届ける | メッセージ型がコントラクトにある WebSocket。クライアントも型付き |
| すべてを 1 コマンドで起動する | `bun run dev`、または `docker compose up -d` |

どの行も初回はドキュメントを読んで試行錯誤するのに数時間かかり、しかも気づきにくい形で間違えがちです。
CI で再生成されないクライアントや、`/api/typo` に HTML を返すフォールバックなどです。ここではどの行にも
テストがあります。

**さらに広げるには**

- 検索エンジンに見せたいページは、`web/react-router.config.ts` の `prerender` にパスを追加すれば
  静的 HTML として配信されます。リクエストごとのサーバーレンダリング（`ssr: true`）はまだ組み込まれて
  いませんが、React Router のサーバーを Axum と並べて動かせば実現できます。
- 別の言語のバックエンドがすでにある場合も、Web 側が読むのは `openapi.json` だけです。OpenAPI spec を
  出せるバックエンドなら、同じ生成クライアントと hooks を使えます。
- Rust が初めてでも大丈夫です。コードはエージェントが書き、コンパイラが直す場所をエージェントに伝え、
  `bun run check` が完了をあなたに伝えます。

## クイックスタート

```bash
bun create rr-stack my-app
cd my-app
docker compose up -d     # ツールチェーンなしでアプリ全体を起動。URL は CLI が表示します
# 開発する場合:
bun run dev              # Docker の Postgres + Rust API + Vite（ホットリロード付き）
```

新しいプロジェクトは、このスタック自体を紹介する小さな動くサイトです。プリレンダリングされた
ページ、コントラクトから作られた API リファレンス、サインイン、そして CRUD・絞り込み・検索・楽観的更新・
WebSocket によるリアルタイム更新・型付き 401/403/404/422 エラーをすべて備えた playground が入っています。日々の流れはプロジェクトの
`README.md` と `AGENTS.md` を読んでください。

必要なもの：Docker。開発する場合は Rust（stable）、[bun](https://bun.sh)、git、
`cargo install sqlx-cli --no-default-features --features postgres,rustls` も必要です。

## このリポジトリについて

このリポジトリは 2 つの役割を兼ねています。

- **テンプレート。** `cli/` と `docs/` 以外はすべて動く RR stack プロジェクトで、
  `bun create rr-stack` がコピーする中身そのものです。生成されたプロジェクトと同じように実行・
  テスト・変更できます。
- **CLI。** `cli/` は npm の `create-rr-stack` パッケージです。公開時にテンプレート（git が追跡する
  ファイルのみ）と、`cli/project-readme.md` のプロジェクト用 README を同梱します。

```
server/                Rust API（Axum、utoipa、SQLx）と結合テスト
web/                   React Router アプリ。web/app/api/ は生成コード
scripts/               bun run dev / check / smoke / gen を支える bun スクリプト
cli/                   create-rr-stack：index.ts（対話）、scaffold.ts（コピーと名前変更）、テスト
openapi.json           生成されたコントラクト
.github/workflows/     Linux と Windows の CI、docker compose。新しいプロジェクトにもコピーされます
```

## コントリビュート

人からも、人の代わりに働くエージェントからも歓迎します。まず [CONTRIBUTING.md](CONTRIBUTING.md)
（英語）を読んでください。要点は次のとおりです。

1. バグ修正より大きな変更は、先に issue を立てて方向性をすり合わせてください。
2. `bun run check` は終了コード 0 で終わる必要があります。CI が Linux と Windows で実行します。
3. テンプレートを変更した場合は、`cli/` で `bun test` も実行してください。プロジェクトを生成して
   チェックします。
4. 英語版が原文です。翻訳が追いついていない場合は、更新が必要な言語を PR に書いてください。

## ライセンス

[MIT](LICENSE)
