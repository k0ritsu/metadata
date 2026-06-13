import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

function runCreate(root: string, name: string) {
  execFileSync(process.execPath, [resolve('scripts', 'mod.ts'), 'create', name], {
    cwd: root
  });
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('create adds a root module, lock entry, and tsconfig', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-create-'));

  const modules = join(root, 'src', 'modules');

  runCreate(root, 'app');

  assert.deepEqual(readJson(join(modules, 'app', 'module.json')), {
    name: 'app',
    description: '',
    version: '0.1.0',
    dependencies: {}
  });
  assert.deepEqual(readJson(join(modules, 'modlock.json')), {
    lockfileVersion: 1,
    modules: {
      '': {
        dependencies: {
          app: '0.1.0'
        }
      },
      'app@0.1.0': {
        dependencies: {}
      }
    }
  });
  assert.deepEqual(readJson(join(root, 'tsconfig.build.json')).references, [
    {
      path: './tsconfig.json'
    },
    {
      path: './src/modules/app/tsconfig.json'
    }
  ]);
  assert.equal(readJson(join(modules, 'app', 'tsconfig.json')).compilerOptions.rootDir, '.');
});
