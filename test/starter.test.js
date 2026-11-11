import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile, mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {after, before, describe, test} from 'node:test';
import {strToU8, unzipSync, zipSync} from 'fflate';
import {parse as parseYaml} from 'yaml';
import {
    fetchScratchProject, initProject, parseScratchProjectId, reimportProject, renderTemplates, slugify, ScratchFetchError
} from '../dist/index.js';

const svg = (color) => strToU8(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="${color}"/></svg>`);
const md5 = (bytes) => createHash('md5').update(bytes).digest('hex');

function project(costumeBytes, variableValue = 0) {
    const id = md5(costumeBytes);
    return {
        targets: [{
            isStage: true, name: 'Stage', variables: {v1: ['score', variableValue]}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
            currentCostume: 0, costumes: [{name: 'backdrop1', dataFormat: 'svg', assetId: id, md5ext: `${id}.svg`, rotationCenterX: 5, rotationCenterY: 5}],
            sounds: [], volume: 100, layerOrder: 0, tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
        }],
        monitors: [], extensions: [], meta: {semver: '3.0.0', vm: '0.2.0', agent: 'test'}
    };
}

function sb3(costumeBytes, variableValue) {
    const id = md5(costumeBytes);
    return zipSync({'project.json': strToU8(JSON.stringify(project(costumeBytes, variableValue))), [`${id}.svg`]: costumeBytes});
}

/** A fetch that answers like scratch.mit.edu for one project. */
function scratchServer({id, meta, projectJson, assets, status = {}}) {
    const calls = [];
    const fetchImpl = async (url) => {
        calls.push(url);
        const respond = (body, code = 200) => new Response(body, {status: code});
        if (status[url]) return respond('', status[url]);
        if (url === `https://api.scratch.mit.edu/projects/${id}`) return respond(JSON.stringify(meta));
        if (url.startsWith(`https://projects.scratch.mit.edu/${id}`)) return respond(projectJson);
        const asset = /internalapi\/asset\/([^/]+)\/get\/$/.exec(url);
        if (asset && assets[asset[1]]) return respond(assets[asset[1]]);
        return respond('', 404);
    };
    return {fetchImpl, calls};
}

let work;
let env;
before(async () => {
    work = await mkdtemp(path.join(os.tmpdir(), 'starter-test-'));
    // Give git an identity without touching the person's own configuration.
    const gitconfig = path.join(work, 'gitconfig');
    await writeFile(gitconfig, '[user]\n\tname = Starter Test\n\temail = starter@example.invalid\n[init]\n\tdefaultBranch = main\n');
    env = {GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1'};
    Object.assign(process.env, env);
});
after(() => rm(work, {recursive: true, force: true}));

describe('parseScratchProjectId', () => {
    test('reads the ID from what people paste', () => {
        assert.equal(parseScratchProjectId('10128407'), '10128407');
        assert.equal(parseScratchProjectId(' https://scratch.mit.edu/projects/10128407/ '), '10128407');
        assert.equal(parseScratchProjectId('https://scratch.mit.edu/projects/10128407/editor/'), '10128407');
        assert.equal(parseScratchProjectId('scratch.mit.edu/projects/10128407'), '10128407');
        assert.equal(parseScratchProjectId('https://scratch.mit.edu/projects/10128407?x=1'), '10128407');
    });
    test('rejects anything else', () => {
        assert.equal(parseScratchProjectId('project.sb3'), null);
        assert.equal(parseScratchProjectId('https://example.com/projects/123'), null);
        assert.equal(parseScratchProjectId('https://scratch.mit.edu/users/someone'), null);
        assert.equal(parseScratchProjectId(''), null);
    });
});

describe('slugify', () => {
    test('makes ASCII names and falls back for titles without Latin letters', () => {
        assert.equal(slugify('Paper Minecraft v11.7 (Minecraft 2D)', 'x'), 'paper-minecraft-v11-7-minecraft-2d');
        assert.equal(slugify('Café Jump!', 'x'), 'cafe-jump');
        assert.equal(slugify('ねこのぼうけん', 'scratch-123'), 'scratch-123');
    });
});

describe('fetchScratchProject', () => {
    const costume = svg('red');
    const id = md5(costume);
    const projectJson = JSON.stringify(project(costume));

    test('packs project.json and each asset into an SB3 and keeps what Scratch says about the project', async () => {
        const server = scratchServer({
            id: '42', projectJson, assets: {[`${id}.svg`]: costume},
            meta: {title: 'My Game', project_token: 'tok en', author: {username: 'alice'}, instructions: 'Press space', description: 'Thanks'}
        });
        const fetched = await fetchScratchProject('42', {fetch: server.fetchImpl});
        assert.deepEqual(fetched.info, {
            id: '42', url: 'https://scratch.mit.edu/projects/42/', title: 'My Game', author: 'alice', instructions: 'Press space', notes: 'Thanks'
        });
        assert.ok(server.calls.includes('https://projects.scratch.mit.edu/42?token=tok%20en'));
        const entries = unzipSync(fetched.sb3);
        assert.deepEqual(Object.keys(entries), ['project.json', `${id}.svg`]);
        assert.deepEqual(entries[`${id}.svg`], costume);
    });

    test('refuses an asset whose bytes do not match its MD5', async () => {
        const server = scratchServer({id: '42', projectJson, assets: {[`${id}.svg`]: svg('blue')}, meta: {title: 'x', project_token: 't'}});
        await assert.rejects(fetchScratchProject('42', {fetch: server.fetchImpl}), (error) => error instanceof ScratchFetchError && error.code === 'integrity');
    });

    test('explains how to save an unshared project by hand', async () => {
        const server = scratchServer({id: '42', projectJson, assets: {}, meta: {}, status: {'https://api.scratch.mit.edu/projects/42': 404}});
        await assert.rejects(fetchScratchProject('42', {fetch: server.fetchImpl}), /Save to your computer/);
    });

    test('asks for an SB3 when the project is still in the Scratch 2 format', async () => {
        const server = scratchServer({id: '42', projectJson: JSON.stringify({objName: 'Stage', children: []}), assets: {}, meta: {title: 'old', project_token: 't'}});
        await assert.rejects(fetchScratchProject('42', {fetch: server.fetchImpl}), (error) => error.code === 'scratch2');
    });

    test('does not follow an asset name that is not an MD5 file name', async () => {
        const bad = project(costume);
        bad.targets[0].costumes[0].md5ext = '../../evil';
        const server = scratchServer({id: '42', projectJson: JSON.stringify(bad), assets: {}, meta: {title: 'x', project_token: 't'}});
        await assert.rejects(fetchScratchProject('42', {fetch: server.fetchImpl}), (error) => error.code === 'invalid');
        assert.ok(!server.calls.some(url => url.includes('evil')));
    });
});

describe('renderTemplates', () => {
    for (const language of ['ja', 'en']) {
        test(`fills every placeholder and writes valid YAML (${language})`, async () => {
            const files = await renderTemplates({
                title: 'Game', projectDirectory: 'project', sb3Name: 'game', toolchainVersion: '0.22.0', starterVersion: '0.1.0', language, scratch: null
            });
            assert.deepEqual([...files.keys()].sort(), [
                '.gitattributes', '.github/ISSUE_TEMPLATE/bug.yml', '.github/ISSUE_TEMPLATE/config.yml', '.github/ISSUE_TEMPLATE/idea.yml',
                '.github/pull_request_template.md', '.github/workflows/check.yml', '.github/workflows/release.yml',
                '.github/workflows/scratch-import.yml', '.gitignore', 'README.md'
            ]);
            for (const [file, text] of files) {
                assert.doesNotMatch(text, /__[A-Z0-9_]+__/, file);
                if (file.endsWith('.yml')) assert.doesNotThrow(() => parseYaml(text), file);
            }
            const check = parseYaml(files.get('.github/workflows/check.yml'));
            assert.match(check.jobs.check.steps.at(-2).run, /sb3-toolchain@0\.22\.0 build project --output dist\/game\.sb3/);
            const release = parseYaml(files.get('.github/workflows/release.yml'));
            assert.deepEqual(release.on.release.types, ['published']);
            assert.match(parseYaml(files.get('.github/workflows/scratch-import.yml')).jobs.import.steps[2].run, /project-starter@0\.1\.0/);
        });
    }

    test('shows text from Scratch as quoted text, never as links or HTML', async () => {
        const files = await renderTemplates({
            title: 'Game', projectDirectory: 'project', sb3Name: 'game', toolchainVersion: '0.22.0', starterVersion: '0.1.0', language: 'en',
            scratch: {id: '1', url: 'https://scratch.mit.edu/projects/1/', title: 'A](javascript:x) __TITLE__', author: 'bob',
                instructions: '<script>alert(1)</script>\n# not a heading\nsee https://example.com/a_b', notes: ''}
        });
        const readme = files.get('README.md');
        assert.match(readme, /\[A\\\]\(javascript:x\) \\_\\_TITLE\\_\\_\]\(https:\/\/scratch\.mit\.edu\/projects\/1\/\)/);
        assert.match(readme, /> \\<script\\>alert\(1\)\\<\/script\\>/);
        assert.match(readme, /> \\# not a heading/);
        assert.match(readme, /https:\/\/example\.com\/a_b/);
        assert.doesNotMatch(readme, /Notes and credits/);
    });
});

describe('initProject and reimportProject', () => {
    const git = (cwd, ...args) => execFileSync('git', args, {cwd, encoding: 'utf8', env: {...process.env, ...env}}).trim();

    test('makes a committed repository from an .sb3 file, and re-imports a newer one', async () => {
        const input = path.join(work, 'My Game.sb3');
        await writeFile(input, sb3(svg('red')));
        const directory = path.join(work, 'repo');
        const result = await initProject({input, directory});

        assert.equal(result.committed, true);
        assert.equal(git(directory, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main');
        assert.equal(git(directory, 'status', '--porcelain'), '');
        assert.match(git(directory, 'log', '-1', '--format=%s'), /^Import "My Game" from My Game\.sb3$/);
        const manifest = JSON.parse(await readFile(path.join(directory, 'scratch-project.json'), 'utf8'));
        assert.deepEqual(manifest, {formatVersion: 1, projectDirectory: 'project', sb3Name: 'my-game', language: 'ja', scratch: null});
        const source = JSON.parse(await readFile(path.join(directory, 'project/project.source.json'), 'utf8'));
        assert.equal(source.targets[0].name, 'Stage');
        assert.doesNotMatch(await readFile(path.join(directory, 'README.md'), 'utf8'), /Scratch で公開されている作品/);

        await assert.rejects(reimportProject({directory}), /not imported from Scratch/);

        const newer = path.join(work, 'newer.sb3');
        await writeFile(newer, sb3(svg('green'), 7));
        const summaryPath = path.join(work, 'summary.md');
        const reimported = await reimportProject({directory, input: newer, summaryPath});
        assert.equal(reimported.changed, true);
        assert.match(await readFile(summaryPath, 'utf8'), /^# Scratch から最新の版を取り込む/);
        assert.match(git(directory, 'status', '--porcelain'), /project\//);

        // Uncommitted work in the folder is never overwritten.
        await assert.rejects(reimportProject({directory, input}));
        assert.match(await readFile(path.join(directory, 'project/project.source.json'), 'utf8'), /"score",\s*7/);
    });

    test('takes a Scratch project and records where it came from', async () => {
        const costume = svg('purple');
        const server = scratchServer({
            id: '77', projectJson: JSON.stringify(project(costume)), assets: {[`${md5(costume)}.svg`]: costume},
            meta: {title: 'Cat Jump', project_token: 't', author: {username: 'carol'}, instructions: 'Space to jump', description: ''}
        });
        const directory = path.join(work, 'from-scratch');
        await initProject({input: 'https://scratch.mit.edu/projects/77/', directory, language: 'en', fetch: server.fetchImpl});
        const manifest = JSON.parse(await readFile(path.join(directory, 'scratch-project.json'), 'utf8'));
        assert.deepEqual(manifest.scratch, {id: '77', url: 'https://scratch.mit.edu/projects/77/', title: 'Cat Jump', author: 'carol'});
        assert.equal(manifest.sb3Name, 'cat-jump');
        const readme = await readFile(path.join(directory, 'README.md'), 'utf8');
        assert.match(readme, /^# Cat Jump\n\nBased on the Scratch project "\[Cat Jump\]\(https:\/\/scratch\.mit\.edu\/projects\/77\/\)" by carol/);
        assert.match(readme, /## Instructions\n\n> Space to jump/);
        assert.match(git(directory, 'log', '-1', '--format=%B'), /Source: https:\/\/scratch\.mit\.edu\/projects\/77\//);

        const unchanged = await reimportProject({directory, fetch: server.fetchImpl});
        assert.equal(unchanged.changed, false);
    });

    test('refuses a folder that already has files', async () => {
        const input = path.join(work, 'My Game.sb3');
        const directory = path.join(work, 'occupied');
        await mkdir(directory);
        await writeFile(path.join(directory, 'keep.txt'), 'mine');
        await assert.rejects(initProject({input, directory}), /not empty/);
        assert.equal(await readFile(path.join(directory, 'keep.txt'), 'utf8'), 'mine');
    });
});
