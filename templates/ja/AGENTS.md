# エージェント向けの作業ルール

このリポジトリでは、Scratch の作品を [TurboWarp Plus Editor](https://kubohiroya.github.io/turbowarp-plus-editor/) で開発します。人がエディターで作品を編集して保存し、コーディングエージェントは Git と GitHub の操作（ブランチ・コミット・push・プルリクエスト）を受け持つ、という分担を想定しています。マージとリリースを決めるのは人です。

## ファイルの場所

| 場所 | 中身 |
| --- | --- |
| `__PROJECT_DIR__/` | sb3-toolchain v1 の作品フォルダ。エディターはこのフォルダを直接開いて保存する |
| `__PROJECT_DIR__/project.source.json` | ブロック・変数・リスト・スプライトの設定（整形した JSON） |
| `__PROJECT_DIR__/assets/` | コスチューム・背景・音 |
| `__PROJECT_DIR__/sb3-source.json` | 作品フォルダの形式と、SB3 にまとめるときの順序 |
| `scratch-project.json` | 取り込み元の Scratch 作品と、作品フォルダの場所 |
| `.github/` | 検査・リリース・Scratch からの取り込みの自動処理と、issue・プルリクエストの書式 |

SB3 ファイルはコミットしません。GitHub Actions が作品フォルダから作ります。

## エディターと同じフォルダを使うときの約束

人がエディターで `__PROJECT_DIR__/` を開いたまま作業していることがあります。エディターは作品をメモリーに持ち、フォルダが外で変わると右下に「外部変更あり」を出して読み込み直します。ただし、エディターに未保存の編集があると、フォルダの変更をそのまま反映できません。

- ブランチの切り替え、pull、merge、rebase、reset、stash など、作業ツリーのファイルを書き換える操作の前に、エディターで「ファイル」→「プロジェクトを保存」を済ませ、作品を止めたかを人に確かめてください。
- 人がまだ編集中だと言ったら、作業ツリーを書き換えないでください。コミットするのは、人が保存した内容です。
- 作業ツリーを書き換えたあとは、エディターの右下の「外部変更あり」から読み込み直すよう人に伝えてください。値や位置の変更は自動で反映されることがあります。

## 作品フォルダを変更するとき

- `project.source.json` を書き換えたら、コミットの前に必ず検査を通してください。

  ```bash
  npx --yes @kubohiroya/sb3-toolchain@__TOOLCHAIN_VERSION__ check __PROJECT_DIR__
  ```

- SB3 を作って確かめるときは `dist/` に出力します。`dist/` はコミットしません。

  ```bash
  npx --yes @kubohiroya/sb3-toolchain@__TOOLCHAIN_VERSION__ build __PROJECT_DIR__ --output dist/__SB3_NAME__.sb3 --yes
  ```

- コスチューム・背景・音の追加と削除は、エディターで行ってもらってください。`assets/` のファイルと `project.source.json`・`sb3-source.json` の対応を手で崩さないでください。
- `.*.rollback-*` は sb3-toolchain が差し替えを取り消したときに残すファイルです。中身を人に確かめずに消さないでください。

## Git と GitHub

- 1つの変更を、1つの issue・1つのブランチ・1つのプルリクエストで進めます。ブランチ名には issue の番号と内容を入れます（例：`12-neko-walk`）。
- `main` に直接コミットや push をしないでください。
- コミットの前に `git status` と差分を確かめ、意図しないファイルが入っていないかを見てください。コミットメッセージには、作品で何が変わったかを書きます。
- プルリクエストは `.github/pull_request_template.md` の書式に沿って書き、本文に `Closes #番号` を入れます。
- Actions の「Check project」が通ってから、人にレビューを頼んでください。人はエディターの「マージ」で、変更をブロック単位で比べられます。
- マージ、リリース、force push、ブランチの削除、リポジトリの設定の変更は、人がはっきり頼んだときだけ行います。
- 「Import from Scratch」が作るプルリクエストは、Scratch で共有し直した作品の取り込みです。内容の判断は人に任せてください。

手順全体の説明は [GitHub で作品を開発する](__GUIDE_URL__) にあります。
