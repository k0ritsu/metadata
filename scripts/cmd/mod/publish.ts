import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MODULE, MODULES, ROOT_NODE } from './common/constants.ts';
import { createGzipTarArchive } from './common/helpers/archive.ts';
import { collectModuleFiles } from './common/helpers/files.ts';
import { createModuleIntegrity } from './common/helpers/integrity.ts';
import { createModuleKey } from './common/helpers/key.ts';
import {
  assertModuleName,
  readModuleManifest
} from './common/helpers/manifest.ts';
import { readModlock, writeModlock } from './common/helpers/modlock.ts';
import { isRecord } from './common/helpers/record.ts';
import {
  fetchRepository,
  resolveRepository
} from './common/helpers/repository.ts';
import type { CommandHandler, ModuleManifest } from './common/types.ts';

interface PublishResult extends Pick<
  ModuleManifest,
  'name' | 'description' | 'version'
> {
  archiveUrl: string;
  repositoryUrl: string;
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

  const [name] = positionals;
  assert(positionals.length === 1 && name, 'module name is required');

  assertModuleName(name);

  const root = resolve(MODULES, name);

  const manifest = await readModuleManifest(root, {
    validateDependencyRanges: true
  });

  assert(
    manifest.name === name,
    `${root}: module directory must match module name ${manifest.name}`
  );

  const [archive, repository] = await Promise.all([
    createPublishArchive(root),
    resolveRepository(values.repository)
  ]);

  const result = await postPublish(repository, manifest, archive);
  assert(
    result.name === manifest.name && result.version === manifest.version,
    `repository returned ${result.name}@${result.version}, expected ${manifest.name}@${manifest.version}`
  );

  await updateModlock(root, result);

  console.log(`Published ${result.name}@${result.version}`);
  console.log(`Repository: ${result.repositoryUrl}`);
  console.log(`Archive: ${result.archiveUrl}`);
};

async function createPublishArchive(root: string) {
  const files = await collectModuleFiles(root);
  assert(files.includes(MODULE), `${root}: ${MODULE} missing`);

  const entries = await Promise.all(
    files.map(async (path) => {
      const absolute = resolve(root, path);
      const [content, stats] = await Promise.all([
        readFile(absolute),
        stat(absolute)
      ]);

      return {
        content,
        path,
        mode: stats.mode
      };
    })
  );

  return createGzipTarArchive(entries);
}

async function postPublish(
  repository: string,
  manifest: ModuleManifest,
  archive: Buffer
) {
  const result = await fetchRepository(
    repository,
    `modules/${manifest.name}/versions`,
    {
      body: new Blob([new Uint8Array(archive)], {
        type: 'application/gzip'
      }),
      headers: {
        'content-type': 'application/gzip'
      },
      method: 'POST'
    }
  );

  assertPublishResult(result);

  return result;
}

function assertPublishResult(value: unknown): asserts value is PublishResult {
  assert(
    isRecord(value) &&
      typeof value['name'] === 'string' &&
      typeof value['description'] === 'string' &&
      typeof value['version'] === 'string',
    'repository returned invalid publish result'
  );

  assert(
    typeof value['archiveUrl'] === 'string',
    'repository returned invalid archive URL'
  );

  assert(
    typeof value['repositoryUrl'] === 'string',
    'repository returned invalid repository URL'
  );
}

async function updateModlock(root: string, result: PublishResult) {
  const modlock = await readModlock();

  const key = createModuleKey(result.name, result.version);

  const version = modlock.modules[ROOT_NODE]?.dependencies[result.name];
  assert(
    version === result.version,
    `${result.name}@${result.version}: module is not installed as a root module`
  );

  const node = modlock.modules[key];
  assert(node, `${key}: module is missing from modlock`);

  node.integrity = await createModuleIntegrity(root);
  node.resolved = result.archiveUrl;

  await writeModlock(modlock);
}
