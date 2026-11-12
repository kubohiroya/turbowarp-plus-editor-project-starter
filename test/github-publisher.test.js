import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {strToU8, zipSync} from 'fflate';
import {createGitHubPublisher} from '../dist/index.js';

const credentials = {account: {login: 'octo', id: 123}, accessToken: 'test_token'};
const draft = {account: 'octo', name: 'game', title: 'Example', description: 'A game', topics: ['scratch'],
    private: true, license: 'mit', language: 'en'};

const font = strToU8('Font bytes');
const fontName = createHash('md5').update(font).digest('hex') + '.woff2';
const extension = 'Scratch.extensions.register({});';
const project = {targets: [{name: 'Stage', isStage: true, costumes: [], sounds: []}], extensions: ['example'],
    extensionURLs: {example: 'data:text/javascript;base64,' + Buffer.from(extension).toString('base64')},
    customFonts: [{system: false, family: 'Test', fallback: 'Serif', md5ext: fontName}]};
const sb3 = zipSync({'project.json': strToU8(JSON.stringify(project)), [fontName]: font});
const license = {key: 'mit', spdx_id: 'MIT', body: 'Test MIT license\n'};

async function gitHttp(root, url, options) {
    const {pathname, search} = new URL(url);
    const method = options.method ?? 'GET';
    const child = spawn('git', ['http-backend'], {env: {
        ...process.env, GIT_PROJECT_ROOT: root, GIT_HTTP_EXPORT_ALL: '1', REMOTE_USER: 'octo',
        PATH_INFO: pathname, QUERY_STRING: search.slice(1), REQUEST_METHOD: method,
        CONTENT_TYPE: new Headers(options.headers).get('Content-Type') ?? ''
    }});
    const read = (async () => {
        const chunks = [];
        for await (const chunk of child.stdout) chunks.push(chunk);
        return Buffer.concat(chunks);
    })();
    const done = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', code => code === 0 ? resolve() : reject(new Error('git http-backend failed')));
    });
    child.stderr.resume();
    child.stdin.on('error', () => {});
    for await (const chunk of options.body ?? []) child.stdin.write(chunk);
    child.stdin.end();
    const [output] = await Promise.all([read, done]);
    const split = output.indexOf('\r\n\r\n');
    assert.notEqual(split, -1);
    const headers = new Headers();
    let status = 200;
    for (const line of output.subarray(0, split).toString().split('\r\n')) {
        const separator = line.indexOf(':');
        const name = line.slice(0, separator);
        const value = line.slice(separator + 1).trim();
        if (name === 'Status') status = Number(value.split(' ')[0]);
        else headers.append(name, value);
    }
    return new Response(output.subarray(split + 4), {status, headers});
}

test('pushes the complete first commit and retries only unfinished topics', async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'tw-starter-git-test-'));
    const bare = path.join(root, 'octo', 'game.git');
    await mkdir(path.dirname(bare));
    t.after(() => rm(root, {recursive: true, force: true}));
    const repo = {id: 42, owner: {login: 'octo'}, name: 'game', private: true};
    const calls = [];
    let topicsAttempts = 0;
    const publisher = createGitHubPublisher({
        getCredentials: async () => credentials,
        confirm: async fields => {assert.deepEqual(fields, draft); return true;},
        request: async (url, options) => {
            const target = new URL(url);
            calls.push([options.method, target.pathname]);
            if (target.hostname === 'github.com') return gitHttp(root, url, options);
            assert.equal(options.headers.Authorization, 'Bearer test_token');
            if (target.pathname === '/licenses/mit') return Response.json(license);
            if (target.pathname === '/user/repos') {
                assert.deepEqual(JSON.parse(options.body), {name: 'game', description: 'A game', private: true, auto_init: false});
                execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main', bare]);
                return Response.json(repo, {status: 201});
            }
            if (target.pathname === '/repos/octo/game') return Response.json(repo);
            assert.equal(target.pathname, '/repos/octo/game/topics');
            assert.deepEqual(JSON.parse(options.body), {names: ['scratch']});
            return Response.json({}, {status: topicsAttempts++ ? 200 : 503});
        }
    });
    t.after(() => publisher.close());
    const first = await publisher.publish(draft, sb3);
    assert.equal(first.status, 'incomplete', JSON.stringify(first));
    assert.equal(first.url, 'https://github.com/octo/game');
    assert.deepEqual(await publisher.resume(), {status: 'published', url: first.url});
    const git = (...args) => execFileSync('git', ['--git-dir', bare, ...args], {encoding: 'utf8'}).trim();
    assert.equal(git('rev-list', '--count', 'main'), '1');
    assert.match(git('show', 'main:README.md'), /# Example\n/);
    assert.equal(git('show', 'main:LICENSE'), license.body.trim());
    assert.equal(git('show', 'main:project/assets/' + fontName), Buffer.from(font).toString());
    assert.equal(git('show', 'main:project/extensions/example.js'), extension);
    assert.match(git('show', 'main:project/project.source.json'), /embedded-extension:extensions\/example.js/);
    assert.equal(calls.filter(([method, route]) => method === 'POST' && route === '/user/repos').length, 1);
    assert.equal(calls.filter(([method, route]) => method === 'POST' && route.endsWith('/git-receive-pack')).length, 1);
});

test('refuses invalid projects and respects cancellation before any repository write', async t => {
    const publisher = createGitHubPublisher({
        getCredentials: async () => credentials,
        confirm: async () => false,
        request: async (url, {method}) => {
            assert.equal(url, 'https://api.github.com/licenses/mit');
            assert.equal(method, 'GET');
            return Response.json(license);
        }
    });
    t.after(() => publisher.close());
    assert.deepEqual(await publisher.publish({...draft, account: 'another'}, sb3), {status: 'failed', code: 'AUTH_REQUIRED'});
    assert.deepEqual(await publisher.publish(draft, strToU8('not a ZIP')), {status: 'failed', code: 'INVALID_PROJECT'});
    assert.deepEqual(await publisher.publish(draft, sb3), {status: 'failed', code: 'CANCELLED'});
});

test('does not adopt an existing repository or repeat an unconfirmed creation', async t => {
    let mode = 'duplicate';
    let posts = 0;
    const publisher = createGitHubPublisher({
        getCredentials: async () => credentials,
        confirm: async () => true,
        request: async url => {
            if (url.endsWith('/licenses/mit')) return Response.json(license);
            assert.equal(url, 'https://api.github.com/user/repos');
            posts++;
            if (mode === 'duplicate') return Response.json({errors: [{field: 'name', message: 'name already exists'}]}, {status: 422});
            throw new TypeError('Connection lost');
        }
    });
    t.after(() => publisher.close());
    assert.deepEqual(await publisher.publish(draft, sb3), {status: 'failed', code: 'NAME_CONFLICT'});
    mode = 'unknown';
    const result = await publisher.publish(draft, sb3);
    assert.deepEqual(result, {status: 'unknown', url: 'https://github.com/octo/game'});
    assert.deepEqual(await publisher.resume(), result);
    assert.deepEqual(await publisher.publish(draft, sb3), {status: 'failed', code: 'PENDING'});
    assert.equal(posts, 2);
});
