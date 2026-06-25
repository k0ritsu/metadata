import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

interface TestModule {
  dependencies?: Record<string, string>;
  name: string;
  version: string;
}

function runGet(root: string, repository: Map<string, TestModule>, specs: string[]) {
  const archiveUrl = String(pathToFileURL(resolve('scripts/cmd/mod/common/helpers/archive.ts')));
  const cmdUrl = String(pathToFileURL(resolve('scripts/cmd/cmd.ts')));
  const getUrl = String(pathToFileURL(resolve('scripts/cmd/mod/get.ts')));

  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
const repository = new Map(${JSON.stringify(Array.from(repository.entries()))});
const [{ createGzipTarArchive }] = await Promise.all([
  import(${JSON.stringify(archiveUrl)}),
  import(${JSON.stringify(getUrl)})
]);
const { main } = await import(${JSON.stringify(cmdUrl)});

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  const [, modulesPath, name, versionsPath, version, archivePath] = url.pathname.split('/');

  if (modulesPath !== 'modules' || versionsPath !== 'versions') {
    return new Response('', { status: 404 });
  }

  if (!version) {
    return new Response(
      JSON.stringify(
        Array.from(repository.values())
          .filter((mod) => mod.name === name)
          .map((mod) => mod.version)
      ),
      {
        headers: {
          'content-type': 'application/json'
        }
      }
    );
  }

  const mod = repository.get(\`\${name}@\${version}\`);
  if (!mod) {
    return new Response('', { status: 404 });
  }

  if (!archivePath) {
    return new Response(
      JSON.stringify({
        manifest: {
          description: '',
          dependencies: {},
          ...mod
        },
        repositoryUrl: \`http://repo.local/modules/\${name}\`,
        archiveUrl: \`http://repo.local/modules/\${name}/versions/\${version}/archive\`
      }),
      {
        headers: {
          'content-type': 'application/json'
        }
      }
    );
  }

  if (archivePath !== 'archive') {
    return new Response('', { status: 404 });
  }

  const archive = await createGzipTarArchive([
    {
      content: Buffer.from(
        JSON.stringify(
          {
            description: '',
            dependencies: {},
            ...mod
          },
          undefined,
          2
        )
      ),
      mode: 0o644,
      path: \`\${mod.name}-\${mod.version}/module.json\`
    }
  ]);

  return new Response(new Uint8Array(archive), {
    headers: {
      'content-type': 'application/gzip'
    }
  });
};

process.argv = [process.execPath, 'mod', 'get', ...${JSON.stringify([
        '--repository',
        'http://repo.local',
        ...specs
      ])}];
await main();
`
    ],
    {
      cwd: root,
      stdio: 'pipe'
    }
  );
}

function runGetWithArchive(root: string, archiveScript: string) {
  const archiveUrl = String(pathToFileURL(resolve('scripts/cmd/mod/common/helpers/archive.ts')));
  const cmdUrl = String(pathToFileURL(resolve('scripts/cmd/cmd.ts')));
  const getUrl = String(pathToFileURL(resolve('scripts/cmd/mod/get.ts')));

  return execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
const [{ createGzipTarArchive }] = await Promise.all([
  import(${JSON.stringify(archiveUrl)}),
  import(${JSON.stringify(getUrl)})
]);
const { main } = await import(${JSON.stringify(cmdUrl)});

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  if (url.pathname.endsWith('/versions/1.0.0')) {
    return new Response(JSON.stringify({
      archiveUrl: 'http://repo.local/modules/app/versions/1.0.0/archive'
    }), {
      headers: { 'content-type': 'application/json' }
    });
  }

  if (!url.pathname.endsWith('/archive')) {
    return new Response('', { status: 404 });
  }

  ${archiveScript}
};

process.argv = [process.execPath, 'mod', 'get', '--repository', 'http://repo.local', 'app@1.0.0'];
await main();
`
    ],
    {
      cwd: root,
      stdio: 'pipe'
    }
  );
}

function runInstallWithArchiveError(root: string, archiveScript: string) {
  try {
    runGetWithArchive(root, archiveScript);
  } catch (error) {
    return error;
  }

  assert.fail('expected get to fail');
}

function writeInstalledApp(root: string, source = 'existing') {
  const app = join(root, 'src', 'modules', 'app');
  mkdirSync(join(app, 'src'), {
    recursive: true
  });
  writeFileSync(
    join(app, 'module.json'),
    JSON.stringify(
      {
        name: 'app',
        description: '',
        version: '0.1.0',
        dependencies: {}
      },
      undefined,
      2
    )
  );
  writeFileSync(join(app, 'src', 'value.ts'), source);
}

test('get places dependency conflicts in flat cache entries', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-get-'));
  const modules = join(root, 'src', 'modules');
  const repository = new Map<string, TestModule>([
    [
      'app@1.0.0',
      {
        name: 'app',
        version: '1.0.0',
        dependencies: {
          lib: '^1.0.0'
        }
      }
    ],
    [
      'tool@1.0.0',
      {
        name: 'tool',
        version: '1.0.0',
        dependencies: {
          lib: '^2.0.0'
        }
      }
    ],
    [
      'lib@1.2.0',
      {
        name: 'lib',
        version: '1.2.0'
      }
    ],
    [
      'lib@2.0.0',
      {
        name: 'lib',
        version: '2.0.0'
      }
    ]
  ]);

  mkdirSync(modules, {
    recursive: true
  });
  writeFileSync(join(root, 'tsconfig.base.json'), '{}');
  writeFileSync(join(root, 'tsconfig.json'), '{}');

  runGet(root, repository, ['app@1.0.0', 'tool@1.0.0']);

  assert.equal(existsSync(join(modules, 'lib', 'module.json')), false);
  assert.equal(existsSync(join(modules, '.cache', 'lib@1.2.0', 'module.json')), true);
  assert.equal(existsSync(join(modules, '.cache', 'lib@2.0.0', 'module.json')), true);

  const appLib = JSON.parse(
    readFileSync(join(modules, '.cache', 'lib@1.2.0', 'module.json'), 'utf8')
  );
  const toolLib = JSON.parse(
    readFileSync(join(modules, '.cache', 'lib@2.0.0', 'module.json'), 'utf8')
  );
  const appTsconfig = JSON.parse(readFileSync(join(modules, 'app', 'tsconfig.json'), 'utf8'));
  const toolTsconfig = JSON.parse(readFileSync(join(modules, 'tool', 'tsconfig.json'), 'utf8'));

  assert.equal(appLib.version, '1.2.0');
  assert.equal(toolLib.version, '2.0.0');
  assert.deepEqual(appTsconfig.compilerOptions.paths['#modules/lib'], ['../.cache/lib@1.2.0']);
  assert.deepEqual(toolTsconfig.compilerOptions.paths['#modules/lib'], ['../.cache/lib@2.0.0']);
});

test('get resolves transitive conflicts by importer module key', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-get-'));
  const modules = join(root, 'src', 'modules');
  const repository = new Map<string, TestModule>([
    [
      'app@1.0.0',
      {
        name: 'app',
        version: '1.0.0',
        dependencies: {
          lib: '^1.0.0',
          plugin: '^1.0.0'
        }
      }
    ],
    [
      'plugin@1.0.0',
      {
        name: 'plugin',
        version: '1.0.0',
        dependencies: {
          lib: '^2.0.0'
        }
      }
    ],
    [
      'plugin@2.0.0',
      {
        name: 'plugin',
        version: '2.0.0'
      }
    ],
    [
      'lib@1.2.0',
      {
        name: 'lib',
        version: '1.2.0'
      }
    ],
    [
      'lib@2.0.0',
      {
        name: 'lib',
        version: '2.0.0'
      }
    ]
  ]);

  mkdirSync(modules, {
    recursive: true
  });
  writeFileSync(join(root, 'tsconfig.base.json'), '{}');
  writeFileSync(join(root, 'tsconfig.json'), '{}');

  runGet(root, repository, ['plugin@2.0.0', 'app@1.0.0']);

  assert.equal(existsSync(join(modules, 'lib', 'module.json')), false);
  assert.equal(existsSync(join(modules, '.cache', 'lib@1.2.0', 'module.json')), true);
  assert.equal(existsSync(join(modules, '.cache', 'plugin@1.0.0', 'module.json')), true);
  assert.equal(existsSync(join(modules, '.cache', 'lib@2.0.0', 'module.json')), true);

  const appTsconfig = JSON.parse(readFileSync(join(modules, 'app', 'tsconfig.json'), 'utf8'));
  const pluginTsconfig = JSON.parse(
    readFileSync(join(modules, '.cache', 'plugin@1.0.0', 'tsconfig.json'), 'utf8')
  );

  assert.deepEqual(appTsconfig.compilerOptions.paths['#modules/lib'], ['../.cache/lib@1.2.0']);
  assert.deepEqual(pluginTsconfig.compilerOptions.paths['#modules/lib'], ['../lib@2.0.0']);
});

test('get preserves existing root when archive is not gzip tar', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-get-'));
  const modules = join(root, 'src', 'modules');

  mkdirSync(modules, {
    recursive: true
  });
  writeFileSync(join(root, 'tsconfig.base.json'), '{}');
  writeFileSync(join(root, 'tsconfig.json'), '{}');
  writeInstalledApp(root);

  runInstallWithArchiveError(
    root,
    `return new Response(new TextEncoder().encode('not an archive'));`
  );

  assert.equal(readFileSync(join(modules, 'app', 'src', 'value.ts'), 'utf8'), 'existing');
});

test('get preserves existing root when archive manifest identity differs', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-get-'));
  const modules = join(root, 'src', 'modules');

  mkdirSync(modules, {
    recursive: true
  });
  writeFileSync(join(root, 'tsconfig.base.json'), '{}');
  writeFileSync(join(root, 'tsconfig.json'), '{}');
  writeInstalledApp(root);

  runInstallWithArchiveError(
    root,
    `const archive = await createGzipTarArchive([
  {
    content: Buffer.from(JSON.stringify({
      name: 'other',
      description: '',
      version: '1.0.0',
      dependencies: {}
    })),
    mode: 0o644,
    path: 'module.json'
  }
]);
return new Response(new Uint8Array(archive));`
  );

  assert.equal(readFileSync(join(modules, 'app', 'src', 'value.ts'), 'utf8'), 'existing');
});

test('get removes temporary staging directories after success', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-get-'));
  const modules = join(root, 'src', 'modules');
  const repository = new Map<string, TestModule>([
    [
      'app@1.0.0',
      {
        name: 'app',
        version: '1.0.0'
      }
    ]
  ]);

  mkdirSync(modules, {
    recursive: true
  });
  writeFileSync(join(root, 'tsconfig.base.json'), '{}');
  writeFileSync(join(root, 'tsconfig.json'), '{}');

  runGet(root, repository, ['app@1.0.0']);

  assert.equal(
    readdirSync(modules).some((entry) => entry.startsWith('.mod-tmp-app-')),
    false
  );
});
