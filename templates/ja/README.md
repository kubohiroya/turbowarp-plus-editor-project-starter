# __TITLE__

__SCRATCH_SECTION__
## このリポジトリについて

この作品は、[TurboWarp Plus Editor](https://kubohiroya.github.io/turbowarp-plus-editor/) で開発しています。作品は `__PROJECT_DIR__/` に、Git で変更を読める形（sb3-toolchain の作品フォルダ）で入っています。SB3 ファイルはリポジトリに入れず、GitHub Actions が作ります。

| 場所 | 中身 |
| --- | --- |
| `__PROJECT_DIR__/project.source.json` | ブロック・変数・リスト・スプライトの設定 |
| `__PROJECT_DIR__/assets/` | コスチューム・背景・音 |
| `__PROJECT_DIR__/sb3-source.json` | 作品フォルダの形式と SB3 にまとめるときの順序 |
| `scratch-project.json` | 取り込み元と、作品フォルダの場所 |
| `.github/` | 検査・リリース・Scratch からの取り込みの自動処理と、issue・プルリクエストの書式 |

## 遊ぶ

[Releases](../../releases) から最新の `.sb3` をダウンロードし、[TurboWarp](https://turbowarp.org/) か [Scratch](https://scratch.mit.edu/projects/editor/) の「ファイル」→「コンピューターから読み込む」で開きます。

## 開発の流れ

1. やりたいことや不具合を **issue** に書きます。
2. Plus Editor のメニューバーのブランチのボタン（リポジトリを選ぶ前は「Git」）から「リポジトリを選択…」でこのリポジトリのフォルダを選び、作業用の **ブランチ** を作ります。
3. `__PROJECT_DIR__` を開いて編集し、「ファイル」→「保存」で作品フォルダに書き戻します。
4. ローカル Git パネルで変更を確かめて **コミット** し、GitHub に **push** します。
5. GitHub で **プルリクエスト** を作ります。Actions の「Check project」が作品を検査し、試せる SB3 を作ります。
6. ブロック単位で変更を確かめてから **マージ** します。
7. 配れる状態になったら GitHub で **リリース** を作ります。SB3 が自動で添付されます。

それぞれの手順の詳しい説明は、[GitHub で作品を開発する](__GUIDE_URL__)を読んでください。

## 手元で SB3 を作る

Node.js 24 以降が必要です。

```bash
npx --yes @kubohiroya/sb3-toolchain@__TOOLCHAIN_VERSION__ check __PROJECT_DIR__
npx --yes @kubohiroya/sb3-toolchain@__TOOLCHAIN_VERSION__ build __PROJECT_DIR__ --output dist/__SB3_NAME__.sb3
```
