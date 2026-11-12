import {repositoryTemplates} from './repository-templates.generated.js';
import type {ScratchProjectInfo} from './scratch.js';
import {quoteMarkdown, scratchSection, slugify, workflowGuideUrl, type Language} from './template-text.js';

export type {Language} from './template-text.js';

export interface SeedMetadata {
    title: string;
    description: string;
    language: Language;
    license?: {name: string; text: string};
    scratch?: ScratchProjectInfo;
}

export interface SeedOptions extends SeedMetadata {
    sb3: Uint8Array;
}

export interface SeedWarning {
    code: string;
    path?: string;
}

/** The installed sb3-toolchain browser module supplies this port. */
export interface SeedUnpacker {
    unpackSb3(sb3: Uint8Array): {
        files: ReadonlyMap<string, Uint8Array>;
        warnings: readonly SeedWarning[];
    };
    toolchainVersion: string;
}

export interface SeedFile {
    path: string;
    bytes: Uint8Array;
}

export class SeedError extends Error {
    constructor(readonly code: string, message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'SeedError';
    }
}

function renderRepositoryReadme({title, description, language, license, scratch}: SeedMetadata, toolchainVersion: string) {
    if (language !== 'ja' && language !== 'en') throw new SeedError('invalid-metadata', 'Unsupported repository language.');
    if (!title.trim()) throw new SeedError('invalid-metadata', 'A project title is required.');
    if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/u.test(toolchainVersion)) {
        throw new SeedError('invalid-metadata', 'An exact sb3-toolchain version is required.');
    }
    if (license && (!/^[A-Za-z0-9.-]+$/u.test(license.name) || !license.text.trim())) {
        throw new SeedError('invalid-metadata', 'Expected a license identifier and its text.');
    }
    if (scratch && !/^https:\/\/scratch\.mit\.edu\/projects\/\d+\/$/u.test(scratch.url)) {
        throw new SeedError('invalid-metadata', 'Expected a Scratch project URL.');
    }
    const ja = language === 'ja';
    const heading = title.replace(/\s+/gu, ' ').trim().replace(/([\\`*_{}\[\]()<>#!|])/gu, '\\$1');
    const replacements: Record<string, string> = {
        __TITLE__: heading,
        __DESCRIPTION__: description.trim() ? quoteMarkdown(description) : '',
        __SCRATCH_SECTION__: scratchSection(scratch ?? null, language),
        __GUIDE_URL__: workflowGuideUrl,
        __SB3_NAME__: slugify(title, 'project'),
        __TOOLCHAIN_VERSION__: toolchainVersion,
        __LICENSE__: license ? `## ${ja ? 'ライセンス' : 'License'}\n\n[${license.name}](LICENSE)\n` : ''
    };
    return repositoryTemplates[language].replace(/__[A-Z0-9_]+__/gu, key => replacements[key]);
}

export function composeRepositorySeed(
    project: ReadonlyMap<string, Uint8Array>, metadata: SeedMetadata, toolchainVersion: string
): Map<string, Uint8Array> {
    const encoder = new TextEncoder();
    const files = new Map<string, Uint8Array>([
        ['README.md', encoder.encode(renderRepositoryReadme(metadata, toolchainVersion))],
        ['.gitignore', encoder.encode(repositoryTemplates.gitignore)]
    ]);
    if (metadata.license) files.set('LICENSE', encoder.encode(metadata.license.text));
    for (const [name, bytes] of project) files.set('project/' + name, bytes);
    return files;
}

/** Prepare the initial repository contents entirely in memory. */
export function createRepositorySeed(
    {sb3, ...metadata}: SeedOptions, {unpackSb3, toolchainVersion}: SeedUnpacker
): {files: SeedFile[]; warnings: SeedWarning[]} {
    let project: ReturnType<SeedUnpacker['unpackSb3']>;
    try {
        project = unpackSb3(sb3);
    } catch (cause) {
        const code = cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string'
            ? cause.code : 'invalid-sb3';
        const message = cause instanceof Error ? cause.message : 'Could not expand the SB3.';
        throw new SeedError(code, message, {cause});
    }
    const warnings = [...project.warnings];
    if (metadata.scratch && metadata.license && metadata.license.name !== 'CC-BY-SA-2.0') {
        warnings.push({code: 'scratch-license'});
    }
    const files = [...composeRepositorySeed(project.files, metadata, toolchainVersion)].map(([path, bytes]) => ({path, bytes}));
    return {files, warnings};
}
