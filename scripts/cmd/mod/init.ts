import assert from 'node:assert';
import { glob, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import semver from 'semver';
import { MODLOCK, MODRC, MODULE, MODULES } from './common/constants.ts';
import {
  assertDependencies,
  readModuleManifestFile
} from './common/helpers/manifest.ts';
import { exists } from './common/helpers/path.ts';
import { isRecord } from './common/helpers/record.ts';
import {
  createDependencyCandidates,
  createTsconfigs
} from './common/helpers/tsconfig.ts';
import type {
  Modlock,
  ModlockNode,
  ModManifest,
  Modrc
} from './common/types.ts';

interface ResolvedModManifest extends ModManifest {
  dependencies: NonNullable<ModManifest['dependencies']>;
  root: string;
}

export async function init(args: string[]) {
  const { values } = parseArgs({
    strict: true,
    options: {
      repository: {
        type: 'string'
      }
    },
    args
  });

  const modlock = await buildModlock();
  await Promise.all([
    writeModrc(values.repository),
    writeFile(resolve(MODULES, MODLOCK), JSON.stringify(modlock, undefined, 2)),
    createTsconfigs()
  ]);
}

async function writeModrc(repository?: string) {
  const path = resolve(MODULES, MODRC);
  if (await exists(path)) {
    const modrc: unknown = JSON.parse(
      await readFile(path, {
        encoding: 'utf8'
      })
    );

    assert(isRecord(modrc), `${path}: ${MODRC} must be an object`);

    const currentRepository =
      typeof modrc['repository'] === 'string'
        ? modrc['repository']
        : typeof modrc['registry'] === 'string'
          ? modrc['registry']
          : undefined;
    const nextRepository = repository ?? currentRepository;

    assert(nextRepository, `${path}: repository is required`);

    if (
      modrc['repository'] === nextRepository &&
      modrc['registry'] === undefined
    ) {
      return;
    }

    return writeFile(
      path,
      JSON.stringify(
        {
          repository: nextRepository
        } satisfies Modrc,
        undefined,
        2
      )
    );
  }

  assert(repository, 'repository is required');

  return writeFile(
    path,
    JSON.stringify(
      {
        repository
      } satisfies Modrc,
      undefined,
      2
    )
  );
}

async function buildModlock() {
  const modules = await loadModules();
  const modulesByRoot = new Map(modules.map((mod) => [mod.root, mod]));
  const modlock: Modlock = {};

  for (const mod of modules.filter((mod) => isTopLevelModuleRoot(mod.root))) {
    modlock[mod.name] = buildModlockNode(mod, modulesByRoot, new Set<string>());
  }

  return modlock;
}

async function loadModules() {
  const modules: ResolvedModManifest[] = [];

  for await (const path of glob(resolve(MODULES, '**', MODULE))) {
    const mod = await readModuleManifestFile(path, {
      validateDependencyRanges: true
    });

    modules.push({
      ...mod,
      dependencies: ensureDependencies(mod.dependencies),
      root: dirname(path)
    });
  }

  return modules.sort((left, right) => left.root.localeCompare(right.root));
}

function ensureDependencies(dependencies: ModManifest['dependencies'] = {}) {
  assertDependencies(dependencies, {
    validateVersionRanges: true
  });

  return dependencies;
}

function buildModlockNode(
  mod: ResolvedModManifest,
  modulesByRoot: Map<string, ResolvedModManifest>,
  stack: Set<string>
): ModlockNode {
  const dependencies: Modlock = {};

  const nextStack = new Set<string>(stack);
  nextStack.add(mod.root);

  for (const [name, version] of Object.entries(mod.dependencies)) {
    const dependency = resolveDependency(mod, name, version, modulesByRoot);
    if (nextStack.has(dependency.root)) {
      dependencies[name] = {
        dependencies: {},
        name: dependency.name,
        version: dependency.version
      };

      continue;
    }

    dependencies[name] = buildModlockNode(dependency, modulesByRoot, nextStack);
  }

  return {
    dependencies,
    name: mod.name,
    version: mod.version
  };
}

function resolveDependency(
  mod: ResolvedModManifest,
  name: string,
  range: string,
  modulesByRoot: Map<string, ResolvedModManifest>
) {
  for (const root of createDependencyCandidates(mod.root, name)) {
    const candidate = modulesByRoot.get(root);
    if (candidate && semver.satisfies(candidate.version, range)) {
      return candidate;
    }
  }

  assert.fail(`${mod.name}: dependency ${name}@${range} is not installed`);
}

function isTopLevelModuleRoot(root: string) {
  const relativePath = relative(MODULES, root);

  return (
    Boolean(relativePath) &&
    !relativePath.startsWith('..') &&
    !isAbsolute(relativePath) &&
    relativePath.split(sep).filter(Boolean).length === 1
  );
}
