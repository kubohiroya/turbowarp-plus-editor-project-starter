# __TITLE__

__SCRATCH_SECTION__
## このリポジトリについて

この作品は、[TurboWarp Plus Editor](https://kubohiroya.github.io/turbowarp-plus-editor/) で開発しています。このリポジトリのフォルダがそのまま作品フォルダで、作品は Git で変更を読める形（sb3-toolchain の作品フォルダ）でルートに入っています。SB3 ファイルはリポジトリに入れず、GitHub Actions が作ります。

| 場所 | 中身 |
| --- | --- |
| `project.source.json` | ブロック・変数・リスト・スプライトの設定 |
| `assets/` | コスチューム・背景・音 |
| `extensions/`・`embedded-extensions.json` | 作品に埋め込んだ拡張機能 |
| `sb3-source.json` | 作品フォルダの形式と SB3 にまとめるときの順序 |
| `scratch-project.json` | 取り込み元の Scratch 作品 |
| `.github/` | 検査・リリース・Scratch からの取り込みの自動処理と、issue・プルリクエストの書式 |

## 遊ぶ

[Releases](../../releases) から最新の `.sb3` をダウンロードし、[TurboWarp](https://turbowarp.org/) か [Scratch](https://scratch.mit.edu/projects/editor/) の「ファイル」→「コンピューターから読み込む」で開きます。

## 開発の流れ

1. やりたいことや不具合を **issue** に書きます。
2. Plus Editor の「ファイル」→「フォルダを開く…」でこのリポジトリのフォルダを選び、作業用の **ブランチ** を作ります。
3. 作品を編集し、「ファイル」→「保存」で作品フォルダに書き戻します。
4. ローカル Git パネルで変更を確かめて **コミット** し、GitHub に **push** します。
5. GitHub で **プルリクエスト** を作ります。Actions の「Check project」が作品を検査し、試せる SB3 を作ります。
6. ブロック単位で変更を確かめてから **マージ** します。
7. 配れる状態になったら GitHub で **リリース** を作ります。SB3 が自動で添付されます。

それぞれの手順の詳しい説明は、[GitHub で作品を開発する](__GUIDE_URL__)を読んでください。

## 手元で SB3 を作る

Node.js 24 以降を使い、リポジトリのルートで実行します。

```bash
npx --yes @kubohiroya/sb3-toolchain@__TOOLCHAIN_VERSION__ check .
npx --yes @kubohiroya/sb3-toolchain@__TOOLCHAIN_VERSION__ build . --output dist/__SB3_NAME__.sb3
```
