import type {ScratchProjectInfo} from './scratch.js';

export type Language = 'ja' | 'en';

/** The Plus Editor feature guide chapter that walks through issue → release. */
export const workflowGuideUrl = 'https://kubohiroya.github.io/turbowarp-plus-editor/features/github/';

/** Text that a Markdown renderer shows as written: no headings, links or HTML from the Scratch page. */
export function quoteMarkdown(text: string): string {
    return text.replace(/\r\n?/g, '\n').trim().split('\n')
        // Escape what could turn into links, HTML, code or tables; leave "_" alone so URLs stay intact.
        .map(line => `> ${line.replace(/([\\`*[\]<>|])/g, '\\$1').replace(/^(\s*)([#=-])/, '$1\\$2')}`).join('\n');
}

export function scratchSection(scratch: ScratchProjectInfo | null, language: Language): string {
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

/** An ASCII name for the repository folder and SB3 file; falls back when the title has no Latin letters. */
export function slugify(title: string, fallback: string): string {
    const slug = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
    return slug.length >= 2 ? slug : fallback;
}
