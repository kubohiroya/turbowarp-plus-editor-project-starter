import {readFile, writeFile} from 'node:fs/promises';

const root = new URL('../templates/repository/', import.meta.url);
const [ja, en, gitignore] = await Promise.all(
    ['ja.md', 'en.md', '_gitignore'].map(name => readFile(new URL(name, root), 'utf8'))
);
const output = new URL('../src/repository-templates.generated.ts', import.meta.url);
await writeFile(output, '// Generated from templates/repository by the build.\n' +
    'export const repositoryTemplates = ' + JSON.stringify({ja, en, gitignore}, null, 4) + ' as const;\n');
