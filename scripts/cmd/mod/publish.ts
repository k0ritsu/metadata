import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MODULE, MODULES, ROOT_NODE } from './common/constants.ts';
import { createModuleIntegrity } from './common/helpers/integrity.ts';
import { createModuleKey } from './common/helpers/key.ts';
import {
  assertModuleName,
  readModuleManifest
} from './common/helpers/manifest.ts';
import { readModlock, writeModlock } from './common/helpers/modlock.ts';
import { normalizePath } from './common/helpers/path.ts';
import { isRecord } from './common/helpers/record.ts';
import {
  createRepositoryError,
  createRepositoryUrl,
  resolveRepository
} from './common/helpers/repository.ts';
import { createGzipTarArchive } from './common/helpers/tarball.ts';
import type { CommandHandler } from './common/types.ts';

interface PublishResult {
  name: string;
  version: string;
  repositoryUrl?: string;
  archiveUrl?: string;
  resolved?: string;
}

export const publish: CommandHandler = async (args: string[]) => {
  const { positionals, values } = parseArgs({
    strict: true,
    allowPositionals: true,
    options: {
      repository: {
        type: 'string'
      }
    },
    args
  });

  assert(positionals.length === 1, 'module name is required');

  const [name = ''] = positionals;
  assertModuleName(name);

  const root = resolve(MODULES, name);
  const mod = await readPublishManifest(root);
  assert(
    mod.name === name,
    `${root}: module directory must match module name ${mod.name}`
  );

  const [archive, repository] = await Promise.all([
    createPublishArchive(root),
    resolveRepository(values.repository)
  ]);

  const result = await postPublish(repository, mod.name, archive);
  assert(
    result.name === mod.name && result.version === mod.version,
    `repository returned ${result.name}@${result.version}, expected ${mod.name}@${mod.version}`
  );
  const resolved = result.resolved ?? result.archiveUrl;
  assert(resolved, 'repository returned no resolved URL');

  await updatePublishedLockfile(root, result, resolved);

  console.log(`Published ${result.name}@${result.version}`);

  if (result.repositoryUrl) {
    console.log(`Repository: ${result.repositoryUrl}`);
  }

  console.log(`Archive: ${resolved}`);
};

async function readPublishManifest(root: string) {
  const mod = await readModuleManifest(root, {
    validateDependencyRanges: true
  });

  return {
    name: mod.name,
    version: mod.version
  };
}

async function updatePublishedLockfile(
  root: string,
  result: PublishResult,
  resolved: string
) {
  const modlock = await readModlock();
  const key = createModuleKey(result.name, result.version);
  const rootVersion = modlock.modules[ROOT_NODE]?.dependencies[result.name];

  assert(
    rootVersion === result.version,
    `${result.name}@${result.version}: module is not installed as a root module`
  );

  const node = modlock.modules[key];
  assert(node, `${key}: module is missing from modlock`);

  node.integrity = await createModuleIntegrity(root);
  node.resolved = resolved;

  await writeModlock(modlock);
}

async function createPublishArchive(root: string) {
  const files = await collectPublishFiles(root);
  assert(files.includes(MODULE), `${resolve(root, MODULE)}: ${MODULE} missing`);

  const entries = await Promise.all(
    files.map(async (path) => {
      const absolute = resolve(root, path);
      const [content, stats] = await Promise.all([
        readFile(absolute),
        stat(absolute)
      ]);

      return {
        content,
        mode: stats.mode,
        path
      };
    })
  );

  return createGzipTarArchive(entries);
}

async function collectPublishFiles(root: string) {
  const files: string[] = [];

  async function visit(directory: string) {
    const entries = await readdir(directory, {
      withFileTypes: true
    });

    for (const entry of entries) {
      const absolute = resolve(directory, entry.name);
      const path = normalizePath(relative(root, absolute));

      if (isExcludedPublishPath(path, entry.isDirectory())) {
        continue;
      }

      if (entry.isDirectory()) {
        await visit(absolute);
        continue;
      }

      if (entry.isFile()) {
        files.push(path);
      }
    }
  }

  await visit(root);

  return files.sort((left, right) => left.localeCompare(right));
}

function isExcludedPublishPath(path: string, isDirectory: boolean) {
  const segments = path.split('/');
  const name = segments.at(-1) ?? '';

  return (isDirectory && name === 'modules') || name === 'tsconfig.json';
}

async function postPublish(repository: string, name: string, archive: Buffer) {
  const url = createRepositoryUrl(repository, `modules/${name}/versions`);

  const response = await fetch(url, {
    body: new Blob([new Uint8Array(archive)], {
      type: 'application/gzip'
    }),
    headers: {
      'content-type': 'application/gzip'
    },
    method: 'POST'
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(createRepositoryError('Publish failed', response, body));
  }

  const result: unknown = JSON.parse(body);
  assertPublishResult(result);

  return result;
}

function assertPublishResult(value: unknown): asserts value is PublishResult {
  assert(
    isRecord(value) &&
      typeof value['name'] === 'string' &&
      typeof value['version'] === 'string',
    'repository returned invalid publish result'
  );

  assert(
    value['resolved'] === undefined || typeof value['resolved'] === 'string',
    'repository returned invalid resolved URL'
  );
  assert(
    value['archiveUrl'] === undefined ||
      typeof value['archiveUrl'] === 'string',
    'repository returned invalid archive URL'
  );
  assert(
    value['repositoryUrl'] === undefined ||
      typeof value['repositoryUrl'] === 'string',
    'repository returned invalid repository URL'
  );
}
