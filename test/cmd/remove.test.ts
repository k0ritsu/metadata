import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

function writeModule(root: string, name: string, dependencies = {}) {
  mkdirSync(root, {
    recursive: true
  });
  writeFileSync(
    join(root, 'module.json'),
    JSON.stringify(
      {
        name,
        description: '',
        version: '1.0.0',
        dependencies
      },
      undefined,
      2
    )
  );
}

function readModlock(root: string) {
  return JSON.parse(
    readFileSync(join(root, 'src', 'modules', 'modlock.json'), 'utf8')
  );
}

test('remove keeps a removed root module in cache when still reachable', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-remove-'));

  const modules = join(root, 'src', 'modules');

  writeFileSync(join(root, 'tsconfig.base.json'), '{}');
  writeFileSync(join(root, 'tsconfig.json'), '{}');
  mkdirSync(modules, {
    recursive: true
  });
  writeModule(join(modules, 'app'), 'app', {
    lib: '1.0.0'
  });
  writeModule(join(modules, 'lib'), 'lib');

  execFileSync(process.execPath, [resolve('scripts', 'mod.ts'), 'tidy'], {
    cwd: root
  });
  execFileSync(
    process.execPath,
    [resolve('scripts', 'mod.ts'), 'remove', 'lib'],
    {
      cwd: root
    }
  );

  const modlock = readModlock(root);

  assert.deepEqual(modlock.modules[''].dependencies, {
    app: '1.0.0'
  });
  assert.deepEqual(modlock.modules['app@1.0.0'].dependencies, {
    lib: '1.0.0'
  });
  assert.equal(existsSync(join(modules, 'lib', 'module.json')), false);
  assert.equal(
    existsSync(join(modules, '.cache', 'lib@1.0.0', 'module.json')),
    true
  );
});
