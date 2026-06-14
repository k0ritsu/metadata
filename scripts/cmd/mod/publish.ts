import { readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { CmdError, registerCommand } from '../cmd.ts';
import { MODULE, MODULES, ROOT_NODE } from './common/constants.ts';
import { createGzipTarArchive } from './common/helpers/archive.ts';
import { collectModuleFiles } from './common/helpers/files.ts';
import { createModuleIntegrity } from './common/helpers/integrity.ts';
import { createModuleKey } from './common/helpers/key.ts';
import { assertModuleName, readModuleManifest } from './common/helpers/manifest.ts';
import { haveSameDependencyGraph, readModlock, writeModlock } from './common/helpers/modlock.ts';
import { readModrc } from './common/helpers/modrc.ts';
import { isRecord } from './common/helpers/record.ts';
import { api, resolveRepository } from './common/helpers/repository.ts';
import { withModuleTransaction } from './common/helpers/transaction.ts';
import type { ModuleManifest } from './common/types.ts';
import { createNextModlock } from './tidy.ts';

interface PublishResult extends Pick<ModuleManifest, 'name' | 'description' | 'version'> {
  archiveUrl: string;
  repositoryUrl: string;
}

export const publish = withModuleTransaction('publish', async (args, env) => {
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
  if (!name) {
    throw new CmdError('Module name is required');
  }

  if (positionals.length > 1) {
    throw new CmdError(
      `Unexpected argument '${positionals[1]}'. This command takes exactly one positional argument`
    );
  }

  assertModuleName(name);

  const root = resolve(MODULES, name);

  const manifest = await readModuleManifest(root, {
    validateDependencyRanges: true
  });

  if (manifest.name !== name) {
    throw new CmdError(`${root}: Module directory must match module name ${manifest.name}`);
  }

  await assertPublishPreflight(manifest);

  const modrc = values.repository ? undefined : await readModrc();
  const repository = resolveRepository(values.repository, modrc);
  const archive = await createPublishArchive(root);

  const result = await postPublish(repository, manifest, archive);
  if (result.name !== manifest.name || result.version !== manifest.version) {
    throw new CmdError(
      `Repository returned ${result.name}@${result.version}, expected ${manifest.name}@${manifest.version}`
    );
  }

  try {
    await updateModlock(root, result);
  } catch (error) {
    env.logger.error(
      `Published ${result.name}@${result.version}, but failed to update local modlock`
    );
    env.logger.error(
      `Recovery: manually record ${result.archiveUrl}, or rerun mod publish ${result.name} only if the repository accepts idempotent same-version publishes`
    );

    throw error;
  }

  env.logger.info(`Published ${result.name}@${result.version}`);
  env.logger.info(`Repository: ${result.repositoryUrl}`);
  env.logger.info(`Archive: ${result.archiveUrl}`);
});

registerCommand({
  name: 'publish',
  description: 'Publish one root module to the repository',
  main: publish
});

async function assertPublishPreflight(manifest: ModuleManifest) {
  const modlock = await readModlock();
  const key = createModuleKey(manifest.name, manifest.version);

  const rootVersion = modlock.modules[ROOT_NODE]?.dependencies[manifest.name];
  if (rootVersion !== manifest.version) {
    throw new CmdError(
      `${manifest.name}@${manifest.version}: Module is not installed as a root module`
    );
  }

  if (!modlock.modules[key]) {
    throw new CmdError(`${key}: Module is missing from modlock`);
  }

  const expected = await createNextModlock();
  if (!haveSameDependencyGraph(expected, modlock)) {
    throw new CmdError(
      `Modlock dependency graph is stale; run mod tidy before publishing ${manifest.name}`
    );
  }
}

async function createPublishArchive(root: string) {
  const files = await collectModuleFiles(root);
  if (!files.includes(MODULE)) {
    throw new CmdError(`${root}: ${MODULE} missing`);
  }

  const archiveRoot = basename(root);
  const entries = await Promise.all(
    files.map(async (path) => {
      const absolute = resolve(root, path);
      const [content, stats] = await Promise.all([readFile(absolute), stat(absolute)]);

      return {
        content,
        path: `${archiveRoot}/${path}`,
        mode: stats.mode
      };
    })
  );

  return createGzipTarArchive(entries);
}

async function postPublish(repository: string, manifest: ModuleManifest, archive: Buffer) {
  const result = await api(repository, `modules/${manifest.name}/versions`, {
    body: new Blob([new Uint8Array(archive)], {
      type: 'application/gzip'
    }),
    headers: {
      'content-type': 'application/gzip'
    },
    method: 'POST'
  });

  assertPublishResult(result);

  return result;
}

function assertPublishResult(value: unknown): asserts value is PublishResult {
  if (
    !isRecord(value) ||
    typeof value['name'] !== 'string' ||
    typeof value['description'] !== 'string' ||
    typeof value['version'] !== 'string'
  ) {
    throw new CmdError('Repository returned invalid publish result');
  }

  if (typeof value['archiveUrl'] !== 'string') {
    throw new CmdError('Repository returned invalid archive URL');
  }

  if (typeof value['repositoryUrl'] !== 'string') {
    throw new CmdError('Repository returned invalid repository URL');
  }
}

async function updateModlock(root: string, result: PublishResult) {
  const modlock = await readModlock();

  const key = createModuleKey(result.name, result.version);

  const version = modlock.modules[ROOT_NODE]?.dependencies[result.name];
  if (version !== result.version) {
    throw new CmdError(
      `${result.name}@${result.version}: Module is not installed as a root module`
    );
  }

  const node = modlock.modules[key];
  if (!node) {
    throw new CmdError(`${key}: Module is missing from modlock`);
  }

  node.integrity = await createModuleIntegrity(root);
  node.resolved = result.archiveUrl;

  await writeModlock(modlock);
}
