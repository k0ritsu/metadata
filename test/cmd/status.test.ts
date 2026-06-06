import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

interface ModuleManifest {
  name: string;
  version: string;
}

function writeModule(root: string, manifest: ModuleManifest, source = 'clean') {
  mkdirSync(join(root, 'src'), {
    recursive: true
  });
  writeFileSync(
    join(root, 'module.json'),
    JSON.stringify(
      {
        description: '',
        dependencies: {},
        ...manifest
      },
      undefined,
      2
    )
  );
  writeFileSync(
    join(root, 'src', 'value.ts'),
    `export const value = ${JSON.stringify(source)};
`
  );
}

function writeModlock(root: string, modlock: unknown) {
  const modules = join(root, 'src', 'modules');
  mkdirSync(modules, {
    recursive: true
  });
  writeFileSync(
    join(modules, 'modlock.json'),
    JSON.stringify(modlock, undefined, 2)
  );
}

function runStatus(root: string) {
  return execFileSync(
    process.execPath,
    [resolve('scripts', 'mod.ts'), 'status'],
    {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
}

function runStatusError(root: string) {
  try {
    runStatus(root);
  } catch (error) {
    assert(error && typeof error === 'object' && 'stdout' in error);

    return error as Error & {
      stdout: Buffer | string;
    };
  }

  assert.fail('expected status to fail');
}

function createIntegrity(root: string, moduleRoot: string) {
  const helperUrl = String(
    pathToFileURL(resolve('scripts/cmd/mod/common/helpers/integrity.ts'))
  );

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

test('status prints nothing when module integrity matches lock', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-status-'));

  const modules = join(root, 'src', 'modules');
  const app = join(modules, 'app');

  writeModule(app, {
    name: 'app',
    version: '1.0.0'
  });

  const integrity = createIntegrity(root, app);
  writeModlock(root, {
    lockfileVersion: 1,
    modules: {
      '': {
        dependencies: {
          app: '1.0.0'
        }
      },
      'app@1.0.0': {
        dependencies: {},
        integrity
      }
    }
  });

  assert.equal(runStatus(root), '');
});

test('status reports modules whose integrity differs from lock', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-status-'));

  const modules = join(root, 'src', 'modules');
  const app = join(modules, 'app');

  writeModule(app, {
    name: 'app',
    version: '1.0.0'
  });

  const integrity = createIntegrity(root, app);
  writeFileSync(
    join(app, 'src', 'value.ts'),
    `export const value = 'changed';
`
  );
  writeModlock(root, {
    lockfileVersion: 1,
    modules: {
      '': {
        dependencies: {
          app: '1.0.0'
        }
      },
      'app@1.0.0': {
        dependencies: {},
        integrity
      }
    }
  });

  assert.match(runStatus(root), /app@1\.0\.0: integrity differs/);
});

test('status reports missing integrity as a warning', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-status-'));

  const modules = join(root, 'src', 'modules');
  const app = join(modules, 'app');

  writeModule(app, {
    name: 'app',
    version: '1.0.0'
  });
  writeModlock(root, {
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
  });

  assert.match(runStatus(root), /app@1\.0\.0: integrity is missing/);
});

test('status reports missing root modules as failures', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-status-'));

  writeModlock(root, {
    lockfileVersion: 1,
    modules: {
      '': {
        dependencies: {
          app: '1.0.0'
        }
      },
      'app@1.0.0': {
        dependencies: {},
        integrity: 'sha512-missing'
      },
      'cached@1.0.0': {
        dependencies: {},
        integrity: 'sha512-ignored'
      }
    }
  });

  const error = runStatusError(root);

  assert.match(String(error.stdout), /app@1\.0\.0: module is missing/);
  assert.doesNotMatch(String(error.stdout), /cached@1\.0\.0/);
});
