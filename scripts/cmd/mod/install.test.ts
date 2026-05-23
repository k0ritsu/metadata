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
import { pathToFileURL } from 'node:url';

interface TestModule {
  dependencies?: Record<string, string>;
  name: string;
  version: string;
}

function runInstall(
  root: string,
  repository: Map<string, TestModule>,
  specs: string[]
) {
  const tarballUrl = String(
    pathToFileURL(resolve('scripts/cmd/mod/common/helpers/tarball.ts'))
  );
  const installUrl = String(pathToFileURL(resolve('scripts/cmd/mod/install.ts')));

  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
const repository = new Map(${JSON.stringify(Array.from(repository.entries()))});
const [{ createGzipTarArchive }, { install }] = await Promise.all([
  import(${JSON.stringify(tarballUrl)}),
  import(${JSON.stringify(installUrl)})
]);

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  const [, modulesPath, name, versionsPath, version, archivePath] =
    url.pathname.split('/');

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

  if (archivePath !== 'archive') {
    return new Response('', { status: 404 });
  }

  const mod = repository.get(\`\${name}@\${version}\`);
  if (!mod) {
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
      path: 'module.json'
    }
  ]);

  return new Response(new Uint8Array(archive), {
    headers: {
      'content-type': 'application/gzip'
    }
  });
};

await install(${JSON.stringify([
        '--repository',
        'http://repo.local',
        ...specs
      ])});
`
    ],
    {
      cwd: root,
      stdio: 'pipe'
    }
  );
}

test('install hoists compatible dependencies and nests conflicts', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-install-'));
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

  runInstall(root, repository, ['app@1.0.0', 'tool@1.0.0']);

  assert.equal(existsSync(join(modules, 'lib', 'module.json')), true);
  assert.equal(
    existsSync(join(modules, 'tool', 'modules', 'lib', 'module.json')),
    true
  );

  const rootLib = JSON.parse(
    readFileSync(join(modules, 'lib', 'module.json'), 'utf8')
  );
  const nestedLib = JSON.parse(
    readFileSync(
      join(modules, 'tool', 'modules', 'lib', 'module.json'),
      'utf8'
    )
  );
  const appTsconfig = JSON.parse(
    readFileSync(join(modules, 'app', 'tsconfig.json'), 'utf8')
  );
  const toolTsconfig = JSON.parse(
    readFileSync(join(modules, 'tool', 'tsconfig.json'), 'utf8')
  );

  assert.equal(rootLib.version, '1.2.0');
  assert.equal(nestedLib.version, '2.0.0');
  assert.deepEqual(appTsconfig.compilerOptions.paths['#modules/lib'], [
    '../lib'
  ]);
  assert.deepEqual(toolTsconfig.compilerOptions.paths['#modules/lib'], [
    './modules/lib'
  ]);
});

test('install keeps nested conflicts local to the dependent module', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-install-'));
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

  runInstall(root, repository, ['plugin@2.0.0', 'app@1.0.0']);

  assert.equal(existsSync(join(modules, 'lib', 'module.json')), true);
  assert.equal(
    existsSync(join(modules, 'app', 'modules', 'lib', 'module.json')),
    false
  );
  assert.equal(
    existsSync(
      join(
        modules,
        'app',
        'modules',
        'plugin',
        'modules',
        'lib',
        'module.json'
      )
    ),
    true
  );

  const appTsconfig = JSON.parse(
    readFileSync(join(modules, 'app', 'tsconfig.json'), 'utf8')
  );
  const pluginTsconfig = JSON.parse(
    readFileSync(
      join(modules, 'app', 'modules', 'plugin', 'tsconfig.json'),
      'utf8'
    )
  );

  assert.deepEqual(appTsconfig.compilerOptions.paths['#modules/lib'], [
    '../lib'
  ]);
  assert.deepEqual(pluginTsconfig.compilerOptions.paths['#modules/lib'], [
    './modules/lib'
  ]);
});
