import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { createRepositoryUrl } from './common/helpers/repository.ts';

test('init keeps nested modules out of root lock and resolves ranges', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-init-'));
  const modules = join(root, 'src', 'modules');

  mkdirSync(join(modules, 'app', 'modules', 'lib'), {
    recursive: true
  });
  writeFileSync(join(root, 'tsconfig.base.json'), '{}');
  writeFileSync(join(root, 'tsconfig.json'), '{}');
  writeFileSync(
    join(modules, 'app', 'module.json'),
    JSON.stringify(
      {
        name: 'app',
        description: '',
        version: '1.0.0',
        dependencies: {
          lib: '^1.0.0'
        }
      },
      undefined,
      2
    )
  );
  writeFileSync(
    join(modules, 'app', 'modules', 'lib', 'module.json'),
    JSON.stringify(
      {
        name: 'lib',
        description: '',
        version: '1.2.0'
      },
      undefined,
      2
    )
  );

  execFileSync(
    process.execPath,
    [resolve('scripts', 'mod.ts'), 'init', '--repository', 'http://localhost'],
    {
      cwd: root
    }
  );

  const modlock = JSON.parse(
    readFileSync(join(modules, 'modlock.json'), 'utf8')
  );

  assert.deepEqual(Object.keys(modlock), ['app']);
  assert.equal(modlock.app.dependencies.lib.version, '1.2.0');
});

test('init migrates legacy registry config to repository config', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-init-'));
  const modules = join(root, 'src', 'modules');

  mkdirSync(join(modules, 'app'), {
    recursive: true
  });
  writeFileSync(join(root, 'tsconfig.base.json'), '{}');
  writeFileSync(join(root, 'tsconfig.json'), '{}');
  writeFileSync(
    join(modules, 'modrc.json'),
    JSON.stringify({
      registry: 'http://localhost:1337/api'
    })
  );
  writeFileSync(
    join(modules, 'app', 'module.json'),
    JSON.stringify({
      name: 'app',
      description: '',
      version: '1.0.0'
    })
  );

  execFileSync(process.execPath, [resolve('scripts', 'mod.ts'), 'init'], {
    cwd: root
  });

  assert.deepEqual(JSON.parse(readFileSync(join(modules, 'modrc.json'), 'utf8')), {
    repository: 'http://localhost:1337/api'
  });
});

test('repository URLs preserve repository base paths', () => {
  assert.equal(
    String(createRepositoryUrl('http://localhost:1337/api', 'modules/app')),
    'http://localhost:1337/api/modules/app'
  );
  assert.equal(
    String(createRepositoryUrl('http://localhost:1337/api/', '/modules/app')),
    'http://localhost:1337/api/modules/app'
  );
});
