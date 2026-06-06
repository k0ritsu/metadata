import assert from 'node:assert/strict';
import { glob, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import semver from 'semver';
import { CACHE, MODULE, MODULES, ROOT_NODE } from './common/constants.ts';
import { createModuleKey } from './common/helpers/key.ts';
import { readModuleManifest } from './common/helpers/manifest.ts';
import {
  copyModuleMetadata,
  createEmptyModlock,
  readOrCreateModlock,
  resolveModuleRoot,
  writeModlock
} from './common/helpers/modlock.ts';
import { isInsidePath } from './common/helpers/path.ts';
import { createTsconfigs } from './common/helpers/tsconfig.ts';
import type {
  CommandHandler,
  Modlock,
  ModlockNode,
  ModuleManifest
} from './common/types.ts';

interface ModuleDescriptor extends ModuleManifest {
  key: string;
  root: string;
}

interface ModuleRegistry {
  roots: ModuleDescriptor[];
  rootsByName: Map<string, ModuleDescriptor>;
  cacheByKey: Map<string, ModuleDescriptor>;
  cacheByName: Map<string, ModuleDescriptor[]>;
}

export const tidy: CommandHandler = async () => {
  const [registry, existing] = await Promise.all([
    loadModuleRegistry(),
    readOrCreateModlock()
  ]);

  const modlock = createEmptyModlock();
  modlock.modules[ROOT_NODE] = {
    dependencies: Object.fromEntries(
      registry.roots.map((mod) => [mod.name, mod.version])
    )
  };

  for (const manifest of registry.roots) {
    await resolveModule(manifest, registry, modlock, existing, new Set());
  }

  await writeModlock(modlock);
  await createTsconfigs();
  await cleanCache(modlock);
};

async function loadModuleRegistry(): Promise<ModuleRegistry> {
  const roots = await loadRootModules();

  return {
    roots,
    rootsByName: new Map(roots.map((mod) => [mod.name, mod])),
    cacheByKey: new Map(),
    cacheByName: new Map()
  };
}

async function loadRootModules(): Promise<ModuleDescriptor[]> {
  const roots: ModuleDescriptor[] = [];

  for await (const path of glob(resolve(MODULES, '*', MODULE))) {
    if (isInsidePath(path, CACHE)) {
      continue;
    }

    const root = dirname(path);

    const manifest = await readModuleManifest(path, {
      validateDependencyRanges: true
    });

    assert(
      basename(root) === manifest.name,
      `${root}: module directory must match module name ${manifest.name}`
    );

    roots.push({
      ...manifest,
      key: createModuleKey(manifest.name, manifest.version),
      root
    });
  }

  return roots;
}

async function resolveModule(
  manifest: ModuleDescriptor,
  registry: ModuleRegistry,
  modlock: Modlock,
  existing: Modlock,
  stack: Set<string>
): Promise<void> {
  if (modlock.modules[manifest.key]) {
    return;
  }

  assert(
    !stack.has(manifest.key),
    `${manifest.key}: circular dependency detected`
  );

  const nextStack = new Set(stack);
  nextStack.add(manifest.key);

  const dependencies: ModlockNode['dependencies'] = {};
  if (manifest.dependencies) {
    for (const [dependency, range] of Object.entries(manifest.dependencies)) {
      const manifest = await resolveDependency(dependency, range, registry);

      await resolveModule(manifest, registry, modlock, existing, nextStack);
      dependencies[dependency] = manifest.version;
    }
  }

  modlock.modules[manifest.key] = {
    dependencies,
    ...copyModuleMetadata(existing.modules[manifest.key])
  };
}

async function resolveDependency(
  dependency: string,
  range: string,
  registry: ModuleRegistry
): Promise<ModuleDescriptor> {
  const root = registry.rootsByName.get(dependency);
  if (root && semver.satisfies(root.version, range)) {
    return root;
  }

  const cached = await loadCachedModulesByName(dependency, registry);

  const versions = cached.map((mod) => mod.version);

  const version = semver.maxSatisfying(versions, range);
  assert(version, `${dependency}@${range}: dependency is not installed`);

  const key = createModuleKey(dependency, version);

  const manifest = registry.cacheByKey.get(key);
  assert(manifest, `${dependency}@${version}: dependency is not installed`);

  return manifest;
}

async function loadCachedModulesByName(
  dependency: string,
  registry: ModuleRegistry
): Promise<ModuleDescriptor[]> {
  const cached = registry.cacheByName.get(dependency);
  if (cached) {
    return cached;
  }

  const roots: ModuleDescriptor[] = [];

  for await (const path of glob(resolve(CACHE, `${dependency}@*`, MODULE))) {
    const root = dirname(path);

    const manifest = await readModuleManifest(path, {
      validateDependencyRanges: true
    });

    const key = createModuleKey(manifest.name, manifest.version);
    assert(
      basename(root) === key,
      `${root}: directory must match module key ${key}`
    );

    const module = {
      ...manifest,
      key,
      root
    };

    roots.push(module);
    registry.cacheByKey.set(key, module);
  }

  registry.cacheByName.set(dependency, roots);

  return roots;
}

async function cleanCache(modlock: Modlock): Promise<void> {
  const roots = new Set(
    Object.keys(modlock.modules)
      .filter((key) => key !== ROOT_NODE)
      .map((key) => resolveModuleRoot(key, modlock))
  );

  const promises: Promise<void>[] = [];

  for await (const path of glob(resolve(CACHE, '*', MODULE))) {
    const root = dirname(path);
    if (!roots.has(root)) {
      promises.push(
        rm(root, {
          force: true,
          recursive: true
        })
      );
    }
  }

  await Promise.all(promises);
}
