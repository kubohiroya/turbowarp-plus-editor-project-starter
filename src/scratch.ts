import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';

/** Where a project on scratch.mit.edu is read from. Overridable for tests. */
export interface ScratchEndpoints {
    api: string;
    projects: string;
    assets: string;
}

export const scratchEndpoints: ScratchEndpoints = {
    api: 'https://api.scratch.mit.edu',
    projects: 'https://projects.scratch.mit.edu',
    assets: 'https://assets.scratch.mit.edu'
};

/** What scratch.mit.edu says about a shared project, kept for the repository's README and provenance. */
export interface ScratchProjectInfo {
    id: string;
    url: string;
    title: string;
    author: string | null;
    instructions: string;
    notes: string;
}

export interface FetchedScratchProject {
    info: ScratchProjectInfo;
    sb3: Uint8Array;
    assetCount: number;
}

export interface FetchScratchProjectOptions {
    fetch?: typeof fetch;
    endpoints?: ScratchEndpoints;
    userAgent?: string;
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
}

export class ScratchFetchError extends Error {
    constructor(message: string, readonly code: 'not-found' | 'scratch2' | 'network' | 'integrity' | 'invalid') {
        super(message);
        this.name = 'ScratchFetchError';
    }
}

/**
 * Reads a Scratch project ID from what a person is likely to paste:
 * `https://scratch.mit.edu/projects/123/`, `.../projects/123/editor`, `scratch.mit.edu/projects/123`, or `123`.
 * Returns null for anything else, including local paths.
 */
export function parseScratchProjectId(input: string): string | null {
    const text = input.trim();
    if (/^\d+$/.test(text)) return text;
    const match = /^(?:https?:\/\/)?(?:www\.)?scratch\.mit\.edu\/projects\/(\d+)(?:[/?#].*)?$/i.exec(text);
    return match ? match[1] : null;
}

export function scratchProjectUrl(id: string): string {
    return `https://scratch.mit.edu/projects/${id}/`;
}

interface ScratchAsset {
    assetId?: unknown;
    dataFormat?: unknown;
    md5ext?: unknown;
}

/** The asset file names a Scratch 3 project.json refers to, in first-use order. */
export function projectAssetNames(project: unknown): string[] {
    if (!project || typeof project !== 'object' || !Array.isArray((project as {targets?: unknown}).targets)) {
        throw new ScratchFetchError('project.json has no targets.', 'invalid');
    }
    const names = new Set<string>();
    for (const target of (project as {targets: unknown[]}).targets) {
        if (!target || typeof target !== 'object') continue;
        const {costumes, sounds} = target as {costumes?: unknown; sounds?: unknown};
        for (const asset of [...(Array.isArray(costumes) ? costumes : []), ...(Array.isArray(sounds) ? sounds : [])]) {
            names.add(assetFileName(asset as ScratchAsset));
        }
    }
    return [...names];
}

function assetFileName(asset: ScratchAsset): string {
    const name = typeof asset.md5ext === 'string' ? asset.md5ext
        : typeof asset.assetId === 'string' && typeof asset.dataFormat === 'string' ? `${asset.assetId}.${asset.dataFormat}`
            : null;
    // Scratch stores assets by MD5; anything else would make the URL below point somewhere unintended.
    if (!name || !/^[0-9a-f]{32}\.[a-z0-9]+$/.test(name)) {
        throw new ScratchFetchError(`Unexpected asset name in project.json: ${JSON.stringify(name)}`, 'invalid');
    }
    return name;
}

/**
 * Downloads a shared project from scratch.mit.edu and packs it as an SB3: project.json first, then each
 * costume and sound once, each checked against the MD5 its name carries.
 *
 * Only shared projects can be read this way. An unshared project has to be saved from the Scratch
 * editor (File → Save to your computer) and passed as a file instead.
 */
export async function fetchScratchProject(id: string, options: FetchScratchProjectOptions = {}): Promise<FetchedScratchProject> {
    const fetchImpl = options.fetch ?? fetch;
    const endpoints = options.endpoints ?? scratchEndpoints;
    const headers = options.userAgent ? {'user-agent': options.userAgent} : undefined;

    const get = async (url: string, what: string): Promise<Response> => {
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const response = await fetchImpl(url, {headers});
                if (response.status === 404) {
                    throw new ScratchFetchError(`${what} was not found (404).`, 'not-found');
                }
                if (response.ok) return response;
                lastError = new ScratchFetchError(`${what} returned HTTP ${response.status}.`, 'network');
                if (response.status < 500 && response.status !== 429) break;
            } catch (error) {
                if (error instanceof ScratchFetchError && error.code === 'not-found') throw error;
                lastError = error;
            }
            await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
        }
        if (lastError instanceof ScratchFetchError) throw lastError;
        throw new ScratchFetchError(`Could not read ${what}: ${String(lastError)}`, 'network');
    };

    let meta: Record<string, unknown>;
    try {
        meta = await (await get(`${endpoints.api}/projects/${id}`, `Scratch project ${id}`)).json() as Record<string, unknown>;
    } catch (error) {
        if (error instanceof ScratchFetchError && error.code === 'not-found') {
            throw new ScratchFetchError(
                `Scratch project ${id} is not shared, or does not exist. Open it in the Scratch editor, choose ` +
                'File → Save to your computer, and pass the saved .sb3 file instead.', 'not-found');
        }
        throw error;
    }
    const token = typeof meta.project_token === 'string' ? meta.project_token : '';
    const author = meta.author && typeof meta.author === 'object' && typeof (meta.author as {username?: unknown}).username === 'string'
        ? (meta.author as {username: string}).username : null;
    const info: ScratchProjectInfo = {
        id,
        url: scratchProjectUrl(id),
        title: typeof meta.title === 'string' && meta.title.trim() ? meta.title.trim() : `Scratch project ${id}`,
        author,
        instructions: typeof meta.instructions === 'string' ? meta.instructions : '',
        notes: typeof meta.description === 'string' ? meta.description : ''
    };

    const projectUrl = `${endpoints.projects}/${id}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const projectBytes = new Uint8Array(await (await get(projectUrl, `project.json of ${id}`)).arrayBuffer());
    let project: unknown;
    try {
        project = JSON.parse(new TextDecoder().decode(projectBytes));
    } catch {
        throw new ScratchFetchError(`project.json of ${id} is not JSON.`, 'invalid');
    }
    if (project && typeof project === 'object' && 'objName' in project && !('targets' in project)) {
        throw new ScratchFetchError(
            `Scratch project ${id} is still in the Scratch 2 format. Open it in the Scratch editor, choose ` +
            'File → Save to your computer, and pass the saved .sb3 file instead.', 'scratch2');
    }
    const names = projectAssetNames(project);

    const files: Record<string, Uint8Array> = {'project.json': projectBytes};
    let done = 0;
    const queue = [...names];
    const worker = async () => {
        for (let name = queue.shift(); name; name = queue.shift()) {
            const bytes = new Uint8Array(await (await get(`${endpoints.assets}/internalapi/asset/${name}/get/`, `asset ${name}`)).arrayBuffer());
            const md5 = createHash('md5').update(bytes).digest('hex');
            if (md5 !== name.slice(0, 32)) {
                throw new ScratchFetchError(`Asset ${name} does not match its MD5 (got ${md5}).`, 'integrity');
            }
            files[name] = bytes;
            options.onProgress?.(++done, names.length);
        }
    };
    await Promise.all(Array.from({length: Math.min(options.concurrency ?? 6, Math.max(names.length, 1))}, worker));

    // Keep project.json first and the assets in first-use order, as Scratch itself writes them.
    const ordered: Record<string, Uint8Array> = {'project.json': files['project.json']};
    for (const name of names) ordered[name] = files[name];
    return {info, sb3: zipSync(ordered, {level: 6}), assetCount: names.length};
}
