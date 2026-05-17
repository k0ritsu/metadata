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

test('remove preserves dependency edges when hoisting shared dependencies', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-remove-'));
  const modules = join(root, 'src', 'modules');

  writeFileSync(join(root, 'tsconfig.base.json'), '{}');
  writeFileSync(join(root, 'tsconfig.json'), '{}');
  mkdirSync(modules, {
    recursive: true
  });
  writeFileSync(
    join(modules, 'modrc.json'),
    JSON.stringify({
      repository: 'http://localhost:1337'
    })
  );
  writeModule(join(modules, 'app'), 'app', {
    lib: '1.0.0'
  });
  writeModule(join(modules, 'app', 'modules', 'lib'), 'lib');
  writeModule(join(modules, 'tool'), 'tool', {
    lib: '1.0.0'
  });
  writeModule(join(modules, 'tool', 'modules', 'lib'), 'lib');

  execFileSync(process.execPath, [resolve('scripts', 'mod.ts'), 'init'], {
    cwd: root
  });
  execFileSync(
    process.execPath,
    [resolve('scripts', 'mod.ts'), 'remove', 'app'],
    {
      cwd: root
    }
  );

  let modlock = readModlock(root);
  assert.equal(modlock.tool.dependencies.lib.version, '1.0.0');
  assert.equal(modlock.lib.version, '1.0.0');
  assert.equal(existsSync(join(modules, 'lib', 'module.json')), true);

  execFileSync(
    process.execPath,
    [resolve('scripts', 'mod.ts'), 'remove', 'lib'],
    {
      cwd: root
    }
  );

  modlock = readModlock(root);
  assert.equal(modlock.tool.dependencies.lib.version, '1.0.0');
  assert.equal(existsSync(join(modules, 'lib', 'module.json')), false);
  assert.equal(
    existsSync(join(modules, 'tool', 'modules', 'lib', 'module.json')),
    true
  );
});
