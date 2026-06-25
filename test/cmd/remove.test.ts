import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

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
  return JSON.parse(readFileSync(join(root, 'src', 'modules', 'modlock.json'), 'utf8'));
}

function writeModlock(root: string, modlock: unknown) {
  writeFileSync(
    join(root, 'src', 'modules', 'modlock.json'),
    JSON.stringify(modlock, undefined, 2)
  );
}

function createIntegrity(root: string, moduleRoot: string) {
  const helperUrl = String(pathToFileURL(resolve('scripts/cmd/mod/common/helpers/integrity.ts')));

  return execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `const { createModuleIntegrity } = await import(${JSON.stringify(helperUrl)});
console.log(await createModuleIntegrity(${JSON.stringify(moduleRoot)}));
`
    ],
    {
      cwd: root,
      encoding: 'utf8'
    }
  ).trim();
}

function runRemoveError(root: string, name: string) {
  try {
    execFileSync(process.execPath, [resolve('scripts', 'mod.ts'), 'remove', name], {
      cwd: root,
      stdio: 'pipe'
    });
  } catch (error) {
    return error;
  }

  assert.fail('expected remove to fail');
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
  const modlock = readModlock(root);
  modlock.modules['lib@1.0.0'].integrity = createIntegrity(root, join(modules, 'lib'));
  writeModlock(root, modlock);

  execFileSync(process.execPath, [resolve('scripts', 'mod.ts'), 'remove', 'lib'], {
    cwd: root
  });

  const nextModlock = readModlock(root);

  assert.deepEqual(nextModlock.modules[''].dependencies, {
    app: '1.0.0'
  });
  assert.deepEqual(nextModlock.modules['app@1.0.0'].dependencies, {
    lib: '1.0.0'
  });
  assert.equal(existsSync(join(modules, 'lib', 'module.json')), false);
  assert.equal(existsSync(join(modules, '.cache', 'lib@1.0.0', 'module.json')), true);
});

test('remove blocks dirty root when same version already exists in cache', () => {
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
  writeModule(join(modules, '.cache', 'lib@1.0.0'), 'lib');

  const integrity = createIntegrity(root, join(modules, 'lib'));
  writeModlock(root, {
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
          lib: '1.0.0'
        }
      },
      'lib@1.0.0': {
        dependencies: {},
        integrity
      }
    }
  });
  writeFileSync(join(modules, 'lib', 'local.ts'), 'changed');

  runRemoveError(root, 'lib');

  assert.equal(existsSync(join(modules, 'lib', 'module.json')), true);
  assert.deepEqual(readModlock(root).modules[''].dependencies, {
    app: '1.0.0',
    lib: '1.0.0'
  });
});

test('remove moves clean reachable root module to cache', () => {
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

  const integrity = createIntegrity(root, join(modules, 'lib'));
  writeModlock(root, {
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
          lib: '1.0.0'
        }
      },
      'lib@1.0.0': {
        dependencies: {},
        integrity
      }
    }
  });

  execFileSync(process.execPath, [resolve('scripts', 'mod.ts'), 'remove', 'lib'], {
    cwd: root
  });

  assert.equal(existsSync(join(modules, 'lib', 'module.json')), false);
  assert.equal(existsSync(join(modules, '.cache', 'lib@1.0.0', 'module.json')), true);
});

test('remove replaces corrupt existing cache before deleting clean reachable root module', () => {
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
  writeFileSync(join(modules, 'app', 'main.ts'), 'export const app = true;\n');
  writeModule(join(modules, 'lib'), 'lib');
  writeFileSync(join(modules, 'lib', 'value.ts'), 'export const value = 1;\n');
  writeModule(join(modules, '.cache', 'lib@1.0.0'), 'lib');
  writeFileSync(join(modules, '.cache', 'lib@1.0.0', 'value.ts'), 'export const value = 999;\n');

  const appIntegrity = createIntegrity(root, join(modules, 'app'));
  const libIntegrity = createIntegrity(root, join(modules, 'lib'));
  writeModlock(root, {
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
          lib: '1.0.0'
        },
        integrity: appIntegrity
      },
      'lib@1.0.0': {
        dependencies: {},
        integrity: libIntegrity
      }
    }
  });

  execFileSync(process.execPath, [resolve('scripts', 'mod.ts'), 'remove', 'lib'], {
    cwd: root
  });

  assert.equal(existsSync(join(modules, 'lib', 'module.json')), false);
  assert.equal(readFileSync(join(modules, '.cache', 'lib@1.0.0', 'value.ts'), 'utf8'), 'export const value = 1;\n');
  execFileSync(process.execPath, [resolve('scripts', 'mod.ts'), 'verify'], {
    cwd: root
  });
});
