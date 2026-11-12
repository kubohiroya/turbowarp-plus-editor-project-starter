import fs from 'node:fs';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import git, {type HttpClient} from 'isomorphic-git';
import {prepareRepositorySeed} from './repository-seed.js';

const licenses = new Set(['mit', 'apache-2.0', 'mpl-2.0', 'gpl-3.0', 'cc0-1.0']);
const repoName = /^[a-zA-Z0-9._-]{1,100}$/u;
const loginName = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/u;
const topicName = /^[a-z0-9][a-z0-9-]{0,49}$/u;

interface Draft {
    account: string;
    name: string;
    title: string;
    description: string;
    topics: string[];
    private: boolean;
    license: string;
    language: 'ja' | 'en';
}

interface Destination {
    id: number;
    owner: string;
    name: string;
    url: string;
}

type Failure = 'AUTH_REQUIRED' | 'BUSY' | 'CANCELLED' | 'INVALID_INPUT' | 'INVALID_PROJECT' |
    'LICENSE_UNAVAILABLE' | 'NAME_CONFLICT' | 'PERMISSION_DENIED' | 'REMOTE_ERROR' | 'REMOTE_CHANGED' | 'PENDING';
export type PublicationResult =
    | {status: 'failed'; code: Failure}
    | {status: 'unknown'; url: string}
    | {status: 'incomplete'; code: Failure; url: string}
    | {status: 'published'; url: string};

type Credentials = {accessToken: string; account: {login: string; id?: number}};
type Snapshot = {dir: string; commit: string};
type Pending = {destination: Destination; draft: Draft; snapshot: Snapshot; pushed: boolean};
type Push = (snapshot: Snapshot, destination: Destination, credentials: Credentials, signal: AbortSignal) => Promise<void>;

function readDraft(input: unknown): Draft | null {
    if (!input || typeof input !== 'object') return null;
    const {account, name, title, description, topics, private: isPrivate, license, language} = input as Partial<Draft>;
    if (typeof account !== 'string' || !loginName.test(account) ||
        typeof name !== 'string' || !repoName.test(name) || name === '.' || name === '..' || /\.git$/iu.test(name) ||
        typeof title !== 'string' || !title.trim() || title.length > 160 || /[\u0000-\u001f]/u.test(title) ||
        typeof description !== 'string' || description.length > 350 || /[\u0000-\u001f]/u.test(description) ||
        !Array.isArray(topics) || topics.length > 20 || topics.some(topic => typeof topic !== 'string' || !topicName.test(topic)) ||
        typeof isPrivate !== 'boolean' || typeof license !== 'string' || (license && !licenses.has(license)) ||
        (language !== 'en' && language !== 'ja')) return null;
    return {account, name, title: title.trim(), description: description.trim(), topics: [...new Set(topics)],
        private: isPrivate, license, language};
}

async function makeCommit(files: Map<string, Uint8Array>, credentials: Credentials): Promise<Snapshot> {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tw-plus-git-seed-'));
    try {
        await git.init({fs, dir, defaultBranch: 'main'});
        for (const [filepath, bytes] of files) {
            const fullPath = path.join(dir, filepath);
            await mkdir(path.dirname(fullPath), {recursive: true});
            await writeFile(fullPath, bytes, {flag: 'wx'});
            await git.add({fs, dir, filepath});
        }
        const {login, id} = credentials.account;
        const author = {name: login, email: `${id ? id + '+' : ''}${login}@users.noreply.github.com`};
        const commit = await git.commit({fs, dir, message: 'Import project from TurboWarp Plus Editor', author});
        return {dir, commit};
    } catch (error) {
        await rm(dir, {recursive: true, force: true});
        throw error;
    }
}

function createPush(request: typeof fetch): Push {
    return async ({dir, commit}, destination, credentials, signal) => {
        const url = destination.url + '.git';
        const http: HttpClient = {async request(input) {
            const target = new URL(input.url);
            const allowed = input.method === 'POST' ? url + '/git-receive-pack' : url + '/info/refs?service=git-receive-pack';
            if (target.href !== allowed) throw new Error('Invalid Git service endpoint');
            const response = await request(target, {
                method: input.method, headers: input.headers, body: input.body, duplex: 'half',
                redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)])
            } as RequestInit);
            return {url: target.href, statusCode: response.status, statusMessage: response.statusText,
                headers: Object.fromEntries(response.headers), body: response.body?.[Symbol.asyncIterator]()};
        }};
        const onAuth = () => ({username: 'x-access-token', password: credentials.accessToken});
        const refs = await git.listServerRefs({http, url, onAuth, forPush: true, protocolVersion: 1, symrefs: false});
        const branch = 'refs/heads/main';
        if (refs.some(ref => ref.ref === branch && ref.oid === commit)) return;
        if (refs.length) throw new RemoteChangedError();
        const result = await git.push({fs, dir, http, url, onAuth, ref: branch, remoteRef: branch, force: false, signal});
        if (!result.ok || !result.refs[branch]?.ok) throw new Error('GitHub did not accept the first commit');
    };
}

class RemoteChangedError extends Error {}

const failed = (code: Failure): PublicationResult => ({status: 'failed', code});
const sameName = (left: unknown, right: string) => typeof left === 'string' && left.toLowerCase() === right.toLowerCase();
const repoPath = ({owner, name}: Destination) => '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(name);
const deleteSnapshot = ({dir}: Snapshot) => rm(dir, {recursive: true, force: true}).catch(() => {});

function createStatus(status: number): Failure {
    if (status === 401) return 'AUTH_REQUIRED';
    if (status === 403 || status === 404) return 'PERMISSION_DENIED';
    return 'REMOTE_ERROR';
}

/** Privileged host only. OAuth credentials stay inside the host and all destinations are derived from GitHub. */
export function createGitHubPublisher({getCredentials, confirm, request = fetch, push = createPush(request)}: {
    getCredentials: () => Promise<Credentials>;
    confirm: (draft: Readonly<Draft>, signal: AbortSignal) => Promise<boolean>;
    request?: typeof fetch;
    push?: Push;
}) {
    let pending: Pending | null = null;
    let unknown: {status: 'unknown'; url: string} | null = null;
    let active: Promise<PublicationResult> | null = null;
    let lifetime = new AbortController();

    async function api(endpoint: string, credentials: Credentials, signal: AbortSignal, method = 'GET', data?: object) {
        const response = await request('https://api.github.com' + endpoint, {
            method, redirect: 'error', cache: 'no-store',
            headers: {Authorization: 'Bearer ' + credentials.accessToken, Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28'},
            body: data === undefined ? undefined : JSON.stringify(data),
            signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)])
        });
        const value = await response.json().catch(() => null);
        return {status: response.status, value};
    }

    function run(operation: (signal: AbortSignal) => Promise<PublicationResult>) {
        if (active) return Promise.resolve(failed('BUSY'));
        active = operation(lifetime.signal).catch(() => failed('REMOTE_ERROR')).finally(() => {active = null;});
        return active;
    }

    const credentialsFor = async (login: string) => {
        const credentials = await getCredentials().catch(() => null);
        return credentials && sameName(credentials.account.login, login) ? credentials : null;
    };

    async function complete(operation: Pending, credentials: Credentials, signal: AbortSignal): Promise<PublicationResult> {
        const {draft, destination, snapshot} = operation;
        const url = destination.url;
        const incomplete = (code: Failure): PublicationResult => ({status: 'incomplete', code, url});
        try {
            const repo = await api(repoPath(destination), credentials, signal);
            if (repo.status !== 200) return incomplete(createStatus(repo.status));
            if (repo.value?.id !== destination.id || !sameName(repo.value?.owner?.login, destination.owner) ||
                !sameName(repo.value?.name, destination.name) || repo.value?.private !== draft.private) {
                return incomplete('REMOTE_CHANGED');
            }
            if (!operation.pushed) {
                await push(snapshot, destination, credentials, signal);
                operation.pushed = true;
            }
            if (draft.topics.length) {
                const response = await api(repoPath(destination) + '/topics', credentials, signal, 'PUT', {names: draft.topics});
                if (response.status !== 200) return incomplete(createStatus(response.status));
            }
        } catch (error) {
            return incomplete(error instanceof RemoteChangedError ? 'REMOTE_CHANGED' : 'REMOTE_ERROR');
        }
        pending = null;
        await deleteSnapshot(snapshot);
        return {status: 'published', url};
    }

    return {
        unfinished(): PublicationResult | null {
            return pending ? {status: 'incomplete', code: 'PENDING', url: pending.destination.url} : unknown;
        },
        publish(input: unknown, sb3: unknown) {
            return run(async signal => {
                if (pending || unknown) return failed('PENDING');
                const draft = readDraft(input);
                if (!draft || !(sb3 instanceof Uint8Array) || !sb3.byteLength || sb3.byteLength > 100 * 1024 * 1024) {
                    return failed('INVALID_INPUT');
                }
                const credentials = await credentialsFor(draft.account);
                if (!credentials) return failed('AUTH_REQUIRED');

                let license: {name: string; text: string} | undefined;
                if (draft.license) {
                    const result = await api('/licenses/' + draft.license, credentials, signal);
                    if (result.status !== 200 || result.value?.key !== draft.license ||
                        typeof result.value?.spdx_id !== 'string' || !/^[A-Za-z0-9.-]{1,50}$/u.test(result.value.spdx_id) ||
                        typeof result.value?.body !== 'string' || !result.value.body.trim() || result.value.body.length > 100_000) {
                        return failed('LICENSE_UNAVAILABLE');
                    }
                    license = {name: result.value.spdx_id, text: result.value.body};
                }
                const files = await prepareRepositorySeed({...draft, sb3, license}).catch(() => null);
                if (!files) return failed('INVALID_PROJECT');
                const snapshot = await makeCommit(files, credentials);
                try {
                    if (!await confirm(draft, signal)) return failed('CANCELLED');
                    signal.throwIfAborted();
                    const owner = credentials.account.login;
                    const expectedUrl = 'https://github.com/' + owner + '/' + draft.name;
                    let response: Awaited<ReturnType<typeof api>>;
                    try {
                        response = await api('/user/repos', credentials, signal, 'POST', {
                            name: draft.name, description: draft.description, private: draft.private, auto_init: false
                        });
                    } catch {
                        return (unknown = {status: 'unknown', url: expectedUrl});
                    }
                    const {status, value} = response;
                    if (status === 422 && Array.isArray(value?.errors) && value.errors.some(
                        (error: {field?: string; message?: string}) => error?.field === 'name' &&
                            typeof error.message === 'string' && /already exists/iu.test(error.message))) return failed('NAME_CONFLICT');
                    if (status >= 400 && status < 500) return failed(createStatus(status));
                    if (status !== 201 || !Number.isSafeInteger(value?.id) || value.id <= 0 ||
                        !sameName(value?.owner?.login, owner) || !sameName(value?.name, draft.name) || value?.private !== draft.private) {
                        return (unknown = {status: 'unknown', url: expectedUrl});
                    }
                    const destination = {id: value.id, owner, name: draft.name, url: expectedUrl};
                    pending = {draft, destination, snapshot, pushed: false};
                    return await complete(pending, credentials, signal);
                } finally {
                    if (pending?.snapshot !== snapshot) await deleteSnapshot(snapshot);
                }
            });
        },
        resume() {
            return run(async signal => {
                if (!pending) return unknown ?? failed('INVALID_INPUT');
                const credentials = await credentialsFor(pending.destination.owner);
                if (!credentials) return {status: 'incomplete', code: 'AUTH_REQUIRED', url: pending.destination.url};
                return complete(pending, credentials, signal);
            });
        },
        async abandon() {
            if (active) return;
            const operation = pending;
            pending = unknown = null;
            if (operation) await deleteSnapshot(operation.snapshot);
        },
        async close() {
            lifetime.abort();
            await active;
            const operation = pending;
            pending = unknown = null;
            if (operation) await deleteSnapshot(operation.snapshot);
            lifetime = new AbortController();
        }
    };
}
