# __TITLE__

__DESCRIPTION__

__SCRATCH_SECTION__
## 遊び方

作品の操作方法やルールをここに記入してください。

## 編集する

このリポジトリをクローンし、TurboWarp Plus Editor の「ファイル」→「プロジェクトフォルダを開く…」で `project/` を選びます。「保存」で編集を作品フォルダに反映できます。

[GitHub で作品を開発する](__GUIDE_URL__)

## SB3 を作る

Node.js 24 以降を使い、リポジトリのルートで実行します。

```sh
npx --yes @kubohiroya/sb3-toolchain@__TOOLCHAIN_VERSION__ check project
npx --yes @kubohiroya/sb3-toolchain@__TOOLCHAIN_VERSION__ build project --output dist/__SB3_NAME__.sb3
```

__LICENSE__
