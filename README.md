# rakko-cli

ラッコM&Aの公開案件をターミナルから取得する、非公式のTypeScript製CLIです。案件一覧は公式APIを使い、詳細や高度な検索は公開HTMLから取得します。ログインは不要です。

## インストール

macOS、Node.js 24以上、npm、Gitが必要です。このリポジトリをcloneしたディレクトリで実行してください。

```sh
npm ci
npm link
rakko --help
```

`npm ci` の最後にTypeScriptをビルドします。手動でビルドし直す場合は `npm run build` を実行してください。npmへの公開は行わず、`package.json` に `private: true` を設定しています。

グローバルなコマンドを追加せずに試す場合は、`node dist/cli.js --help` または `npm run dev -- --help` を使えます。

## 案件を取得する

```sh
# 新着10件（公式API）
rakko list

# YouTube案件を最大20件、月間利益5万円以上で取得
rakko list --subtype youtube --min-profit 50000 --limit 20

# キーワードに関連する案件（公式APIのrelated検索）
rakko list --keyword キャンプ --json

# 公開検索ページで価格上限を指定
rakko search ブログ --max-price 500000 --sort price-asc

# 2ページ目、成約済みの案件を検索
rakko search --status sold --page 2

# 公開本文や収支情報を取得
rakko show 23377
rakko show https://rakkoma.com/project/detail/23377 --json

# 既定ブラウザで案件を開く（macOS）
rakko open 23377
```

### コマンドとオプション

| コマンド | 取得方法 | 固有のオプション |
| --- | --- | --- |
| `list` | 公式API | `--type`、`--limit`、`--keyword` |
| `search [keyword]` | 公開検索HTML | `--max-price`、`--status`、`--sort`、`--page` |
| `show <id-or-url>` | 詳細HTML・JSON-LD | `--json` |
| `open <id-or-url>` | 既定ブラウザ | なし |

`list` と `search` では、次の条件を指定できます。金額は円単位、PVは月間の件数で、いずれも0以上の整数です。

| オプション | 条件 |
| --- | --- |
| `--min-price <yen>` | 希望売却価格の下限 |
| `--min-sales <yen>` | 月間売上の下限 |
| `--min-profit <yen>` | 月間利益の下限 |
| `--min-pv <count>` | 月間PVの下限 |
| `--subtype <type>` | 案件副種別 |
| `--json` | JSON形式で出力 |

副種別は `media`（Webメディア）、`ec`（ECサイト）、`service`（Webサービス）、`youtube`、`amazon`、`instagram`、`app`、`other`（その他アプリ）です。`other` は公開検索のみ対応し、公式APIでは指定できません。

`list --type` は `new`（既定）、`pickup`、`pickup+new`、`related`、`random`、`default` に対応します。キーワードを指定すると、`--type` の指定にかかわらず `related` を使います。`related` にはキーワードが必要です。`--limit` は1〜50件で、既定は10件です。

`search --status` は `active`（受付中・既定）、`sold`（成約済み）、`all`（全状態）です。`--page` は1以上で、既定は1です。

`search --sort` は `newest`（新着順・既定）、`price-asc`、`price-desc`、`sales`、`profit`、`pv`、`recommended`、`reduced`、`negotiations`、`views`、`favorites`、`followers` に対応します。`price-asc` は価格が安い順、それ以外は各指標の多い順、`reduced` はサイトの値下げ順です。

## JSONを処理する

```sh
rakko list --limit 5 --json > projects.json
rakko search ブログ --json | jq '.projects[] | {id, title, price}'
```

一覧・検索は `source`、`sourceUrl`、`projects`、`pagination` を返します。詳細は `source`、`sourceUrl`、`project`、`sections` を返します。

案件の共通フィールドは `id`（文字列）、`title`、`url`、`price`、`monthlySales`、`monthlyProfit`、`monthlyPv` です。取得元によって `publishedAt`、`summary` が加わります。HTML上で不明な数値は `null` とし、明示されたゼロと区別します。公式APIが返すゼロは変換せず保持します。`publishedAt` は取得元の表記を保持します。

`source` は `official-api` または `html` です。公式APIでは `pagination.limit` が指定上限、`page` と `nextPage` は `null` になります。検索では `page` と、次ページがある場合の `nextPage` を返し、`limit` は `null` です。ページごとの件数はサイト側で決まります。

取得結果は標準出力、エラーは標準エラーに出力します。成功時の終了コードは0、失敗時は非ゼロです。

## 取得範囲と制約

[公式の案件一覧API](https://rakkoma.com/knowledge/282/)は受付中案件の一部を返すAPIで、最大50件です。ページ指定はなく、全件取得や完全なキーワード一致を保証しません。価格上限やページ指定が必要な場合は `search` を使ってください。

詳細本文や通常の検索結果を返す内部APIは、Chrome DevToolsで確認した範囲では見つかりませんでした。`search` は案件カードだけを解析し、`show` はJSON-LDの案件名・価格・要約を優先して、公開本文と表の情報を補います。CLIの実行にChrome DevToolsやMCPは必要ありません。

ログインが必要な推移データ、交渉開始後に開示される名称やURLは取得しません。お気に入り、メッセージ、交渉、出品にも対応していません。検索結果からの詳細一括取得や全ページ巡回は行いません。

通信のタイムアウトは15秒です。HTTP 429・500・502・503・504は最大2回再試行し、`Retry-After` があれば最大30秒の範囲で待機します。APIが失敗してもHTMLへ自動切替しません。サイトのHTML構造変更やアクセス制限を検出するとエラーにしますが、HTML抽出はサイトの変更によって修正が必要になる場合があります。

## 開発・検証

```sh
npm run typecheck
npm test
npm run build
```

テストではモック通信と、実際の構造を参考に作った架空の案件fixtureを使います。通常のテストは実サイトへアクセスしません。GitHub ActionsではNode.js 24で型チェック、テスト、ビルドを実行します。公開・デプロイ処理は含めていません。

ライセンス: MIT
