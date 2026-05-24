import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

interface TestModule {
  dependencies?: Record<string, string>;
  main?: string;
  name: string;
  version: string;
}

function writeModule(root: string, mod: TestModule) {
  mkdirSync(root, {
    recursive: true
  });
  writeFileSync(
    join(root, 'module.json'),
    JSON.stringify(
      {
        description: '',
        dependencies: {},
        ...mod
      },
      undefined,
      2
    )
  );
}

function runBuild(root: string) {
  execFileSync(process.execPath, [resolve('scripts', 'mod.ts'), 'build'], {
    cwd: root
  });
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('build writes dist manifests for root and cached modules', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-build-'));

  const modules = join(root, 'src', 'modules');

  writeModule(join(modules, 'app'), {
    name: 'app',
    version: '1.0.0',
    main: 'src/index.ts'
  });
  writeModule(join(modules, '.cache', 'lib@1.2.0'), {
    name: 'lib',
    version: '1.2.0',
    main: 'src/lib.ts'
  });

  runBuild(root);

  assert.deepEqual(
    readJson(join(root, 'dist', 'modules', 'app', 'module.json')),
    {
      name: 'app',
      description: '',
      version: '1.0.0',
      dependencies: {},
      main: 'src/index.js'
    }
  );
  assert.deepEqual(
    readJson(
      join(root, 'dist', 'modules', '.cache', 'lib@1.2.0', 'module.json')
    ),
    {
      name: 'lib',
      description: '',
      version: '1.2.0',
      dependencies: {},
      main: 'src/lib.js'
    }
  );
});
