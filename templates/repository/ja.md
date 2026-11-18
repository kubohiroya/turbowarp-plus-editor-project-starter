# __TITLE__

__DESCRIPTION__

__SCRATCH_SECTION__
## 遊び方

作品の操作方法やルールをここに記入してください。

## 編集する

このリポジトリをクローンし、TurboWarp Plus Editor の「ファイル」→「フォルダを開く…」でリポジトリのフォルダを選びます。作品のファイルはリポジトリのルートにあり、「保存」で編集をそこに反映できます。

[GitHub で作品を開発する](__GUIDE_URL__)

## SB3 を作る

Node.js 24 以降を使い、リポジトリのルートで実行します。

```sh
npx --yes @kubohiroya/sb3-toolchain@__TOOLCHAIN_VERSION__ check .
npx --yes @kubohiroya/sb3-toolchain@__TOOLCHAIN_VERSION__ build . --output dist/__SB3_NAME__.sb3
```

__LICENSE__
