#!/bin/bash

echo "🔨 Obsidian Talk AI プラグインをビルドします..."
echo ""

# 依存関係がインストールされているか確認
if [ ! -d "node_modules" ]; then
    echo "📦 依存関係をインストールしています..."
    pnpm install
    echo ""
fi

# ビルド実行
echo "🚀 ビルドを開始します..."
pnpm run build

# ビルド結果を確認
if [ -f "main.js" ]; then
    echo ""
    echo "✅ ビルドが完了しました！"
    echo ""
    echo "生成されたファイル:"
    ls -lh main.js manifest.json
    echo ""
    echo "📂 次のファイルをObsidianのプラグインフォルダにコピーしてください:"
    echo "   - main.js"
    echo "   - manifest.json"
    echo ""
    echo "📁 プラグインフォルダの場所:"
    echo "   <YourVault>/.obsidian/plugins/obsidian-talk-ai/"
else
    echo ""
    echo "❌ ビルドに失敗しました"
    exit 1
fi
