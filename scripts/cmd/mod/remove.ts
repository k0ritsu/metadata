import assert from 'node:assert';
import { glob, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MODLOCK, MODULE, MODULES } from './common/constants.ts';
import { createKey, type Key } from './common/helpers/key.ts';
import { assertModuleName } from './common/helpers/manifest.ts';
import { readModlock } from './common/helpers/modlock.ts';
import { exists } from './common/helpers/path.ts';
import { createTsconfigs } from './common/helpers/tsconfig.ts';
import type { Modlock, ModlockNode } from './common/types.ts';

interface PlacedNode {
  key: Key;
  node: ModlockNode;
  path: string;
}

export async function remove(args: string[]) {
  const { positionals } = parseArgs({
    strict: true,
    allowPositionals: true,
    args
  });

  assert(positionals.length > 0, 'module name is required');

  for (const name of positionals) {
    assertModuleName(name);
  }

  const names = new Set(positionals);
  const modlock = await readModlock();

  for (const name of names) {
    assert(
      Object.hasOwn(modlock, name),
      `${name}: module is not installed at root level`
    );
  }

  const nextModlock = createNextModlock(modlock, names);

  await syncModules(modlock, nextModlock);
  await writeFile(
    resolve(MODULES, MODLOCK),
    JSON.stringify(nextModlock, undefined, 2)
  );
  await createTsconfigs();
}

function createNextModlock(modlock: Modlock, removed: Set<string>) {
  const rootNodes = Object.values(modlock).filter(
    (node) => !removed.has(node.name)
  );
  const rootVersions = new Map(rootNodes.map((node) => [node.name, node]));
  const dependencyVersions = collectDependencyVersions(rootNodes);
  const hoisted = new Map<string, ModlockNode>();

  for (const [name, versions] of dependencyVersions) {
    if (removed.has(name) || rootVersions.has(name) || versions.size !== 1) {
      continue;
    }

    const [node] = versions.values();
    if (node) {
      hoisted.set(name, node);
    }
  }

  const roots = new Map<string, ModlockNode>([...rootVersions, ...hoisted]);
  const nextModlock: Modlock = {};

  for (const node of roots.values()) {
    nextModlock[node.name] = createPlacedNode(node, new Set<Key>());
  }

  return nextModlock;
}

function collectDependencyVersions(nodes: ModlockNode[]) {
  const versions = new Map<string, Map<Key, ModlockNode>>();

  for (const node of nodes) {
    collectNodeDependencyVersions(node, versions, new Set<Key>());
  }

  return versions;
}

function collectNodeDependencyVersions(
  node: ModlockNode,
  versions: Map<string, Map<Key, ModlockNode>>,
  stack: Set<Key>
) {
  const key = createKey(node);
  if (stack.has(key)) {
    return;
  }

  const nextStack = new Set<Key>(stack);
  nextStack.add(key);

  for (const dependency of Object.values(node.dependencies)) {
    const dependencyKey = createKey(dependency);
    let dependencyVersions = versions.get(dependency.name);

    if (!dependencyVersions) {
      dependencyVersions = new Map<Key, ModlockNode>();
      versions.set(dependency.name, dependencyVersions);
    }

    dependencyVersions.set(dependencyKey, dependency);
    collectNodeDependencyVersions(dependency, versions, nextStack);
  }
}

function createPlacedNode(
  node: ModlockNode,
  stack: Set<Key>
): ModlockNode {
  const key = createKey(node);
  const dependencies: Modlock = {};
  const nextStack = new Set<Key>(stack);
  nextStack.add(key);

  for (const dependency of Object.values(node.dependencies)) {
    const dependencyKey = createKey(dependency);
    dependencies[dependency.name] = stack.has(dependencyKey)
      ? {
          dependencies: {},
          name: dependency.name,
          version: dependency.version
        }
      : createPlacedNode(dependency, nextStack);
  }

  return {
    dependencies,
    name: node.name,
    version: node.version
  };
}

async function syncModules(modlock: Modlock, nextModlock: Modlock) {
  const currentModules = await loadCurrentModules();
  const currentModulesByPath = new Map(
    currentModules.map((module) => [module.path, module])
  );
  const currentModulePathsByKey = new Map<Key, string[]>();

  for (const module of currentModules) {
    const paths = currentModulePathsByKey.get(module.key) ?? [];
    paths.push(module.path);
    currentModulePathsByKey.set(module.key, paths);
  }

  const oldPlacements = flattenModlock(modlock);
  const nextPlacements = flattenModlock(nextModlock);
  const usedSources = new Set<string>();
  const assignedSources = new Set<string>();
  const nextPaths = new Set(nextPlacements.map((placement) => placement.path));
  const moves: Array<{
    from: string;
    to: string;
  }> = [];

  for (const placement of nextPlacements) {
    const current = currentModulesByPath.get(placement.path);

    if (current?.key === placement.key) {
      usedSources.add(placement.path);
      assignedSources.add(placement.path);
      continue;
    }

    const source = currentModulePathsByKey
      .get(placement.key)
      ?.find((path) => !usedSources.has(path));

    if (source) {
      usedSources.add(source);
      assignedSources.add(source);
      moves.push({
        from: source,
        to: placement.path
      });
    }
  }

  const temporaryRoot = resolve(MODULES, `.remove-${Date.now()}`);
  const temporaryMoves = await stageMoves(temporaryRoot, moves);

  await removeStaleModules(oldPlacements, nextPaths, assignedSources);
  await removeConflictingModules(nextPlacements, currentModulesByPath);

  for (const move of temporaryMoves) {
    await mkdir(dirname(move.to), {
      recursive: true
    });
    await rename(move.from, move.to);
  }

  if (temporaryMoves.length > 0) {
    await rm(temporaryRoot, {
      force: true,
      recursive: true
    });
  }
}

async function loadCurrentModules() {
  const modules: PlacedNode[] = [];

  for await (const path of glob(resolve(MODULES, '**', MODULE))) {
    const node: Pick<ModlockNode, 'name' | 'version'> = JSON.parse(
      await readFile(path, {
        encoding: 'utf8'
      })
    );

    if (!node.name || !node.version) {
      continue;
    }

    modules.push({
      key: createKey(node),
      node: {
        dependencies: {},
        name: node.name,
        version: node.version
      },
      path: dirname(path)
    });
  }

  return modules;
}

async function stageMoves(
  temporaryRoot: string,
  moves: Array<{
    from: string;
    to: string;
  }>
) {
  const temporaryMoves: typeof moves = [];

  for (const [index, move] of moves.entries()) {
    if (move.from === move.to || !(await exists(move.from))) {
      continue;
    }

    const staged = resolve(temporaryRoot, String(index));

    await mkdir(dirname(staged), {
      recursive: true
    });
    await rename(move.from, staged);

    temporaryMoves.push({
      from: staged,
      to: move.to
    });
  }

  return temporaryMoves;
}

async function removeStaleModules(
  oldPlacements: PlacedNode[],
  nextPaths: Set<string>,
  assignedSources: Set<string>
) {
  const stalePaths = oldPlacements
    .map((placement) => placement.path)
    .filter((path) => !nextPaths.has(path) && !assignedSources.has(path))
    .sort((left, right) => right.length - left.length);

  for (const path of stalePaths) {
    await rm(path, {
      force: true,
      recursive: true
    });
  }
}

async function removeConflictingModules(
  placements: PlacedNode[],
  currentModulesByPath: Map<string, PlacedNode>
) {
  for (const placement of placements) {
    const current = currentModulesByPath.get(placement.path);
    if (current && current.key !== placement.key) {
      await rm(placement.path, {
        force: true,
        recursive: true
      });
    }
  }
}

function flattenModlock(modlock: Modlock, root = MODULES) {
  const placements: PlacedNode[] = [];

  for (const node of Object.values(modlock)) {
    const path = join(root, node.name);

    placements.push({
      key: createKey(node),
      node,
      path
    });
    placements.push(
      ...flattenModlock(node.dependencies, join(path, 'modules'))
    );
  }

  return placements;
}
