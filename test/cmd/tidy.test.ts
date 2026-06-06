import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

interface TestModule {
  dependencies?: Record<string, string>;
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

function runTidy(root: string) {
  execFileSync(process.execPath, [resolve('scripts', 'mod.ts'), 'tidy'], {
    cwd: root
  });
}

function readModlock(root: string) {
  return JSON.parse(
    readFileSync(join(root, 'src', 'modules', 'modlock.json'), 'utf8')
  );
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('tidy builds a flat modlock from root modules and cache', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-tidy-'));
  const modules = join(root, 'src', 'modules');

  writeModule(join(modules, 'app'), {
    name: 'app',
    version: '1.0.0',
    dependencies: {
      lib: '^1.0.0'
    }
  });
  writeModule(join(modules, '.cache', 'lib@1.2.0'), {
    name: 'lib',
    version: '1.2.0'
  });
  mkdirSync(join(modules, '.cache', 'unused@1.0.0'), {
    recursive: true
  });
  writeFileSync(join(modules, '.cache', 'unused@1.0.0', 'module.json'), '{');
  writeFileSync(
    join(modules, 'modlock.json'),
    JSON.stringify(
      {
        lockfileVersion: 1,
        modules: {
          '': {
            dependencies: {
              app: '1.0.0'
            }
          },
          'lib@1.2.0': {
            dependencies: {},
            integrity: 'sha512-old',
            resolved: 'https://repo.local/modules/lib/1.2.0'
          },
          'unused@1.0.0': {
            dependencies: {},
            integrity: 'sha512-unused'
          }
        }
      },
      undefined,
      2
    )
  );

  runTidy(root);

  assert.deepEqual(readModlock(root), {
    lockfileVersion: 1,
    modules: {
      '': {
        dependencies: {
          app: '1.0.0'
        }
      },
      'app@1.0.0': {
        dependencies: {
          lib: '1.2.0'
        }
      },
      'lib@1.2.0': {
        dependencies: {},
        integrity: 'sha512-old',
        resolved: 'https://repo.local/modules/lib/1.2.0'
      }
    }
  });

  assert.deepEqual(
    readJson(join(modules, 'app', 'tsconfig.json')).compilerOptions.paths[
      '#modules/lib'
    ],
    ['../.cache/lib@1.2.0']
  );
  assert.deepEqual(
    readJson(join(modules, 'app', 'tsconfig.json')).compilerOptions.paths[
      '#core/router'
    ],
    ['../../router/types.ts']
  );
  assert.deepEqual(
    readJson(join(modules, 'app', 'tsconfig.json')).compilerOptions.paths[
      '#core/errors/*'
    ],
    ['../../errors/*']
  );
  assert.deepEqual(
    readJson(join(modules, '.cache', 'lib@1.2.0', 'tsconfig.json'))
      .compilerOptions.paths['#core/router'],
    ['../../../router/types.ts']
  );
  assert.deepEqual(
    readJson(join(modules, '.cache', 'lib@1.2.0', 'tsconfig.json'))
      .compilerOptions.paths['#core/errors/*'],
    ['../../../errors/*']
  );
  assert.deepEqual(readJson(join(root, 'tsconfig.build.json')).references, [
    {
      path: './tsconfig.json'
    },
    {
      path: './src/modules/app/tsconfig.json'
    },
    {
      path: './src/modules/.cache/lib@1.2.0/tsconfig.json'
    }
  ]);
});

test('tidy uses cache when a root module has a different version', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-tidy-'));
  const modules = join(root, 'src', 'modules');

  writeModule(join(modules, 'app'), {
    name: 'app',
    version: '1.0.0',
    dependencies: {
      lib: '2.0.0'
    }
  });
  writeModule(join(modules, 'lib'), {
    name: 'lib',
    version: '1.0.0'
  });
  writeModule(join(modules, '.cache', 'lib@2.0.0'), {
    name: 'lib',
    version: '2.0.0'
  });

  runTidy(root);

  assert.deepEqual(readModlock(root), {
    lockfileVersion: 1,
    modules: {
      '': {
        dependencies: {
          app: '1.0.0',
          lib: '1.0.0'
        }
      },
      'app@1.0.0': {
        dependencies: {
          lib: '2.0.0'
        }
      },
      'lib@1.0.0': {
        dependencies: {}
      },
      'lib@2.0.0': {
        dependencies: {}
      }
    }
  });
});
