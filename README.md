# Talk AI - Obsidian Plugin

OpenAI APIを使用してAIとの会話を実現するObsidianプラグインです。

## 機能

- OpenAI APIを使用してAIに質問できます
- ストリーミングで回答がリアルタイムにObsidianのエディタに表示されます
- 固定の質問: "10000までの素数を計算するプログラム書いて"

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. ビルド

開発モード（自動リビルド）:
```bash
npm run dev
```

プロダクションビルド:
```bash
npm run build
```

### 3. Obsidianへのインストール

1. ビルド後、`main.js`と`manifest.json`を Obsidianのプラグインフォルダにコピーします
   - 場所: `<Vaultフォルダ>/.obsidian/plugins/obsidian-talk-ai/`
2. Obsidianを再起動するか、設定からプラグインをリロードします
3. 設定 → コミュニティプラグイン → Talk AIを有効化します

### 4. APIキーの設定

1. https://platform.openai.com/api-keys でOpenAI APIキーを取得します
2. Obsidianの設定 → Talk AI → OpenAI APIキー に入力します

## 使用方法

### 方法1: リボンアイコンから
左サイドバーのメッセージアイコンをクリック

### 方法2: コマンドパレットから
1. `Ctrl/Cmd + P` でコマンドパレットを開く
2. "AIに質問する" を検索して実行

現在のカーソル位置に質問と回答がストリーミングで書き込まれます。

## 開発

```bash
npm run dev
```

ファイルを変更すると自動的に再ビルドされます。Obsidianでプラグインをリロードして変更を反映してください。

## ライセンス

MIT
