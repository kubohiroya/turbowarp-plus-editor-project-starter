# __TITLE__

__SCRATCH_SECTION__
## About this repository

This project is developed with [TurboWarp Plus Editor](https://kubohiroya.github.io/turbowarp-plus-editor/). The repository folder is the project folder: the project sits at its root as an sb3-toolchain project folder, a form whose changes Git can show line by line. SB3 files are not committed; GitHub Actions builds them.

| Path | Contents |
| --- | --- |
| `project.source.json` | Blocks, variables, lists and sprite settings |
| `assets/` | Costumes, backdrops and sounds |
| `extensions/`, `embedded-extensions.json` | Extensions embedded in the project |
| `sb3-source.json` | The folder format and the order used to pack an SB3 |
| `scratch-project.json` | The Scratch project it was imported from |
| `.github/` | Automated checks, releases and imports from Scratch, plus issue and pull request forms |

## Play

Download the latest `.sb3` from [Releases](../../releases) and open it in [TurboWarp](https://turbowarp.org/) or [Scratch](https://scratch.mit.edu/projects/editor/) with File → Load from your computer.

## How we work

1. Describe an idea or a bug in an **issue**.
2. In Plus Editor, choose File → Open Folder…, select this repository's folder, and create a **branch** for the work.
3. Edit the project and choose File → Save to write back to the project folder.
4. Review the changes in the Local Git panel, **commit**, and **push** to GitHub.
5. Open a **pull request** on GitHub. The "Check project" action validates the project and builds an SB3 you can try.
6. Review the change script by script, then **merge**.
7. When it is ready to share, create a **release** on GitHub. The SB3 is attached automatically.

[Developing a project on GitHub](__GUIDE_URL__) explains each step.

## Build an SB3 locally

Run these at the repository root with Node.js 24 or later.

```bash
npx --yes @kubohiroya/sb3-toolchain@__TOOLCHAIN_VERSION__ check .
npx --yes @kubohiroya/sb3-toolchain@__TOOLCHAIN_VERSION__ build . --output dist/__SB3_NAME__.sb3
```
