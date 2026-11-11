#!/usr/bin/env node
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {initProject, publishProject, reimportProject, starterVersion, toolchainVersion} from './project.js';
import {fetchScratchProject, parseScratchProjectId} from './scratch.js';

const usage = `turbowarp-plus-editor-project-starter ${starterVersion} (sb3-toolchain ${toolchainVersion})

Move a Scratch project into a GitHub repository developed with TurboWarp Plus Editor.

Usage:
  init <scratch-url | project-id | file.sb3> [--dir <folder>] [--title <title>]
       [--project-dir <name>] [--lang ja|en] [--no-commit]
      Make a local Git repository: the project expanded into <folder>/project, a README,
      GitHub Actions (check, release, import from Scratch) and issue / pull request forms.

  publish [<folder>] [--name <[owner/]repo>] [--public | --private] [--no-actions-prs]
      Create the GitHub repository with the GitHub CLI (gh) and push main. Private by default.

  reimport [<scratch-url | project-id | file.sb3>] [--dir <folder>] [--summary <file.md>]
      Replace the project folder with the latest version (by default the shared version on
      Scratch recorded at init) so the difference can be reviewed and committed.

  fetch <scratch-url | project-id> [--output <file.sb3>]
      Only download a shared Scratch project as an .sb3 file.

Only projects shared on scratch.mit.edu can be downloaded. For an unshared project, open it in
the Scratch editor, choose File → Save to your computer, and pass the .sb3 file.
`;

function fail(message: string): never {
    console.error(`Error: ${message}`);
    process.exit(1);
}

async function main(argv: string[]): Promise<void> {
    const [command, ...rest] = argv;
    if (!command || command === '--help' || command === '-h' || command === 'help') {
        console.log(usage);
        return;
    }
    if (command === '--version' || command === '-v') {
        console.log(starterVersion);
        return;
    }
    const log = (message: string) => console.log(message);

    if (command === 'init') {
        const {values, positionals} = parseArgs({args: rest, allowPositionals: true, options: {
            dir: {type: 'string'}, title: {type: 'string'}, 'project-dir': {type: 'string'},
            lang: {type: 'string', default: 'ja'}, 'no-commit': {type: 'boolean', default: false}
        }});
        if (positionals.length !== 1) fail('init takes one Scratch project URL, project ID or .sb3 file.');
        if (values.lang !== 'ja' && values.lang !== 'en') fail('--lang must be ja or en.');
        const result = await initProject({
            input: positionals[0], directory: values.dir, title: values.title,
            projectDirectory: values['project-dir'], language: values.lang, commit: !values['no-commit'], log
        });
        const relative = path.relative(process.cwd(), result.directory) || '.';
        log('');
        log(`Created ${result.directory}${result.committed ? ' and committed the import.' : '.'}`);
        if (result.manifest.scratch?.author) {
            log(`The Scratch author is ${result.manifest.scratch.author}. If this is not your project, keep its CC BY-SA 2.0 attribution in the README.`);
        }
        log('Next:');
        log(`  npx @kubohiroya/turbowarp-plus-editor-project-starter@${starterVersion} publish ${relative}`);
        log('  Then open https://kubohiroya.github.io/turbowarp-plus-editor/editor.html in Chrome or Edge,');
        log(`  press the branch button in the menu bar (it reads Git until a repository is chosen), choose Choose Repository…, select ${relative}, and open "${result.manifest.projectDirectory}".`);
        return;
    }

    if (command === 'publish') {
        const {values, positionals} = parseArgs({args: rest, allowPositionals: true, options: {
            name: {type: 'string'}, public: {type: 'boolean', default: false}, private: {type: 'boolean', default: false},
            'no-actions-prs': {type: 'boolean', default: false}
        }});
        if (values.public && values.private) fail('Choose either --public or --private.');
        if (positionals.length > 1) fail('publish takes at most one folder.');
        const result = await publishProject({
            directory: positionals[0] ?? '.', name: values.name, visibility: values.public ? 'public' : 'private',
            allowActionsPullRequests: !values['no-actions-prs'], log
        });
        log('');
        log(`Published ${result.url}`);
        return;
    }

    if (command === 'reimport') {
        const {values, positionals} = parseArgs({args: rest, allowPositionals: true, options: {
            dir: {type: 'string', default: '.'}, summary: {type: 'string'}
        }});
        if (positionals.length > 1) fail('reimport takes at most one Scratch project URL, project ID or .sb3 file.');
        const result = await reimportProject({directory: values.dir, input: positionals[0], summaryPath: values.summary, log});
        if (result.changed && result.differenceCounts) {
            const {added, modified, removed} = result.differenceCounts;
            log(`${added} added, ${modified} modified, ${removed} removed. Review with "git diff" or Plus Editor's Local Git panel, then commit.`);
        }
        return;
    }

    if (command === 'fetch') {
        const {values, positionals} = parseArgs({args: rest, allowPositionals: true, options: {output: {type: 'string'}}});
        const id = positionals.length === 1 ? parseScratchProjectId(positionals[0]) : null;
        if (!id) fail('fetch takes one Scratch project URL or ID.');
        const fetched = await fetchScratchProject(id, {userAgent: `turbowarp-plus-editor-project-starter/${starterVersion}`});
        const output = path.resolve(values.output ?? `${id}.sb3`);
        await writeFile(output, fetched.sb3, {flag: 'wx'}).catch(error => {
            if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail(`${output} already exists.`);
            throw error;
        });
        log(`Saved "${fetched.info.title}" (${fetched.assetCount} costumes and sounds) to ${output}`);
        return;
    }

    fail(`Unknown command "${command}". Run with --help.`);
}

main(process.argv.slice(2)).catch(error => fail(error instanceof Error ? error.message : String(error)));
