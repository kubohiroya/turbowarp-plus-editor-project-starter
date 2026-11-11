import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {ScratchProjectInfo} from './scratch.js';

export type Language = 'ja' | 'en';

export const templatesDirectory = fileURLToPath(new URL('../templates/', import.meta.url));

/** The Plus Editor feature guide chapter that walks through issue → release. */
export const workflowGuideUrl = 'https://kubohiroya.github.io/turbowarp-plus-editor/features/github/';

export interface TemplateValues {
    title: string;
    projectDirectory: string;
    sb3Name: string;
    toolchainVersion: string;
    starterVersion: string;
    language: Language;
    scratch: ScratchProjectInfo | null;
}

// npm drops dotfiles such as .gitignore from published packages, so they are stored with a leading "_".
const renamed: Record<string, string> = {'_gitignore': '.gitignore', '_gitattributes': '.gitattributes'};

async function listFiles(root: string, directory = ''): Promise<string[]> {
    const entries = await readdir(path.join(root, directory), {withFileTypes: true});
    const files: string[] = [];
    for (const entry of entries) {
        const relative = path.posix.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await listFiles(root, relative));
        else if (entry.isFile()) files.push(relative);
    }
    return files.sort();
}

/** Text that a Markdown renderer shows as written: no headings, links or HTML from the Scratch page. */
function quoteMarkdown(text: string): string {
    return text.replace(/\r\n?/g, '\n').trim().split('\n')
        // Escape what could turn into links, HTML, code or tables; leave "_" alone so URLs stay intact.
        .map(line => `> ${line.replace(/([\\`*[\]<>|])/g, '\\$1').replace(/^(\s*)([#=-])/, '$1\\$2')}`).join('\n');
}

function scratchSection(scratch: ScratchProjectInfo | null, language: Language): string {
    if (!scratch) return '';
    const ja = language === 'ja';
    const title = scratch.title.replace(/([\\[\]<>*_`])/g, '\\$1');
    const author = scratch.author?.replace(/([\\[\]<>*_`])/g, '\\$1');
    const lines = [ja
        ? `Scratch で公開されている作品「[${title}](${scratch.url})」${author ? `（作者：${author}）` : ''}を元にしています。Scratch で共有された作品は [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/deed.ja) で公開されています。`
        : `Based on the Scratch project "[${title}](${scratch.url})"${author ? ` by ${author}` : ''}. Projects shared on Scratch are licensed under [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/).`, ''];
    if (scratch.instructions.trim()) lines.push(ja ? '## 使い方' : '## Instructions', '', quoteMarkdown(scratch.instructions), '');
    if (scratch.notes.trim()) lines.push(ja ? '## メモとクレジット' : '## Notes and credits', '', quoteMarkdown(scratch.notes), '');
    return lines.join('\n');
}

/** Renders the repository files the starter adds next to the project folder, keyed by repository path. */
export async function renderTemplates(values: TemplateValues): Promise<Map<string, string>> {
    const replacements: Record<string, string> = {
        __TITLE__: values.title.replace(/\s+/g, ' '),
        __PROJECT_DIR__: values.projectDirectory,
        __SB3_NAME__: values.sb3Name,
        __TOOLCHAIN_VERSION__: values.toolchainVersion,
        __STARTER_VERSION__: values.starterVersion,
        __GUIDE_URL__: workflowGuideUrl,
        __SCRATCH_SECTION__: scratchSection(values.scratch, values.language)
    };
    const output = new Map<string, string>();
    for (const layer of ['common', values.language]) {
        const root = path.join(templatesDirectory, layer);
        for (const file of await listFiles(root)) {
            const text = await readFile(path.join(root, file), 'utf8');
            // One pass, so values taken from Scratch are never themselves treated as placeholders.
            const rendered = text.replace(/__[A-Z0-9_]+__/g, key => {
                if (!(key in replacements)) throw new Error(`Unknown placeholder ${key} in template ${layer}/${file}`);
                return replacements[key];
            });
            const base = path.posix.basename(file);
            output.set(path.posix.join(path.posix.dirname(file), renamed[base] ?? base).replace(/^\.\//, ''), rendered);
        }
    }
    return output;
}
