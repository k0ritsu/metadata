import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { CmdError, registerCommand } from '../cmd.ts';
import { CACHE, MODULES, ROOT_NODE } from './common/constants.ts';
import { createModuleIntegrity } from './common/helpers/integrity.ts';
import { createModuleKey } from './common/helpers/key.ts';
import { assertModuleName } from './common/helpers/manifest.ts';
import { readModlock } from './common/helpers/modlock.ts';
import { createTemporarySibling, exists, replacePathAtomically } from './common/helpers/path.ts';
import { withModuleTransaction } from './common/helpers/transaction.ts';
import type { Modlock } from './common/types.ts';
import { tidyWorkspace } from './tidy.ts';

interface RemovePlan {
  cache: string;
  integrity?: string;
  key: string;
  preserveInCache: boolean;
  root: string;
}

registerCommand({
  name: 'remove',
  description: 'Remove root modules from the workspace',
  main: withModuleTransaction('remove', async (args) => {
    const { positionals } = parseArgs({
      strict: true,
      allowPositionals: true,
      args
    });

    if (positionals.length === 0) {
      throw new CmdError('Module name is required');
    }

    for (const name of positionals) {
      assertModuleName(name);
    }

    const modlock = await readModlock();

    const names = new Set(positionals);
    const dependencies = modlock.modules[ROOT_NODE]?.dependencies ?? {};

    await mkdir(CACHE, {
      recursive: true
    });

    const plans = await createRemovePlans(names, dependencies, modlock);
    await executeRemovePlans(plans);

    await tidyWorkspace();
  })
});

async function createRemovePlans(
  names: Set<string>,
  dependencies: Record<string, string>,
  modlock: Modlock
) {
  const plans: RemovePlan[] = [];

  for (const name of names) {
    const version = dependencies[name];
    if (!version) {
      throw new CmdError(`${name}: Module is not installed at root level`);
    }

    const key = createModuleKey(name, version);
    const node = modlock.modules[key];
    const plan = {
      cache: resolve(CACHE, key),
      integrity: node?.integrity,
      key,
      preserveInCache: isReachableAfterRemoval(key, names, modlock),
      root: resolve(MODULES, name)
    } satisfies RemovePlan;

    if (await exists(plan.root)) {
      await assertRootCanBeRemoved({
        cache: plan.cache,
        key: plan.key,
        modlock,
        preserveInCache: plan.preserveInCache,
        root: plan.root
      });
    }

    plans.push(plan);
  }

  return plans;
}

async function executeRemovePlans(plans: RemovePlan[]) {
  for (const plan of plans) {
    if (!(await exists(plan.root))) {
      continue;
    }

    if (plan.preserveInCache) {
      await preserveCacheArtifact(plan);
    }

    await rm(plan.root, {
      force: true,
      recursive: true
    });
  }
}

async function preserveCacheArtifact(plan: RemovePlan) {
  if (!plan.integrity) {
    throw new CmdError(`${plan.key}: Root module is still used and has no locked integrity`);
  }

  if (await exists(plan.cache)) {
    const actual = await createModuleIntegrity(plan.cache);
    if (actual === plan.integrity) {
      return;
    }
  }

  const stage = await createTemporarySibling(plan.cache);
  try {
    await cp(plan.root, stage, {
      recursive: true
    });

    const stagedIntegrity = await createModuleIntegrity(stage);
    if (stagedIntegrity !== plan.integrity) {
      throw new CmdError(`${plan.key}: Copied cache artifact failed integrity verification`);
    }

    await replacePathAtomically(plan.cache, stage);

    const actual = await createModuleIntegrity(plan.cache);
    if (actual !== plan.integrity) {
      throw new CmdError(
        `${plan.key}: Cache artifact failed integrity verification after replacement`
      );
    }
  } catch (error) {
    await rm(stage, {
      force: true,
      recursive: true
    });

    throw error;
  }
}

async function assertRootCanBeRemoved(options: {
  cache: string;
  key: string;
  modlock: Modlock;
  preserveInCache: boolean;
  root: string;
}) {
  const node = options.modlock.modules[options.key];

  if (!options.preserveInCache) {
    return;
  }

  if (!node?.integrity) {
    throw new CmdError(`${options.key}: Root module is still used and has no locked integrity`);
  }

  const actual = await createModuleIntegrity(options.root);
  if (actual !== node.integrity) {
    throw new CmdError(
      `${options.key}: Root module has local changes; publish, reinstall, or manually resolve it before removing`
    );
  }
}

function isReachableAfterRemoval(key: string, removed: Set<string>, modlock: Modlock) {
  const rootDependencies = modlock.modules[ROOT_NODE]?.dependencies ?? {};
  const stack = Object.entries(rootDependencies)
    .filter(([name]) => !removed.has(name))
    .map(([name, version]) => createModuleKey(name, version));

  const seen = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current)) {
      continue;
    }

    if (current === key) {
      return true;
    }

    seen.add(current);

    const node = modlock.modules[current];
    if (!node) {
      continue;
    }

    for (const [name, version] of Object.entries(node.dependencies)) {
      stack.push(createModuleKey(name, version));
    }
  }

  return false;
}
