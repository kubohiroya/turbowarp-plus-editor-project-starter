import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {gzipSync} from 'node:zlib';
import {parse} from 'yaml';

const workflow = parse(await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8'));
const step = workflow.jobs.release.steps.find(step => step.name === 'Verify the published archive for a manual retry');
const source = step.run.match(/node --input-type=module <<'NODE'\n([\s\S]*?)\nNODE/)[1];
const revision = '1234567890123456789012345678901234567890';

async function runVerification({differentPayload = false, mutate = () => {}} = {}) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'release-archive-'));
    try {
        const payload = Buffer.from('project folder archive contents\n'.repeat(100));
        const local = gzipSync(payload, {level: 1});
        const published = gzipSync(differentPayload ? Buffer.from('different project') : payload, {level: 9});
        assert.notDeepEqual(local, published);
        const pkg = {name: '@test/project-folder-starter', version: '0.4.0'};
        const metadata = {...pkg, gitHead: revision, dist: {
            tarball: 'https://registry.npmjs.org/test.tgz',
            shasum: createHash('sha1').update(published).digest('hex'),
            integrity: 'sha512-' + createHash('sha512').update(published).digest('base64')
        }};
        mutate(metadata);
        const archive = path.join(directory, 'local.tgz');
        const remote = path.join(directory, 'published.tgz');
        const metadataPath = path.join(directory, 'metadata.json');
        await Promise.all([
            writeFile(archive, local), writeFile(remote, published),
            writeFile(metadataPath, JSON.stringify(metadata)),
            writeFile(path.join(directory, 'package.json'), JSON.stringify(pkg))
        ]);
        const stub = `globalThis.fetch = async () => new Response(await (await import('node:fs/promises')).readFile(process.env.TEST_ARCHIVE));\n`;
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', stub + source], {
            cwd: directory, encoding: 'utf8', env: {...process.env,
                NPM_ARCHIVE: archive, PUBLISHED_METADATA: metadataPath,
                SOURCE_REVISION: revision, TEST_ARCHIVE: remote}
        });
        return {...result, local, published, output: await readFile(archive)};
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
}

test('manual retry accepts equal tar payloads with different gzip bytes', async () => {
    const result = await runVerification();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.output, result.published);
});

test('manual retry rejects different tar contents and preserves the local archive', async () => {
    const result = await runVerification({differentPayload: true});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Published archive contents differ/);
    assert.deepEqual(result.output, result.local);
});

test('manual retry rejects a different source commit', async () => {
    const result = await runVerification({mutate: metadata => { metadata.gitHead = 'another-commit'; }});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Published source commit differs/);
    assert.deepEqual(result.output, result.local);
});

test('manual retry rejects a different package name or version', async () => {
    for (const field of ['name', 'version']) {
        const result = await runVerification({mutate: metadata => { metadata[field] = 'another'; }});
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /Published package (name|version) differs/);
        assert.deepEqual(result.output, result.local);
    }
});

test('manual retry rejects an archive with a different integrity', async () => {
    const result = await runVerification({mutate: metadata => { metadata.dist.integrity = 'sha512-wrong'; }});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Published archive integrity differs/);
    assert.deepEqual(result.output, result.local);
});

test('manual retry rejects an archive with a different SHA-1', async () => {
    const result = await runVerification({mutate: metadata => { metadata.dist.shasum = 'wrong'; }});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Published archive SHA-1 differs/);
    assert.deepEqual(result.output, result.local);
});
