# TurboWarp Plus Editor Project Starter

[English](README.md) | 日本語

Scratch（scratch.mit.edu）で作ってきた作品を、[TurboWarp Plus Editor](https://kubohiroya.github.io/turbowarp-plus-editor/) で開発する GitHub リポジトリに移すためのツールです。作品を Git で変更を読める作品フォルダに展開し、検査・リリース・Scratch からの取り込みを自動で行う GitHub Actions と、issue・プルリクエストの書式をそろえたリポジトリを作ります。

移したあとの開発の進め方（issue → ブランチ → 編集 → コミット → push → プルリクエスト → マージ → リリース）は、Plus Editor の機能ガイド「[GitHub で作品を開発する](https://kubohiroya.github.io/turbowarp-plus-editor/features/github/)」で説明しています。

## 移行の流れ

```text
Scratch の作品 ──init──▶ 手元の Git リポジトリ ──publish──▶ GitHub ──▶ Plus Editor で開発
 (URL か .sb3)            project/ に作品フォルダ             (非公開が既定)
                          README・Actions・書式
```

| 手順 | すること | 使うもの |
| --- | --- | --- |
| 1 | 移す作品を決め、URL か .sb3 ファイルを用意する | Scratch |
| 2 | 手元にリポジトリを作る（`init`） | このツール |
| 3 | 中身を確かめる | ファイル一覧・README |
| 4 | GitHub にリポジトリを作って送る（`publish`） | このツール・GitHub CLI |
| 5 | Plus Editor で作品フォルダを開く | Chrome か Edge |
| 6 | Scratch 側の扱いを決める | Scratch・Actions |

## 用意するもの

- **GitHub のアカウント**
- **Node.js 24 以降**：[nodejs.org](https://nodejs.org/) から入れます。`npx` もいっしょに入ります。
- **Git**：[git-scm.com](https://git-scm.com/) から入れ、記録に使う名前とメールアドレスを設定します。
  GitHub に公開するリポジトリでは、メールアドレスに GitHub の `noreply` アドレスを使うと、本当のアドレスを公開せずに済みます。

  ```bash
  git config --global user.name "あなたの名前"
  git config --global user.email "あなたのメールアドレス"
  ```

- **GitHub CLI（`gh`）**：[cli.github.com](https://cli.github.com/) から入れ、一度だけ `gh auth login` で GitHub にログインします。
- **Chrome か Edge**：Plus Editor が作品フォルダを読み書きするのに、File System Access に対応したブラウザーが必要です。
- **GitHub Desktop（あると便利）**：Web 版の Plus Editor では、push・pull をパネルの外で行います。コマンドに慣れていなければ [GitHub Desktop](https://desktop.github.com/) が使えます。

## 1. 移す作品を用意する

- **Scratch で共有している作品**：作品ページの URL（例：`https://scratch.mit.edu/projects/123456789/`）をそのまま使えます。ツールが作品と、すべてのコスチューム・音をダウンロードし、ファイルごとに MD5 を照合します。
- **共有していない作品**：Scratch のエディターで作品を開き、「ファイル」→「コンピューターに保存」で `.sb3` を保存し、そのファイルを使います。共有していない作品は、ほかの人にも、このツールにもダウンロードできません。
- **TurboWarp で保存した `.sb3`**：そのまま使えます。

自分のものではない作品（リミックス元など）を移す場合、Scratch で共有された作品は [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/deed.ja) で公開されています。作られた README には元の作品と作者を書き込むので、消さずに残してください。

## 2. 手元にリポジトリを作る（init）

作業用のフォルダで次を実行します。

```bash
npx @kubohiroya/turbowarp-plus-editor-project-starter@0.1.0 init https://scratch.mit.edu/projects/123456789/
```

`.sb3` から作る場合は、URL の代わりにファイルのパスを渡します。

```bash
npx @kubohiroya/turbowarp-plus-editor-project-starter@0.1.0 init ~/Downloads/ねこのぼうけん.sb3 --dir neko-adventure
```

作品名から作ったフォルダ（英数字にできない作品名では `scratch-<作品 ID>`）に Git リポジトリを作り、最初のコミットまで行います。ネットワークに送るのは Scratch からのダウンロードだけで、GitHub にはまだ何も送りません。

| オプション | 意味 | 既定 |
| --- | --- | --- |
| `--dir <フォルダ>` | 作るリポジトリのフォルダ。空か、存在しないこと | 作品名から作る |
| `--title <題名>` | README の題名 | Scratch の作品名かファイル名 |
| `--project-dir <名前>` | 作品フォルダの名前 | `project` |
| `--lang ja\|en` | README と issue・プルリクエストの書式の言語 | `ja` |
| `--no-commit` | ファイルを置いてステージするだけで、コミットしない | — |

Git に名前とメールアドレスが設定されていないと、ファイルをステージした状態で止まり、続けるためのコマンドを表示します。

## 3. 中身を確かめる

```text
neko-adventure/
├── README.md                 作品の説明・遊び方・開発の流れ
├── scratch-project.json      取り込み元の Scratch 作品と、作品フォルダの場所
├── project/                  作品フォルダ（sb3-toolchain v1 形式）
│   ├── project.source.json   ブロック・変数・スプライトの設定（整形した JSON）
│   ├── assets/               コスチューム・背景・音
│   ├── sb3-source.json
│   └── embedded-extensions.json
├── .github/
│   ├── workflows/check.yml          push・プルリクエストごとに検査し、試せる SB3 を作る
│   ├── workflows/release.yml        リリースを作ると SB3 と SHA-256 を添付する
│   ├── workflows/scratch-import.yml Scratch の最新版をプルリクエストとして取り込む
│   ├── ISSUE_TEMPLATE/              「不具合」「アイデア・改善」の書式
│   └── pull_request_template.md
├── .gitignore                SB3 などの生成物を入れない
└── .gitattributes            改行をそろえ、画像・音をバイナリとして扱う
```

Scratch の作品ページにある「使い方」と「メモとクレジット」は README に引用として入ります。SB3 ファイルそのものはリポジトリに入れません。GitHub Actions が作品フォルダから作ります。

## 4. GitHub に送る（publish）

```bash
npx @kubohiroya/turbowarp-plus-editor-project-starter@0.1.0 publish neko-adventure
```

GitHub CLI でリポジトリを作り、`main` を push します。次のことも行います。

- リポジトリは **非公開** で作ります。公開するなら `--public` を付けます。名前を変えるなら `--name <名前>`、組織に作るなら `--name <組織>/<名前>` を付けます。
- `origin` を HTTPS の URL にします。Plus Editor の「GitHub 接続」は HTTPS の `origin` を使います。HTTPS で push するときにパスワードを聞かれたら、一度だけ `gh auth setup-git` を実行します。
- 「Import from Scratch」が使えるよう、リポジトリの設定で GitHub Actions がプルリクエストを作ることを許可します（Settings → Actions → General の「Allow GitHub Actions to create and approve pull requests」）。許可したくなければ `--no-actions-prs` を付けます。

`publish` を使わずに、GitHub の画面で空のリポジトリを作り、`git remote add origin https://github.com/<あなた>/<名前>.git` と `git push -u origin main` で送ることもできます。GitHub Desktop の「Publish repository」も使えます。

## 5. Plus Editor で開く

1. Chrome か Edge で [Plus Editor](https://kubohiroya.github.io/turbowarp-plus-editor/editor.html?lang=ja) を開きます。
2. 「ファイル」→「ローカル Git…」を選び、「リポジトリを選択…」で作ったリポジトリのフォルダ（`neko-adventure`）を選び、読み書きを許可します。
3. 一覧から作品フォルダ `project` を選び、「この作品を開く」を押します。

作品フォルダだけを開くなら「ファイル」→「プロジェクトフォルダを開く…」で `project` を選びます。ここからの開発の手順は「[GitHub で作品を開発する](https://kubohiroya.github.io/turbowarp-plus-editor/features/github/)」を読んでください。

## 6. Scratch 側をどう扱うか

移したあとも Scratch の作品ページはそのまま残ります。どちらで編集するかを決めておきます。

- **すぐに GitHub に移る**：Scratch の作品ページの「メモとクレジット」に、開発を GitHub に移したことと、リポジトリの URL を書いておきます。Scratch の作品は、配りたいときに Releases の SB3 を Scratch のエディターで開き、「今すぐ保存」で上書きします。Scratch には外から作品を書き込む仕組みがないので、この上書きは手で行います。
- **しばらく Scratch でも編集する**：Scratch で編集して共有し直したら、GitHub の「Actions」→「Import from Scratch」→「Run workflow」を実行します。Scratch の最新版との違いがプルリクエストになるので、ブロック単位で確かめてからマージします。手元では `reimport` でも同じことができます。

  ```bash
  cd neko-adventure
  npx @kubohiroya/turbowarp-plus-editor-project-starter@0.1.0 reimport
  git diff --stat
  ```

  取り込みは作品フォルダを Scratch の版で **置き換えます**。GitHub 側で進めた変更は、そのプルリクエストでは消える変更として表れます。両方で同時に編集せず、編集する場所を一度に一つにしてください。コミットしていない変更が作品フォルダにあるときは、`reimport` は何も変えずに止まります。

Actions が作ったプルリクエストでは、GitHub の仕様で「Check project」が自動では動きません。プルリクエストを一度閉じて開き直すと動きます。

## うまくいかないとき

| 表示 | 原因と対処 |
| --- | --- |
| `is not shared, or does not exist` | 作品が共有されていないか、URL が違います。Scratch で `.sb3` を保存して渡します |
| `still in the Scratch 2 format` | 古い形式の作品です。Scratch のエディターで開いて `.sb3` を保存して渡します |
| `already exists and is not empty` | `--dir` で別のフォルダを指定します。既存のファイルは変えません |
| `gh … failed` | `gh auth status` でログインを確かめます。同じ名前のリポジトリがあれば `--name` で変えます |
| Plus Editor で作品フォルダを開けない | カスタム拡張機能・埋め込み拡張・フォントを含む作品は、まだ作品フォルダとして開けません。Scratch で作った作品には含まれません |

## コマンド

| コマンド | すること |
| --- | --- |
| `init <URL\|ID\|.sb3>` | 手元に Git リポジトリを作り、最初のコミットまで行う |
| `publish [<フォルダ>]` | GitHub にリポジトリを作り、`main` を送る |
| `reimport [<URL\|ID\|.sb3>]` | 作品フォルダを新しい版で置き換える（既定は記録した Scratch の作品） |
| `fetch <URL\|ID>` | Scratch の共有作品を `.sb3` としてダウンロードするだけ |

`--help` ですべてのオプションを表示します。JavaScript からは `initProject`・`publishProject`・`reimportProject`・`fetchScratchProject` を使えます。

## 開発

Node.js 26 で次を実行します。テストはネットワークに接続せず、Scratch のサーバーの代わりに応答を返す関数を使います。

```bash
npm ci
npm test
```

作品フォルダへの展開と SB3 の再生成は [sb3-toolchain](https://github.com/kubohiroya/sb3-toolchain) の版を固定して使います。作るリポジトリの Actions も同じ版を使います。

## ライセンス

SPDX-License-Identifier: MPL-2.0
