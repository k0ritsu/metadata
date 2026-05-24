import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

test('init creates repository config and a minimal lockfile', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-init-'));
  const modules = join(root, 'src', 'modules');

  execFileSync(
    process.execPath,
    [resolve('scripts', 'mod.ts'), 'init', '--repository', 'http://localhost'],
    {
      cwd: root
    }
  );

  assert.deepEqual(
    JSON.parse(readFileSync(join(modules, 'modrc.json'), 'utf8')),
    {
      repository: 'http://localhost'
    }
  );
  assert.deepEqual(
    JSON.parse(readFileSync(join(modules, 'modlock.json'), 'utf8')),
    {
      lockfileVersion: 1,
      modules: {
        '': {
          dependencies: {}
        }
      }
    }
  );
});

test('init does not scan modules', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-init-'));
  const modules = join(root, 'src', 'modules');

  mkdirSync(join(modules, 'new-module'), {
    recursive: true
  });
  writeFileSync(
    join(modules, 'new-module', 'module.json'),
    JSON.stringify({
      name: 'new-module',
      description: '',
      version: '1.0.0'
    })
  );
  writeFileSync(
    join(modules, 'modrc.json'),
    JSON.stringify({
      repository: 'http://localhost:1337'
    })
  );

  execFileSync(process.execPath, [resolve('scripts', 'mod.ts'), 'init'], {
    cwd: root
  });

  assert.deepEqual(
    JSON.parse(readFileSync(join(modules, 'modlock.json'), 'utf8')),
    {
      lockfileVersion: 1,
      modules: {
        '': {
          dependencies: {}
        }
      }
    }
  );
});

test('init does not rewrite an existing lockfile', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-init-'));
  const modules = join(root, 'src', 'modules');

  const existing = {
    lockfileVersion: 1,
    modules: {
      '': {
        dependencies: {
          app: '1.0.0'
        }
      },
      'app@1.0.0': {
        dependencies: {}
      }
    }
  };

  mkdirSync(modules, {
    recursive: true
  });
  writeFileSync(
    join(modules, 'modrc.json'),
    JSON.stringify({
      repository: 'http://localhost:1337'
    })
  );
  writeFileSync(join(modules, 'modlock.json'), JSON.stringify(existing));

  execFileSync(process.execPath, [resolve('scripts', 'mod.ts'), 'init'], {
    cwd: root
  });

  assert.equal(
    readFileSync(join(modules, 'modlock.json'), 'utf8'),
    JSON.stringify(existing)
  );
});
