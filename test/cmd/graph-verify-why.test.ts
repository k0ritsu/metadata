import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

function writeModule(root: string, name: string, version: string) {
  mkdirSync(root, {
    recursive: true
  });
  writeFileSync(
    join(root, 'module.json'),
    JSON.stringify({
      dependencies: {},
      description: '',
      name,
      version
    })
  );
}

function writeModlock(root: string) {
  const modules = join(root, 'src', 'modules');
  mkdirSync(modules, {
    recursive: true
  });
  writeFileSync(
    join(modules, 'modlock.json'),
    JSON.stringify({
      lockfileVersion: 1,
      modules: {
        '': {
          dependencies: {
            app: '1.0.0'
          }
        },
        'app@1.0.0': {
          dependencies: {
            lib: '1.0.0'
          }
        },
        'lib@1.0.0': {
          dependencies: {},
          integrity: 'sha512-test',
          resolved: 'https://repo.local/modules/lib/versions/1.0.0/archive'
        }
      }
    })
  );
}

function run(root: string, args: string[]) {
  return execFileSync(process.execPath, [resolve('scripts', 'mod.ts'), ...args], {
    cwd: root,
    encoding: 'utf8'
  }).trim();
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

test('graph and why read selected edges from modlock', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-graph-'));
  writeModlock(root);

  assert.equal(run(root, ['graph']), 'root app@1.0.0\napp@1.0.0 lib@1.0.0');
  assert.equal(run(root, ['why', 'lib@1.0.0']), '# lib@1.0.0\nroot\napp@1.0.0\nlib@1.0.0');
});

test('verify ignores extra directories outside the lockfile graph', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-verify-'));
  const modules = join(root, 'src', 'modules');

  mkdirSync(modules, {
    recursive: true
  });
  writeModule(join(modules, 'app'), 'app', '1.0.0');
  writeModule(join(modules, 'extra'), 'extra', '1.0.0');
  writeFileSync(
    join(modules, 'modlock.json'),
    JSON.stringify({
      lockfileVersion: 1,
      modules: {
        '': {
          dependencies: {
            app: '1.0.0'
          }
        },
        'app@1.0.0': {
          dependencies: {},
          integrity: createIntegrity(root, join(modules, 'app'))
        }
      }
    })
  );

  assert.equal(run(root, ['verify']), 'All modules verified');
});

test('verify requires integrity for locked modules', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-verify-'));
  const modules = join(root, 'src', 'modules');

  mkdirSync(modules, {
    recursive: true
  });
  writeModule(join(modules, 'app'), 'app', '1.0.0');
  writeFileSync(
    join(modules, 'modlock.json'),
    JSON.stringify({
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
    })
  );

  assert.throws(() => run(root, ['verify']), /app@1\.0\.0: Missing integrity/);
});
