# FlexiSpot Control Deck

FlexiSpot 昇降デスクを PC から操作したい人向けの、ブラウザベースのコントローラーです。Chrome / Edge の Web Serial API を使ってデスクに接続し、上下移動、現在高さ表示、プリセット呼び出しを行えます。

これはネイティブの Windows / Mac アプリではなく、`Chrome / Edge + HTTPS or localhost` で動く Web UI です。  
v2 では旧 `public/` 直書き構成をやめ、`Vite + TypeScript` をベースに UI・状態管理・シリアル通信を分離しました。

## まず知っておきたいこと

- FlexiSpot を PC から操作するためのブラウザ UI です
- Chrome / Edge 系ブラウザが必要です
- `HTTPS` または `localhost` で開く必要があります
- 初回接続時にシリアルポートの許可が必要です
- すべての FlexiSpot モデルで動作確認しているわけではありません

## 3 ステップで使う

1. Chrome または Edge でこのページを開く
2. `Connect` を押して、接続したいシリアルポートを選ぶ
3. `UP / DOWN` または `Presets` でデスクを操作する

接続できたら、現在高さ、最近のサンプル、当日の履歴も画面に表示されます。

## 確認済みの接続イメージ

このリポジトリでは、次のような構成で FlexiSpot と PC を接続する想定です。

```text
PC
  -> USB-Serial アダプタ
  -> RJ45 ケーブル
  -> FlexiSpot のコントロールボックス側ポート
```

ブラウザは Web Serial API で USB-Serial アダプタと通信し、その先の FlexiSpot にシリアルコマンドを送ります。

## 必要なもの

- PC
- Chrome 89+ または Edge 89+
- USB-Serial アダプタ
- RJ45 ケーブル
- 必要に応じて変換ケーブルや配線加工

使用例としては、`FTDI TTL-232R-5V-WE` のような USB to TTL シリアル変換ケーブルと、加工した LAN ケーブルを組み合わせる構成があります。

## 物理接続の考え方

1. PC 側から USB-Serial アダプタを接続する
2. その先を RJ45 系の配線で FlexiSpot 側へつなぐ
3. ブラウザから USB-Serial アダプタのシリアルポートを選択する

このプロジェクトでは `9600 bps / 8 data bits / 1 stop bit / parity none` の設定で通信します。

## 接続手順

1. デスクと PC を USB-Serial アダプタ経由で物理接続する
2. サイトを Chrome / Edge で開く
3. `Connect` を押してシリアルポートを選ぶ
4. 接続完了後、`UP / DOWN` や `Presets` を使って操作する

## ハードウェア接続の注意

- RJ45 配線や変換ケーブルの結線は自己責任で行ってください
- モデルやコントロールボックスの世代によって、空きポートや配線条件が異なる可能性があります
- 本 README の接続方法は「確認済みの一例」であり、すべての FlexiSpot で同一構成を保証するものではありません
- 誤配線すると機器を損傷する可能性があるため、不明な場合は配線を確定してから接続してください

## これでできること

- FlexiSpot を PC から上下に動かす
- 現在の高さをブラウザで確認する
- 保存済みプリセットを呼び出す
- その日の高さ履歴をざっくり確認する
- 必要なときだけ診断ログを見る

## 向いている人

- FlexiSpot をブラウザから手早く操作したい
- スマホではなく PC 画面で高さを見ながら使いたい
- Web Serial 対応ブラウザで簡単に試したい

## 注意事項

- Web Serial 非対応ブラウザでは動きません
- `http://` の通常配信では動きません
- シリアル通信の仕様差分により、モデルによっては動かない可能性があります
- 実機接続は自己責任で行ってください

## なぜ作り直したか

旧実装は機能自体は成立していましたが、以下が拡張のボトルネックでした。

- UI、イベント処理、シリアル通信が密結合
- デバッグログ前提で、状態の見通しが悪い
- `public/` 配下の手編集中心で、再設計や機能追加が重い

今回の再構築では、スマートホームや IoT デバイス管理画面で一般的な「一画面で状態と操作を把握できる」情報設計を採用しています。

## 技術選定

- `Vite`
  - 静的サイトのまま高速に開発しやすく、GitHub Pages にも載せやすい
- `TypeScript`
  - Web Serial 周りの状態やコマンド名を型で固定できる
- フレームワークなしのモジュール設計
  - 今回の規模では React などを入れるより軽く、Web Serial 中心の制御 UI に向いている
- CSS 手書き
  - 既存デザインシステムがないため、今回の専用 UI を最短で組みやすい

参考にした考え方:

- Web Serial は secure context 前提で、ユーザー操作から `requestPort()` する設計が必要
- ビルド済み静的アセットを Pages に載せる運用
- デバイス操作画面では「接続」「現在値」「即時操作」を上段に集約する構成

## 画面設計

現行 UI は次のブロックで構成しています。

1. Hero / status
2. 現在高さメーター
3. 接続パネル
4. 手動操作パネル
5. プリセットデッキ
6. 最近サンプル表示
7. セッション高さチャート
8. 日次高さチャート
9. 診断モニタ

見た目は無機質な管理画面ではなく、ハードウェア操作らしい「計器盤」寄りに寄せています。  
グリーン、アンバー、スカイをアクセントに使い、接続状態と操作状態が視覚的に分かるようにしています。

## プロジェクト構成

```text
flexispot-web-controller/
├── index.html
├── src/
│   ├── main.ts
│   ├── styles.css
│   ├── types.ts
│   ├── serial/
│   │   ├── client.ts
│   │   └── protocol.ts
│   ├── state/
│   │   └── storage.ts
│   └── ui/
│       └── app.ts
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .github/workflows/static.yml
```

## 開発

依存インストール:

```bash
npm install
```

ローカル開発:

```bash
npm run dev
```

本番ビルド:

```bash
npm run build
```

プレビュー:

```bash
npm run preview
```

型チェックのみ:

```bash
npm run typecheck
```

## Firebase で Google ログインを使う

Google ログインとクラウド保存を有効にする場合は、Firebase Authentication と Firestore を設定してください。

1. Firebase コンソールで Google プロバイダを有効化する
2. Firestore を作成する
3. ルートに `.env.local` を置く

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

ログイン後は、プリセット、設定、日次高さ履歴をユーザー単位で Firestore に保存します。未ログイン時は従来どおり `localStorage` を使い、ログイン時にローカルとクラウドの更新時刻を比較して自動マージします。

GitHub Pages にも Firebase を反映する場合は、GitHub リポジトリの `Settings > Secrets and variables > Actions` に同じ `VITE_FIREBASE_*` を登録してください。`static.yml` は Actions secrets から build 時に読み込みます。

## 健康ログとエクスポート

高さ履歴はブラウザの `localStorage` に、最大 14 日分、1 日あたり最大 1440 サンプルまで保存します。これは 1 分間隔で 24 時間分を保持できる量で、Firestore 同期時もユーザーごとのドキュメントサイズを小さく保つための上限です。

現時点では、週次サマリーはこの 14 日分のローカル保存データから集計します。CSV / JSON エクスポートは週次サマリーを対象にし、アプリ内の `Weekly` セクションから出力できます。

月次・年次の詳細トレンドや生ログの長期保存が必要になった段階で、`localStorage` から IndexedDB へ移行し、Firebase 側も日単位のサブコレクションに分割する方針です。今の段階では、14 日制限のままにして同期量と実装複雑度を抑えます。

## ローカル画像生成

Apple Silicon Mac で、短いプロンプトからローカル画像生成を試すための補助スクリプトを同梱しています。既定では `mflux` の `FLUX.2-klein-4B` を 8bit 量子化で実行します。

セットアップ:

```bash
npm run imagegen:setup
```

生成:

```bash
npm run imagegen -- "黒髪少女"
```

または直接:

```bash
./scripts/generate-image.sh "黒髪少女"
```

生成画像は `generated-images/` に保存されます。初回生成時はモデルのダウンロードが走るため、数 GB 単位の空き容量と通信時間が必要です。

よく使う環境変数:

```bash
export HF_HOME="$HOME/.cache/huggingface"
export MFLUX_CACHE_DIR="$HOME/Library/Caches/mflux"
export MFLUX_MODEL="flux2-klein-4b"
export MFLUX_QUANTIZE="8"
export MFLUX_STEPS="4"
```

補足:

- 短いプロンプトには既定で簡単な品質向上タグを自動追加します
- より写実寄りにしたい場合は `MFLUX_BIN=/Users/jun/.local/bin/mflux-generate-z-image-turbo` のように切り替え可能です
- サンドボックス内では MLX の Metal 初期化に失敗することがあるため、実運用確認は通常の macOS ターミナルで行う前提です

ユニットテスト:

```bash
npm test
```

ローカル HTTPS で確認したい場合は、証明書を用意したうえで任意の HTTPS サーバーを使ってください。Web Serial は secure context 前提のため、`http://` の通常配信では動作しません。

## 利用条件

- Chrome / Edge 系ブラウザ
- HTTPS または `localhost`
- ユーザーが明示的にシリアルポート権限を許可すること

## 現在の機能

- FlexiSpot への接続 / 切断
- UP / DOWN のホールド操作
- 4 種類のプリセット呼び出し
- 高さストリームのリアルタイム表示
- 最近の高さサンプル表示
- セッション内の高さタイムライン表示
- 当日の高さ履歴の保存と可視化
- プリセット表示名のローカル保存
- シリアル受信バイトの診断モニタ
- キーボードショートカット
- プリセット表示名のモーダル編集

## データ保存

- プリセット表示名は `localStorage` に保存
- 日次高さ履歴は `localStorage` に保存
- 履歴保存は直近 14 日、1 日あたり最大 1440 件に制限

## 手動検証の基本項目

実機または模擬デバイスで、少なくとも次を確認してください。

1. 接続と切断が正常にできる
2. `UP` / `DOWN` のホールド操作が効き、離すと停止する
3. `PRESET1` / `PRESET2` / `SITTING` / `STANDING` が呼び出せる
4. 現在高さ、最近サンプル、セッションチャート、日次チャートが更新される
5. 診断モニタで RX バイトが確認できる
6. エラー時にトーストと状態表示が崩れない

シリアルプロトコルやデコード処理を変えた場合は、再現に使った受信バイト列も残してください。

## ショートカット

- `↑`: 上昇
- `↓`: 下降
- `1`: `PRESET1`
- `2`: `PRESET2`
- `S`: `SITTING`
- `T`: `STANDING`

## デプロイ

GitHub Actions で `npm test` と `npm run build` を実行し、生成された `dist/` を GitHub Pages に配信します。

## 直近の拡張候補

- 設定モーダルの実装
- プリセット管理の拡張
- アクセシビリティ改善
- UI スモークテストの追加
- PWA 化
