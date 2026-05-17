import assert from 'node:assert';
import { readdir, readFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MODULE, MODULE_NAME } from './common/constants.ts';
import {
  hasModuleManifest,
  readModuleManifest
} from './common/helpers/manifest.ts';
import { normalizePath } from './common/helpers/path.ts';
import { isRecord } from './common/helpers/record.ts';
import {
  createRepositoryError,
  createRepositoryUrl,
  resolveRepository
} from './common/helpers/repository.ts';
import { createGzipTarArchive } from './common/helpers/tarball.ts';

interface PublishResult {
  name: string;
  version: string;
  repositoryUrl?: string;
  archiveUrl?: string;
}

export async function publish(args: string[]) {
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

  assert(positionals.length <= 1, 'publish accepts at most one module path');

  const root = await resolvePublishRoot(positionals[0]);
  const mod = await readPublishManifest(root);
  const [archive, repository] = await Promise.all([
    createPublishArchive(root),
    resolveRepository(values.repository)
  ]);

  const result = await postPublish(repository, mod.name, archive);

  console.log(`Published ${result.name}@${result.version}`);

  if (result.repositoryUrl) {
    console.log(`Repository: ${result.repositoryUrl}`);
  }

  if (result.archiveUrl) {
    console.log(`Archive: ${result.archiveUrl}`);
  }
}

async function resolvePublishRoot(input: string | undefined) {
  if (input === undefined) {
    return resolve('.');
  }

  const root = resolve(input);
  if (await hasModuleManifest(root)) {
    return root;
  }

  if (MODULE_NAME.test(input)) {
    const modulesRoot = resolve('src', 'modules', input);
    if (await hasModuleManifest(modulesRoot)) {
      return modulesRoot;
    }
  }

  return root;
}

async function readPublishManifest(root: string) {
  const mod = await readModuleManifest(root, {
    validateDependencyRanges: true
  });

  return {
    name: mod.name,
    version: mod.version
  };
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
}
