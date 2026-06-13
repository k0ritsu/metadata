import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

function writeModule(root: string) {
  mkdirSync(join(root, 'src'), {
    recursive: true
  });
  writeFileSync(
    join(root, 'module.json'),
    JSON.stringify(
      {
        name: 'app',
        description: '',
        version: '1.0.0',
        main: 'src/index.ts',
        dependencies: {}
      },
      undefined,
      2
    )
  );
  writeFileSync(
    join(root, 'src', 'index.ts'),
    `export const value = 'published';
`
  );
  writeFileSync(join(root, 'tsconfig.json'), '{}');
}

function writeModlock(root: string) {
  const modules = join(root, 'src', 'modules');
  mkdirSync(modules, {
    recursive: true
  });
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
          'app@1.0.0': {
            dependencies: {}
          }
        }
      },
      undefined,
      2
    )
  );
}

function runPublish(root: string) {
  return runPublishWithOptions(root, {});
}

function runPublishWithOptions(
  root: string,
  options: {
    marker?: string;
  }
) {
  const publishUrl = String(pathToFileURL(resolve('scripts/cmd/mod/publish.ts')));
  const archiveUrl = String(pathToFileURL(resolve('scripts/cmd/mod/common/helpers/archive.ts')));

  return execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `const [{ publish }, { extractGzipTarArchive }] = await Promise.all([
  import(${JSON.stringify(publishUrl)}),
  import(${JSON.stringify(archiveUrl)})
]);

globalThis.fetch = async (input, init) => {
  ${
    options.marker
      ? `await import('node:fs/promises').then(({ writeFile }) => writeFile(${JSON.stringify(options.marker)}, 'posted'));`
      : ''
  }

  const url = new URL(String(input));
  const [, modulesPath, name, versionsPath] = url.pathname.split('/');

  if (
    modulesPath !== 'modules' ||
    name !== 'app' ||
    versionsPath !== 'versions' ||
    init?.method !== 'POST'
  ) {
    return new Response('', { status: 404 });
  }

  const files = await extractGzipTarArchive(
    Buffer.from(await init.body.arrayBuffer())
  );
  const paths = files.map((file) => file.path).sort();

  if (
    JSON.stringify(paths) !==
    JSON.stringify(['module.json', 'src/index.ts'])
  ) {
    return new Response(JSON.stringify({ detail: paths.join(',') }), {
      status: 400
    });
  }

  return new Response(
    JSON.stringify({
      name: 'app',
      description: '',
      version: '1.0.0',
      repositoryUrl: 'https://repo.local/modules/app',
      archiveUrl: 'https://repo.local/modules/app/versions/1.0.0/archive'
    }),
    {
      headers: {
        'content-type': 'application/json'
      }
    }
  );
};

await publish(['--repository', 'https://repo.local', 'app']);
`
    ],
    {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe'
    }
  );
}

function runPublishError(root: string, marker: string) {
  try {
    runPublishWithOptions(root, {
      marker
    });
  } catch (error) {
    return error;
  }

  assert.fail('expected publish to fail');
}

function readModlock(root: string) {
  return JSON.parse(readFileSync(join(root, 'src', 'modules', 'modlock.json'), 'utf8'));
}

test('publish uploads module files and records resolved metadata', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-publish-'));
  const app = join(root, 'src', 'modules', 'app');

  writeModule(app);
  writeModlock(root);

  const output = runPublish(root);
  const node = readModlock(root).modules['app@1.0.0'];

  assert.match(output, /Published app@1\.0\.0/);
  assert.match(output, /Repository: https:\/\/repo\.local\/modules\/app/);
  assert.match(output, /Archive: https:\/\/repo\.local\/modules\/app\/versions\/1\.0\.0\/archive/);
  assert.equal(node.resolved, 'https://repo.local/modules/app/versions/1.0.0/archive');
  assert.match(node.integrity, /^sha512-/);
});

test('publish does not post when module is missing from root lock set', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-publish-'));
  const app = join(root, 'src', 'modules', 'app');
  const marker = join(root, 'posted');

  writeModule(app);
  writeModlock(root);
  writeFileSync(
    join(root, 'src', 'modules', 'modlock.json'),
    JSON.stringify(
      {
        lockfileVersion: 1,
        modules: {
          '': {
            dependencies: {}
          },
          'app@1.0.0': {
            dependencies: {}
          }
        }
      },
      undefined,
      2
    )
  );

  runPublishError(root, marker);

  assert.equal(existsSync(marker), false);
});

test('publish does not post when lockfile graph is stale', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-publish-'));
  const app = join(root, 'src', 'modules', 'app');
  const marker = join(root, 'posted');

  writeModule(app);
  writeFileSync(
    join(app, 'module.json'),
    JSON.stringify(
      {
        name: 'app',
        description: '',
        version: '1.0.0',
        main: 'src/index.ts',
        dependencies: {
          lib: '^1.0.0'
        }
      },
      undefined,
      2
    )
  );
  writeModlock(root);

  runPublishError(root, marker);

  assert.equal(existsSync(marker), false);
});
