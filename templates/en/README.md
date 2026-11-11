# __TITLE__

__SCRATCH_SECTION__
## About this repository

This project is developed with [TurboWarp Plus Editor](https://kubohiroya.github.io/turbowarp-plus-editor/). The project lives in `__PROJECT_DIR__/` as an sb3-toolchain project folder, a form whose changes Git can show line by line. SB3 files are not committed; GitHub Actions builds them.

| Path | Contents |
| --- | --- |
| `__PROJECT_DIR__/project.source.json` | Blocks, variables, lists and sprite settings |
| `__PROJECT_DIR__/assets/` | Costumes, backdrops and sounds |
| `__PROJECT_DIR__/sb3-source.json` | The folder format and the order used to pack an SB3 |
| `scratch-project.json` | Where the project was imported from, and where its folder is |
| `.github/` | Automated checks, releases and imports from Scratch, plus issue and pull request forms |

## Play

Download the latest `.sb3` from [Releases](../../releases) and open it in [TurboWarp](https://turbowarp.org/) or [Scratch](https://scratch.mit.edu/projects/editor/) with File → Load from your computer.

## How we work

1. Describe an idea or a bug in an **issue**.
2. In Plus Editor, choose File → Local Git…, select this repository's folder, and create a **branch** for the work.
3. Open `__PROJECT_DIR__`, edit, and choose File → Save to write back to the project folder.
4. Review the changes in the Local Git panel, **commit**, and **push** to GitHub.
5. Open a **pull request** on GitHub. The "Check project" action validates the project and builds an SB3 you can try.
6. Review the change script by script, then **merge**.
7. When it is ready to share, create a **release** on GitHub. The SB3 is attached automatically.

[Developing a project on GitHub](__GUIDE_URL__) explains each step.

## Build an SB3 locally

Requires Node.js 24 or later.

```bash
npx --yes @kubohiroya/sb3-toolchain@__TOOLCHAIN_VERSION__ check __PROJECT_DIR__
npx --yes @kubohiroya/sb3-toolchain@__TOOLCHAIN_VERSION__ build __PROJECT_DIR__ --output dist/__SB3_NAME__.sb3
```
