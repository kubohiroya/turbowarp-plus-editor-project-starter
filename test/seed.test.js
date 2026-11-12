import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRepositorySeed, SeedError} from '@kubohiroya/turbowarp-plus-editor-project-starter/seed';

const decoder = new TextDecoder();
const input = {
    sb3: new Uint8Array([1, 2]),
    title: 'New project',
    description: 'A [link](https://example.invalid/) to escape',
    language: 'en',
    license: {name: 'MIT', text: 'License text\n'},
    scratch: {
        id: '123',
        url: 'https://scratch.mit.edu/projects/123/',
        title: 'Original project',
        author: 'Author',
        instructions: '',
        notes: ''
    }
};

test('generates an in-memory README, license and project files with warnings', () => {
    const project = new Map([['project.source.json', new Uint8Array([3])]]);
    const {files, warnings} = createRepositorySeed(input, {
        unpackSb3: bytes => {
            assert.strictEqual(bytes, input.sb3);
            return {files: project, warnings: [{code: 'directory-entry', path: 'assets/'}]};
        },
        toolchainVersion: '0.23.0'
    });
    const repository = new Map(files.map(({path, bytes}) => [path, bytes]));
    assert.match(decoder.decode(repository.get('README.md')), /# New project\n/);
    assert.match(decoder.decode(repository.get('README.md')), /https:\/\/scratch\.mit\.edu\/projects\/123\//);
    assert.match(decoder.decode(repository.get('README.md')), /\[MIT\]\(LICENSE\)/);
    assert.equal(decoder.decode(repository.get('LICENSE')), input.license.text);
    assert.match(decoder.decode(repository.get('.gitignore')), /\*\.sb3/);
    assert.deepEqual(repository.get('project/project.source.json'), project.get('project.source.json'));
    assert.deepEqual(warnings, [{code: 'directory-entry', path: 'assets/'}, {code: 'scratch-license'}]);
});

test('retains the unpack error code', () => {
    assert.throws(() => createRepositorySeed(input, {
        unpackSb3() { throw Object.assign(new Error('Missing asset'), {code: 'missing-asset'}); },
        toolchainVersion: '0.23.0'
    }), error => error instanceof SeedError && error.code === 'missing-asset');
});
