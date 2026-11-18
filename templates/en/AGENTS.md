# Working rules for coding agents

This repository develops a Scratch project with [TurboWarp Plus Editor](https://kubohiroya.github.io/turbowarp-plus-editor/). The intended split is that a person edits and saves the project in the Editor, and a coding agent handles Git and GitHub: branches, commits, pushes and pull requests. A person decides when to merge and when to release.

## Where things are

| Path | Contents |
| --- | --- |
| `project.source.json` | Blocks, variables, lists and sprite settings (formatted JSON) |
| `assets/` | Costumes, backdrops and sounds |
| `extensions/`, `embedded-extensions.json` | Extensions embedded in the project |
| `sb3-source.json` | The folder format and the order used to build the SB3 |
| `scratch-project.json` | The Scratch project it came from |
| `.github/` | Checks, releases, Import from Scratch, and the issue and pull request forms |

The repository folder itself is the sb3-toolchain v1 project folder. The Editor opens it with File → Open Folder… and saves to the project files at the root. When the project has block palette settings, the Editor also keeps `block-palette.json` there.

SB3 files are never committed; GitHub Actions builds them from the project folder.

## Sharing the folder with the Editor

A person may have this repository's folder open in the Editor while you work. The Editor keeps the project in memory; when the folder changes outside it, it shows "External changes detected." at the bottom right and loads the changes again. While the Editor has unsaved edits, it cannot take the folder's changes as they are.

- Before anything that rewrites files in the working tree (switching branches, pull, merge, rebase, reset, stash), ask the person whether they have chosen "File" → "Save Project" in the Editor and stopped the project.
- If they say they are still editing, leave the working tree alone. Commit what the person has saved.
- After you rewrite the working tree, tell the person to reload from the "External changes detected." notice at the bottom right of the Editor. Changes to values and positions may load on their own.

## Changing the project folder

- Run the commands at the repository root.

- After changing `project.source.json`, always run the check before committing:

  ```bash
  npx --yes @kubohiroya/sb3-toolchain@__TOOLCHAIN_VERSION__ check .
  ```

- To build an SB3 for trying, write it to `dist/`, which is never committed:

  ```bash
  npx --yes @kubohiroya/sb3-toolchain@__TOOLCHAIN_VERSION__ build . --output dist/__SB3_NAME__.sb3 --yes
  ```

- Leave adding and removing costumes, backdrops and sounds to the person in the Editor. Do not break the links between files in `assets/` and `project.source.json` or `sb3-source.json` by hand.
- `.*.rollback-*` files are left by sb3-toolchain when it rolls back a replacement. Do not delete them without asking the person to compare them first.

## Git and GitHub

- Make each change with one issue, one branch and one pull request. Put the issue number and the topic in the branch name, for example `12-cat-walk`.
- Never commit or push directly to `main`.
- Before committing, check `git status` and the diff for files that should not be there. Write the commit message about what changed in the project.
- Fill in `.github/pull_request_template.md` for pull requests, and put `Closes #<number>` in the description.
- Ask the person for a review once the "Check project" action passes. They can compare the change block by block in the Editor's Merge view.
- Merge, release, force-push, delete branches or change repository settings only when the person clearly asks.
- Pull requests from "Import from Scratch" bring in a version shared again on Scratch. Leave the decision on their content to the person.

The whole workflow is described in [Develop projects on GitHub](__GUIDE_URL__).
