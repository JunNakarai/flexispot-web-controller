# FlexiSpot Control Deck

Web Serial API を使って FlexiSpot 昇降デスクを制御する、静的配信前提のモダンなブラウザ UI です。  
v2 では旧 `public/` 直書き構成をやめ、`Vite + TypeScript` をベースに UI・状態管理・シリアル通信を分離しました。

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

新しい UI は次の 5 ブロックで構成しています。

1. Hero / status
2. 現在高さメーター
3. 接続パネル
4. 手動操作パネル
5. プリセットとテレメトリ

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
- プリセット表示名のローカル保存
- キーボードショートカット

## ショートカット

- `↑`: 上昇
- `↓`: 下降
- `1`: `PRESET1`
- `2`: `PRESET2`
- `S`: `SITTING`
- `T`: `STANDING`

## デプロイ

GitHub Actions で依存をインストールし、`npm run build` した `dist/` を GitHub Pages に配信します。

## 今後の拡張候補

- 設定モーダルの本格実装
- 履歴グラフ
- 複数デスクプロファイル
- PWA 化
- Playwright による UI テスト
