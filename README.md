# TurboWarp Plus Editor Project Starter

English | [日本語](README.ja.md)

Move a project you have been making on Scratch (scratch.mit.edu) into a GitHub repository developed with [TurboWarp Plus Editor](https://kubohiroya.github.io/turbowarp-plus-editor/). The project is expanded into a project folder whose changes Git can show, and the repository comes with GitHub Actions that check, release and import from Scratch, plus issue and pull request forms.

How to work after the move (issue → branch → edit → commit → push → pull request → merge → release) is explained in the Plus Editor feature guide, [Developing a project on GitHub](https://kubohiroya.github.io/turbowarp-plus-editor/features/github/) (Japanese).

## Overview

```text
Scratch project ──init──▶ local Git repository ──publish──▶ GitHub ──▶ develop in Plus Editor
 (URL or .sb3)            project folder in project/        (private by default)
                          README, Actions, forms
```

## Requirements

- A GitHub account
- Node.js 24 or later (comes with `npx`)
- Git, with `user.name` and `user.email` set. For a public repository, your GitHub `noreply` address keeps your real address private.
- GitHub CLI (`gh`), signed in once with `gh auth login`
- Chrome or Edge: Plus Editor needs File System Access to read and write the project folder
- Optional: [GitHub Desktop](https://desktop.github.com/) for push and pull, which the web version of Plus Editor leaves to other tools

## 1. Pick the project

- **Shared on Scratch**: use the project page URL, such as `https://scratch.mit.edu/projects/123456789/`. The tool downloads the project and every costume and sound, checking each file against its MD5.
- **Not shared**: open it in the Scratch editor, choose File → Save to your computer, and use the `.sb3` file. Nobody, this tool included, can download an unshared project.
- **Saved from TurboWarp**: use the `.sb3` as is.

Projects shared on Scratch are licensed under [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/). The generated README credits the original project and author; keep that credit when the project is not yours.

## 2. Make the local repository (init)

```bash
npx @kubohiroya/turbowarp-plus-editor-project-starter@0.1.0 init https://scratch.mit.edu/projects/123456789/ --lang en
npx @kubohiroya/turbowarp-plus-editor-project-starter@0.1.0 init ~/Downloads/cat-adventure.sb3 --dir cat-adventure --lang en
```

This creates a Git repository in a folder named after the project (`scratch-<id>` when the title has no Latin letters) and makes the first commit. Only the download from Scratch touches the network; nothing is sent to GitHub yet.

| Option | Meaning | Default |
| --- | --- | --- |
| `--dir <folder>` | Repository folder; must be empty or missing | From the title |
| `--title <title>` | README title | Scratch title or file name |
| `--project-dir <name>` | Project folder name | `project` |
| `--lang ja\|en` | Language of the README and the forms | `ja` |
| `--no-commit` | Stage the files without committing | — |

## 3. What you get

| Path | Contents |
| --- | --- |
| `README.md` | Description, instructions and notes from Scratch (quoted), how to play, how to work |
| `scratch-project.json` | The Scratch project it came from, and the project folder's name |
| `project/` | The sb3-toolchain v1 project folder: `project.source.json`, `assets/`, `sb3-source.json` |
| `.github/workflows/check.yml` | Validates the project on every push and pull request and uploads an SB3 to try |
| `.github/workflows/release.yml` | Attaches the SB3 and its SHA-256 to every published release |
| `.github/workflows/scratch-import.yml` | Brings the latest shared version from Scratch in as a pull request |
| `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md` | Bug and idea forms, and a pull request checklist |

SB3 files are not committed; GitHub Actions builds them from the project folder.

## 4. Send it to GitHub (publish)

```bash
npx @kubohiroya/turbowarp-plus-editor-project-starter@0.1.0 publish cat-adventure
```

Creates the repository with the GitHub CLI and pushes `main`. It is **private** unless you pass `--public`; `--name <[owner/]name>` changes the name or owner. `origin` is set to the HTTPS URL, which Plus Editor's GitHub connection uses; if git asks for a password over HTTPS, run `gh auth setup-git` once. It also turns on "Allow GitHub Actions to create and approve pull requests" for Import from Scratch; pass `--no-actions-prs` to leave that off.

## 5. Open it in Plus Editor

Open [Plus Editor](https://kubohiroya.github.io/turbowarp-plus-editor/editor.html) in Chrome or Edge, press the branch button in the menu bar, left of the stage button (it reads Git until a repository is chosen), choose Choose Repository… and select the repository folder, then pick `project` in the Local Git panel and press Open This Project. File → Open project folder… opens the project folder alone.

## 6. Decide what happens on Scratch

- **Move now**: say in the Scratch project's Notes and Credits that development moved to GitHub, with the URL. To update Scratch, open a release's SB3 in the Scratch editor and choose Save now; Scratch cannot be written to from outside, so this step is manual.
- **Keep editing on Scratch for a while**: after sharing a new version on Scratch, run Actions → Import from Scratch → Run workflow, or `reimport` locally. The import **replaces** the project folder with the Scratch version, so changes made on GitHub show up as removed in that pull request. Edit in one place at a time. `reimport` stops without changing anything while the folder has uncommitted changes.

Pull requests opened by Actions do not start "Check project" on their own (a GitHub rule); close and reopen the pull request to run it.

## Commands

| Command | What it does |
| --- | --- |
| `init <URL\|ID\|.sb3>` | Make a local Git repository and the first commit |
| `publish [<folder>]` | Create the GitHub repository and push `main` |
| `reimport [<URL\|ID\|.sb3>]` | Replace the project folder with a newer version (default: the recorded Scratch project) |
| `fetch <URL\|ID>` | Only download a shared Scratch project as `.sb3` |

The JavaScript API exports `initProject`, `publishProject`, `reimportProject` and `fetchScratchProject`.

## Development

With Node.js 26. The tests never reach the network; a stand-in answers for the Scratch servers.

```bash
npm ci
npm test
```

Expansion and SB3 builds use a pinned [sb3-toolchain](https://github.com/kubohiroya/sb3-toolchain); the generated repository's Actions pin the same version.

## Prepare an initial commit in a browser

The `/seed` entry point takes the browser unpacker and version of sb3-toolchain, then creates the project folder, README and optional license in memory. The files use the same project folder format as the CLI.

```ts
import {packageVersion, unpackSb3} from '@kubohiroya/sb3-toolchain/browser';
import {createRepositorySeed} from '@kubohiroya/turbowarp-plus-editor-project-starter/seed';

const {files, warnings} = createRepositorySeed({
    sb3: new Uint8Array(await sb3File.arrayBuffer()),
    title: 'My project',
    description: 'A short project description',
    language: 'en'
}, {unpackSb3, toolchainVersion: packageVersion});
```

`files` is an array of `{path, bytes}` pairs. Show `warnings` before publishing. Import errors are distinguished by `SeedError.code`. To add a license, pass its identifier and complete text as `license: {name, text}`.

## License

SPDX-License-Identifier: MPL-2.0
