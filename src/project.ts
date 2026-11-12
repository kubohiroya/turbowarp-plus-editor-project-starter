import {execFile} from 'node:child_process';
import {mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {importSb3, validateSb3Source} from '@kubohiroya/sb3-toolchain';
import {fetchScratchProject, parseScratchProjectId, type FetchScratchProjectOptions, type ScratchProjectInfo} from './scratch.js';
import {renderTemplates, type Language} from './templates.js';
import {slugify} from './template-text.js';

export {slugify} from './template-text.js';

const run = promisify(execFile);
const require = createRequire(import.meta.url);

export const starterVersion: string = require('../package.json').version;
export const toolchainVersion: string = require('@kubohiroya/sb3-toolchain/package.json').version;

/** Written at the repository root; tells `reimport` and the Scratch import workflow what to do. */
export const manifestFileName = 'scratch-project.json';

export interface StarterManifest {
    formatVersion: 1;
    projectDirectory: string;
    sb3Name: string;
    language: Language;
    scratch: Pick<ScratchProjectInfo, 'id' | 'url' | 'title' | 'author'> | null;
}

export type Log = (message: string) => void;

export interface ResolvedInput {
    sb3Path: string;
    scratch: ScratchProjectInfo | null;
    cleanup: () => Promise<void>;
}

/**
 * Turns what the person passed (an .sb3 path, a Scratch project URL or a project ID) into an .sb3 file on
 * disk. Files win over IDs, so a local file named "123" is never mistaken for a Scratch project.
 */
export async function resolveInput(input: string, options: FetchScratchProjectOptions & {log?: Log} = {}): Promise<ResolvedInput> {
    const asFile = path.resolve(input);
    if (await stat(asFile).then(s => s.isFile(), () => false)) {
        return {sb3Path: asFile, scratch: null, cleanup: async () => {}};
    }
    const id = parseScratchProjectId(input);
    if (!id) throw new Error(`"${input}" is neither an .sb3 file nor a Scratch project URL or ID.`);
    options.log?.(`Downloading Scratch project ${id}…`);
    const fetched = await fetchScratchProject(id, {
        userAgent: `turbowarp-plus-editor-project-starter/${starterVersion}`,
        ...options
    });
    options.log?.(`Downloaded "${fetched.info.title}" with ${fetched.assetCount} costumes and sounds.`);
    const directory = await mkdtemp(path.join(os.tmpdir(), 'tw-plus-starter-'));
    const sb3Path = path.join(directory, `${id}.sb3`);
    await writeFile(sb3Path, fetched.sb3);
    return {sb3Path, scratch: fetched.info, cleanup: () => rm(directory, {recursive: true, force: true})};
}

async function git(cwd: string, ...args: string[]): Promise<string> {
    const {stdout} = await run('git', args, {cwd, maxBuffer: 64 * 1024 * 1024});
    return stdout.trim();
}

async function gitConfigured(cwd: string, key: string): Promise<boolean> {
    return git(cwd, 'config', '--get', key).then(value => value.length > 0, () => false);
}

async function isEmptyOrMissing(directory: string): Promise<boolean> {
    try {
        return (await readdir(directory)).length === 0;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
        throw error;
    }
}

export interface InitOptions extends FetchScratchProjectOptions {
    input: string;
    directory?: string;
    title?: string;
    projectDirectory?: string;
    language?: Language;
    commit?: boolean;
    log?: Log;
}

export interface InitResult {
    directory: string;
    manifest: StarterManifest;
    committed: boolean;
    files: string[];
}

/**
 * Creates a Git repository holding the project as an sb3-toolchain project folder, with a README,
 * GitHub Actions for checking and releasing, and issue and pull request forms. Nothing is sent anywhere;
 * `publish` does that.
 */
export async function initProject(options: InitOptions): Promise<InitResult> {
    const log = options.log ?? (() => {});
    const language = options.language ?? 'ja';
    const projectDirectory = options.projectDirectory ?? 'project';
    if (!/^[A-Za-z0-9._-]+$/.test(projectDirectory) || projectDirectory.startsWith('.')) {
        throw new Error(`The project folder name "${projectDirectory}" must be a plain name such as "project".`);
    }
    await git(process.cwd(), '--version').catch(() => {
        throw new Error('Git is not installed. Install Git (https://git-scm.com/) and try again.');
    });

    const input = await resolveInput(options.input, {...options, log});
    try {
        const title = (options.title ?? input.scratch?.title ?? path.basename(input.sb3Path, path.extname(input.sb3Path))).trim();
        const fallback = input.scratch ? `scratch-${input.scratch.id}` : 'scratch-project';
        const sb3Name = slugify(title, fallback);
        const directory = path.resolve(options.directory ?? sb3Name);
        if (!await isEmptyOrMissing(directory)) {
            throw new Error(`${directory} already exists and is not empty. Choose another folder with --dir.`);
        }

        await mkdir(directory, {recursive: true});
        await git(directory, 'init', '--quiet', '--initial-branch=main');

        log(`Expanding the project into ${path.join(directory, projectDirectory)}…`);
        const imported = await importSb3({
            inputPath: input.sb3Path,
            outputDirectory: path.join(directory, projectDirectory),
            yes: true
        });
        await validateSb3Source(path.join(directory, projectDirectory));
        log(`Expanded ${imported.assetCount} assets${imported.embeddedExtensionCount ? ` and ${imported.embeddedExtensionCount} embedded extensions` : ''}.`);

        const manifest: StarterManifest = {
            formatVersion: 1,
            projectDirectory,
            sb3Name,
            language,
            scratch: input.scratch && {id: input.scratch.id, url: input.scratch.url, title: input.scratch.title, author: input.scratch.author}
        };
        const files = await renderTemplates({title, projectDirectory, sb3Name, toolchainVersion, starterVersion, language, scratch: input.scratch});
        files.set(manifestFileName, `${JSON.stringify(manifest, null, 2)}\n`);
        for (const [file, content] of files) {
            await mkdir(path.dirname(path.join(directory, file)), {recursive: true});
            await writeFile(path.join(directory, file), content);
        }

        let committed = false;
        if (options.commit !== false) {
            await git(directory, 'add', '--all');
            if (await gitConfigured(directory, 'user.name') && await gitConfigured(directory, 'user.email')) {
                const message = input.scratch
                    ? `Import "${title}" from Scratch\n\nSource: ${input.scratch.url}`
                    : `Import "${title}" from ${path.basename(input.sb3Path)}`;
                await git(directory, 'commit', '--quiet', '-m', message);
                committed = true;
            } else {
                log('Git does not know your name and email yet, so the files are staged but not committed. Run:');
                log('  git config --global user.name "Your Name"');
                log('  git config --global user.email "you@example.com"');
                log(`  git -C "${directory}" commit -m "Import ${title}"`);
            }
        }
        return {directory, manifest, committed, files: [...files.keys(), `${projectDirectory}/`].sort()};
    } finally {
        await input.cleanup();
    }
}

export async function readManifest(directory: string): Promise<StarterManifest> {
    const file = path.join(directory, manifestFileName);
    let manifest: StarterManifest;
    try {
        manifest = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
        throw new Error(`Could not read ${file}. Run this in a repository made by "init". (${(error as Error).message})`);
    }
    if (manifest.formatVersion !== 1 || typeof manifest.projectDirectory !== 'string') {
        throw new Error(`${file} has an unsupported format.`);
    }
    return manifest;
}

export interface ReimportOptions extends FetchScratchProjectOptions {
    directory: string;
    input?: string;
    summaryPath?: string;
    log?: Log;
}

export interface ReimportResult {
    changed: boolean;
    differenceCounts: {added: number; modified: number; removed: number} | null;
    source: string;
}

/**
 * Replaces the project folder with a newer SB3 — by default the latest shared version on Scratch — so the
 * difference can be reviewed and committed. Uncommitted changes in the folder stop the import.
 */
export async function reimportProject(options: ReimportOptions): Promise<ReimportResult> {
    const log = options.log ?? (() => {});
    const directory = path.resolve(options.directory);
    const manifest = await readManifest(directory);
    const source = options.input ?? manifest.scratch?.id;
    if (!source) throw new Error('This project was not imported from Scratch. Pass the .sb3 file to import.');

    const input = await resolveInput(source, {...options, log});
    try {
        const outputDirectory = path.join(directory, manifest.projectDirectory);
        const result = await importSb3({inputPath: input.sb3Path, outputDirectory, yes: true});
        await validateSb3Source(outputDirectory);
        const counts = result.differenceCounts;
        const label = input.scratch ? input.scratch.url : path.basename(input.sb3Path);
        const ja = manifest.language === 'ja';
        const summary = result.changed
            ? [ja ? '# Scratch から最新の版を取り込む' : '# Import the latest version from Scratch', '',
                ja ? `取り込み元：${label}` : `Source: ${label}`, '',
                counts ? (ja ? `ファイル：追加 ${counts.added}・変更 ${counts.modified}・削除 ${counts.removed}`
                    : `Files: ${counts.added} added, ${counts.modified} modified, ${counts.removed} removed`) : '', '',
                ja ? 'Plus Editor のローカル Git パネルか、このプルリクエストの変更で、スクリプトごとの違いを確かめてからマージしてください。'
                    : 'Review the script-by-script changes in Plus Editor\'s Local Git panel or in this pull request before merging.']
            : [ja ? '# Scratch に新しい変更はありません' : '# No new changes on Scratch', '', ja ? `取り込み元：${label}` : `Source: ${label}`];
        if (options.summaryPath) await writeFile(options.summaryPath, `${summary.join('\n')}\n`);
        log(result.changed ? `Updated ${outputDirectory}.` : 'No changes since the last import.');
        return {changed: result.changed, differenceCounts: counts, source: label};
    } finally {
        await input.cleanup();
    }
}

export interface PublishOptions {
    directory: string;
    name?: string;
    visibility?: 'private' | 'public';
    allowActionsPullRequests?: boolean;
    log?: Log;
}

export interface PublishResult {
    repository: string;
    url: string;
}

async function gh(cwd: string, ...args: string[]): Promise<string> {
    try {
        const {stdout} = await run('gh', args, {cwd});
        return stdout.trim();
    } catch (error) {
        const failure = error as NodeJS.ErrnoException & {stderr?: string};
        if (failure.code === 'ENOENT') throw new Error('GitHub CLI (gh) is not installed. Install it from https://cli.github.com/ and run "gh auth login".');
        throw new Error(`gh ${args[0]} ${args[1] ?? ''} failed: ${(failure.stderr ?? failure.message).trim()}`);
    }
}

/**
 * Creates the GitHub repository with the GitHub CLI and pushes main to it. The remote is set to HTTPS,
 * because Plus Editor's GitHub connection works with an HTTPS origin.
 */
export async function publishProject(options: PublishOptions): Promise<PublishResult> {
    const log = options.log ?? (() => {});
    const directory = path.resolve(options.directory);
    const manifest = await readManifest(directory);
    await gh(directory, 'auth', 'status');
    if (await git(directory, 'remote').then(out => out.split('\n').includes('origin'))) {
        throw new Error('This repository already has a remote named origin.');
    }
    if (await git(directory, 'status', '--porcelain')) {
        throw new Error('Commit or discard the changes in the repository before publishing.');
    }
    await git(directory, 'rev-parse', '--verify', 'HEAD').catch(() => {
        throw new Error('The repository has no commit yet. Commit the imported project first.');
    });

    const name = options.name ?? path.basename(directory);
    const title = manifest.scratch?.title ?? manifest.sb3Name;
    log(`Creating the ${options.visibility ?? 'private'} GitHub repository ${name}…`);
    // gh pushes with the protocol the person set up for it; the remote is switched to HTTPS afterwards.
    await gh(directory, 'repo', 'create', name, `--${options.visibility ?? 'private'}`,
        '--source', directory, '--remote', 'origin', '--push',
        '--description', manifest.language === 'ja' ? `${title}（TurboWarp Plus Editor で開発する Scratch 作品）` : `${title} (a Scratch project developed with TurboWarp Plus Editor)`);
    const repository = await gh(directory, 'repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner');
    const url = `https://github.com/${repository}`;
    await git(directory, 'remote', 'set-url', 'origin', `${url}.git`);
    await git(directory, 'branch', '--quiet', '--set-upstream-to=origin/main', 'main').catch(() => {});
    log(`Set origin to ${url}.git (Plus Editor's GitHub connection needs an HTTPS origin).`);
    log('If git later asks for a password when pushing over HTTPS, run "gh auth setup-git" once.');

    if (options.allowActionsPullRequests !== false) {
        // The "Import from Scratch" workflow opens pull requests with the workflow token.
        try {
            await gh(directory, 'api', '--method', 'PUT', `repos/${repository}/actions/permissions/workflow`,
                '-f', 'default_workflow_permissions=read', '-F', 'can_approve_pull_request_reviews=true');
            log('Allowed GitHub Actions to open pull requests (used by "Import from Scratch").');
        } catch (error) {
            log(`Could not allow GitHub Actions to open pull requests: ${(error as Error).message}`);
            log('Turn on Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests" to use "Import from Scratch".');
        }
    }
    return {repository, url};
}
