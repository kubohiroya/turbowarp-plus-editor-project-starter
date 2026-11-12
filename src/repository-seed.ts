import {mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {importSb3, validateSb3Source} from '@kubohiroya/sb3-toolchain';
import {unzipSync} from 'fflate';
import {toolchainVersion} from './project.js';
import {composeRepositorySeed, type SeedOptions} from './seed.js';

const maxFileBytes = 100 * 1024 * 1024;
const maxArchiveBytes = 512 * 1024 * 1024;
const maxEntries = 20_000;

export type RepositorySeedOptions = SeedOptions;

async function readSource(directory: string, files: Map<string, Uint8Array>, prefix: string) {
    const entries = await readdir(directory, {withFileTypes: true});
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
        const fullPath = path.join(directory, entry.name);
        const repoPath = prefix ? prefix + '/' + entry.name : entry.name;
        if (entry.isDirectory()) await readSource(fullPath, files, repoPath);
        else if (entry.isFile()) files.set(repoPath, await readFile(fullPath));
    }
}

/** Expand and validate a snapshot without touching the original project. */
export async function prepareProjectFolder(sb3: Uint8Array) {
    if (sb3.byteLength > maxFileBytes) throw new RangeError('The SB3 exceeds 100 MiB.');
    let count = 0;
    let size = 0;
    // Read the ZIP directory first, before the importer allocates decompression buffers.
    unzipSync(sb3, {filter({originalSize}) {
        count++;
        size += originalSize;
        if (count > maxEntries || originalSize > maxFileBytes || size > maxArchiveBytes) {
            throw new RangeError('The expanded SB3 exceeds the repository import limits.');
        }
        return false;
    }});
    const root = await mkdtemp(path.join(os.tmpdir(), 'tw-plus-seed-'));
    try {
        const inputPath = path.join(root, 'input.sb3');
        const outputDirectory = path.join(root, 'project');
        await writeFile(inputPath, sb3);
        await importSb3({inputPath, outputDirectory, protectedRoot: root});
        await validateSb3Source(outputDirectory);

        const project = JSON.parse(await readFile(path.join(outputDirectory, 'project.source.json'), 'utf8'));
        if (project.turboWarpPlus !== undefined) {
            throw new Error('Plus extension manifests are not supported in project folders.');
        }
        const files = new Map<string, Uint8Array>();
        await readSource(outputDirectory, files, '');
        return files;
    } finally {
        await rm(root, {recursive: true, force: true});
    }
}

/** Prepare the first commit without requiring a Git repository. */
export async function prepareRepositorySeed({sb3, ...metadata}: RepositorySeedOptions) {
    const project = await prepareProjectFolder(sb3);
    return composeRepositorySeed(project, metadata, toolchainVersion);
}
