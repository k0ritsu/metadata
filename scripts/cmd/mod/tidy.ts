import assert from 'node:assert/strict';
import { glob, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import semver from 'semver';
import {
  CACHE,
  MODLOCK,
  MODULE,
  MODULES,
  ROOT_NODE
} from './common/constants.ts';
import { createModuleKey } from './common/helpers/key.ts';
import { readModuleManifest } from './common/helpers/manifest.ts';
import {
  createEmptyModlock,
  readModlock,
  resolveModuleRoot,
  writeModlock
} from './common/helpers/modlock.ts';
import { exists, isInsidePath } from './common/helpers/path.ts';
import { createTsconfigs } from './common/helpers/tsconfig.ts';
import type {
  CommandHandler,
  Modlock,
  ModlockNode,
  ModuleManifest
} from './common/types.ts';

interface InstalledModule extends ModuleManifest {
  key: string;
  root: string;
}

interface InstalledModules {
  cacheByKey: Map<string, InstalledModule>;
  cacheByName: Map<string, InstalledModule[]>;
  roots: InstalledModule[];
  rootsByName: Map<string, InstalledModule>;
}

export const tidy: CommandHandler = async () => {
  const [installed, previous] = await Promise.all([
    loadInstalledModules(),
    readPreviousModlock()
  ]);

  const modlock = createEmptyModlock();
  modlock.modules[ROOT_NODE] = {
    dependencies: Object.fromEntries(
      installed.roots.map((mod) => [mod.name, mod.version])
    )
  };

  for (const mod of installed.roots) {
    await addModule(mod, modlock.modules, installed, previous, new Set());
  }

  await writeModlock(modlock);
  await createTsconfigs();
  await cleanCache(modlock);
};

async function addModule(
  mod: InstalledModule,
  modules: Modlock['modules'],
  installed: InstalledModules,
  previous: Modlock,
  stack: Set<string>
) {
  if (modules[mod.key]) {
    return;
  }

  assert(!stack.has(mod.key), `${mod.key}: circular dependency detected`);

  const nextStack = new Set(stack);
  nextStack.add(mod.key);

  const dependencies: ModlockNode['dependencies'] = {};
  for (const [dependency, range] of Object.entries(mod.dependencies ?? {})) {
    const dependencyModule = await resolveDependency(
      installed,
      dependency,
      range
    );

    await addModule(dependencyModule, modules, installed, previous, nextStack);
    dependencies[dependency] = dependencyModule.version;
  }

  modules[mod.key] = {
    dependencies,
    ...copyLockMetadata(previous.modules[mod.key])
  };
}

async function resolveDependency(
  installed: InstalledModules,
  dependency: string,
  range: string
) {
  const root = installed.rootsByName.get(dependency);
  if (root && semver.satisfies(root.version, range)) {
    return root;
  }

  const cached = await loadCachedModulesByName(installed, dependency);
  const version = semver.maxSatisfying(
    cached.map((mod) => mod.version),
    range
  );

  assert(version, `${dependency}@${range}: dependency is not installed`);

  const mod = installed.cacheByKey.get(createModuleKey(dependency, version));
  assert(mod, `${dependency}@${version}: dependency is not installed`);

  return mod;
}

async function loadInstalledModules(): Promise<InstalledModules> {
  const roots = await loadRootModules();

  return {
    cacheByKey: new Map(),
    cacheByName: new Map(),
    roots,
    rootsByName: new Map(roots.map((mod) => [mod.name, mod]))
  };
}

async function loadRootModules() {
  const modules: InstalledModule[] = [];

  for await (const path of glob(resolve(MODULES, '*', MODULE))) {
    const root = dirname(path);
    if (basename(root).startsWith('.')) {
      continue;
    }

    const mod = await readModuleManifest(path, {
      validateDependencyRanges: true
    });

    assert(
      basename(root) === mod.name,
      `${root}: module directory must match module name ${mod.name}`
    );

    modules.push({
      ...mod,
      key: createModuleKey(mod.name, mod.version),
      root
    });
  }

  return modules.sort((left, right) => left.name.localeCompare(right.name));
}

async function loadCachedModulesByName(
  installed: InstalledModules,
  name: string
) {
  const loaded = installed.cacheByName.get(name);
  if (loaded) {
    return loaded;
  }

  const modules: InstalledModule[] = [];
  for await (const path of glob(resolve(CACHE, `${name}@*`, MODULE))) {
    const root = dirname(path);
    const mod = await readModuleManifest(path, {
      validateDependencyRanges: true
    });
    const key = createModuleKey(mod.name, mod.version);

    assert(mod.name === name, `${root}: expected cached module ${name}`);
    assert(
      basename(root) === key,
      `${root}: cache directory must match module key ${key}`
    );

    const installedModule = {
      ...mod,
      key,
      root
    };

    modules.push(installedModule);
    installed.cacheByKey.set(key, installedModule);
  }

  modules.sort((left, right) => semver.rcompare(left.version, right.version));
  installed.cacheByName.set(name, modules);

  return modules;
}

async function readPreviousModlock() {
  if (!(await exists(resolve(MODULES, MODLOCK)))) {
    return createEmptyModlock();
  }

  return readModlock();
}

async function cleanCache(modlock: Modlock) {
  const cacheRoots = new Set(
    Object.keys(modlock.modules)
      .filter((key) => key !== ROOT_NODE)
      .map((key) => resolveModuleRoot(modlock, key))
      .filter((root) => isInsidePath(root, CACHE))
  );
  const removals: Promise<void>[] = [];

  for await (const path of glob(resolve(CACHE, '*', MODULE))) {
    const root = dirname(path);
    if (!cacheRoots.has(root)) {
      removals.push(
        rm(root, {
          force: true,
          recursive: true
        })
      );
    }
  }

  await Promise.all(removals);
}

function copyLockMetadata(node: ModlockNode | undefined) {
  return {
    ...(node?.integrity === undefined ? {} : { integrity: node.integrity }),
    ...(node?.resolved === undefined ? {} : { resolved: node.resolved })
  };
}
