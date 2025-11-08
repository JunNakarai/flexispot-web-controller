# FlexiSpot Web Controller

Web Serial APIを使用してFlexiSpot昇降デスクを制御するWebアプリケーションです。

## 🚀 特徴

- **Web Serial API**: ブラウザから直接シリアル通信でデスクを制御
- **シンプルなUI**: 直感的で使いやすいWebインターフェース
- **GitHub Pages対応**: 静的サイトとしてホスティング可能
- **レスポンシブデザイン**: デスクトップ環境に最適化

## 📋 要件

### 環境要件
- **ブラウザ**: Chrome 89+ または Edge 89+
- **プロトコル**: HTTPS（Web Serial APIの制約）
- **OS**: Windows, macOS, Linux

### ハードウェア要件
- FlexiSpot対応昇降デスク
- USB-Serial変換アダプター（デスクとPC接続用）

## 🛠️ セットアップ

### 1. プロジェクトのダウンロード

```bash
git clone https://github.com/your-username/flexispot-web-controller.git
cd flexispot-web-controller
```

### 2. ローカルサーバーでの実行

HTTPS環境が必要なため、ローカルHTTPSサーバーを起動：

```bash
# Python 3の場合
python -m http.server 8000 --bind 127.0.0.1 --directory public

# Node.jsのhttpserver-sslの場合
npx http-server-ssl public -p 8443 --host 127.0.0.1 --cert cert.pem --key key.pem
```

### 3. ブラウザでアクセス

```
https://localhost:8443
```

## 🎮 使用方法

### 接続
1. デスクとPCをUSB-Serial変換器で接続
2. ブラウザで本アプリを開く
3. 「接続」ボタンをクリック
4. シリアルポートを選択

### 制御方法

#### 手動制御
- **⬆️ UP**: 押している間デスクが上昇
- **⬇️ DOWN**: 押している間デスクが下降

#### プリセット制御
- **プリセット1/2**: クリックで移動開始、動作中に再クリックで停止
- **シッティング**: 座り作業用高さに移動
- **スタンド**: 立ち作業用高さに移動

#### キーボードショートカット
- `↑` `↓`: UP/DOWN制御
- `1` `2`: プリセット1, 2
- `S`: シッティング
- `T`: スタンド

## 🔧 技術仕様

### シリアル通信設定
- **ボーレート**: 9600 bps
- **データビット**: 8
- **ストップビット**: 1
- **パリティ**: なし

### コマンド仕様
```javascript
UP:        [0x9b, 0x06, 0x02, 0x01, 0x00, 0xfc, 0xa0, 0x9d]
DOWN:      [0x9b, 0x06, 0x02, 0x02, 0x00, 0x0c, 0xa0, 0x9d]
PRESET1:   [0x9b, 0x06, 0x02, 0x04, 0x00, 0xac, 0xa3, 0x9d]
PRESET2:   [0x9b, 0x06, 0x02, 0x08, 0x00, 0xac, 0xa6, 0x9d]
SITTING:   [0x9b, 0x06, 0x02, 0x00, 0x01, 0xac, 0x60, 0x9d]
STANDING:  [0x9b, 0x06, 0x02, 0x10, 0x00, 0xac, 0xac, 0x9d]
```

## 📁 ファイル構成

```
flexispot-web-controller/
├── public/
│   ├── index.html               # 公開用メインページ
│   ├── css/
│   │   └── styles.css           # ビルド済みスタイル
│   └── js/
│       ├── script.js            # UI制御とイベントハンドリング
│       └── serial-protocol.js   # シリアル通信処理
├── README.md                    # プロジェクト説明
├── AGENTS.md                    # コーディングエージェント向けメモ
└── .github/
    └── workflows/               # CIと自動レビュー設定
```

GitHub Pages には `.github/workflows/static.yml` が `public/` 以下をアップロードする設定になっています。

## 🔒 セキュリティ

- **HTTPS必須**: Web Serial APIはHTTPS環境でのみ動作
- **ユーザー承認**: シリアルポートアクセス時に明示的な許可が必要
- **ローカル実行推奨**: 信頼できるデバイスでのみ使用

## 🐛 トラブルシューティング

### よくある問題

#### 「Web Serial APIがサポートされていません」
- Chrome 89+またはEdge 89+を使用しているか確認
- 実験的機能が有効になっているか確認

#### 「HTTPS環境が必要です」
- HTTPSサーバーで実行しているか確認
- `localhost`での実行を試す

#### 「デバイスが見つかりません」
- USB-Serial変換器が正しく接続されているか確認
- デバイスドライバーがインストールされているか確認
- 他のアプリケーションがポートを使用していないか確認

## 🤝 貢献

1. このリポジトリをフォーク
2. 機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'feat: add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

コミットメッセージは[Conventional Commits](https://www.conventionalcommits.org/)に従ってください。

## 📜 ライセンス

このプロジェクトはMITライセンスの下で公開されています。詳細は[LICENSE](LICENSE)ファイルを参照してください。

## 🙏 謝辞

- [iMicknl/LoctekMotion_IoT](https://github.com/iMicknl/LoctekMotion_IoT) - FlexiSpotプロトコル情報の提供
- Web Serial API - モダンなブラウザでのシリアル通信を可能にする技術

## 📞 サポート

問題が発生した場合は、[Issues](https://github.com/your-username/flexispot-web-controller/issues)で報告してください。
