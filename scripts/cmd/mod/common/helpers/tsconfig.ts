import assert from 'node:assert';
import { glob, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { MODULE, MODULES } from '../constants.ts';
import type { ModManifest } from '../types.ts';
import { readModuleManifestFile } from './manifest.ts';

interface ModRoot {
  name: ModManifest['name'];
  root: string;
}

interface Mod extends ModRoot {
  dependencies: NonNullable<ModManifest['dependencies']>;
}

const TSCONFIG_JSON = 'tsconfig.json';

const TSCONFIG_BASE = resolve('tsconfig.base.json');
const TSCONFIG_BUILD = resolve('tsconfig.build.json');
const TSCONFIG = resolve(TSCONFIG_JSON);

const CORE_ALIASES = {
  '#core/loader': resolve('src', 'loader', 'types.ts'),
  '#core/logger': resolve('src', 'logger', 'types.ts'),
  '#core/router': resolve('src', 'router', 'types.ts'),
  '#core/store': resolve('src', 'store', 'types.ts')
};

export async function createTsconfigs(toUpdate?: ModRoot[]) {
  const modules = await loadModules();
  await Promise.all([
    ...getUpdatedModules(modules, toUpdate).map((mod) => {
      return writeFile(
        resolve(mod.root, TSCONFIG_JSON),
        JSON.stringify(createModuleTsconfig(mod, modules), undefined, 2)
      );
    }),
    writeFile(
      TSCONFIG_BUILD,
      JSON.stringify(createBuildTsconfig(modules), undefined, 2)
    ),
    removeStaleModuleTsconfigs(modules)
  ]);
}

async function loadModules() {
  const modules: Mod[] = [];

  for await (const path of glob(resolve(MODULES, '**', MODULE))) {
    const mod = await readModuleManifestFile(path, {
      validateDependencyRanges: true
    });

    const root = dirname(path);
    modules.push({
      name: mod.name,
      root,
      dependencies: mod.dependencies ?? {}
    });
  }

  return modules.sort((left, right) => left.root.localeCompare(right.root));
}

function createModuleTsconfig(mod: Mod, modules: Mod[]) {
  const paths = Object.fromEntries(
    Object.entries(CORE_ALIASES).map(([alias, path]) => [
      alias,
      [toTsconfigPath(mod.root, path)]
    ])
  );

  const references = new Map<
    string,
    {
      path: string;
    }
  >([
    [
      TSCONFIG,
      {
        path: toTsconfigPath(mod.root, TSCONFIG)
      }
    ]
  ]);

  for (const dependencyName of Object.keys(mod.dependencies)) {
    const dependencyRoots = createDependencyCandidates(
      mod.root,
      dependencyName
    ).filter((root) => modules.some((module) => module.root === root));

    if (dependencyRoots.length === 0) {
      continue;
    }

    const dependencyPaths = dependencyRoots.map((root) =>
      toTsconfigPath(mod.root, root)
    );

    paths[`#modules/${dependencyName}`] = dependencyPaths;
    paths[`#modules/${dependencyName}/*`] = dependencyPaths.map((path) => {
      return `${path}/*`;
    });

    for (const root of dependencyRoots) {
      references.set(root, {
        path: toTsconfigProjectPath(mod.root, root)
      });
    }
  }

  const dist = resolve('dist', 'modules');

  return {
    compilerOptions: {
      outDir: toTsconfigPath(
        mod.root,
        resolve(dist, relative(MODULES, mod.root))
      ),
      paths,
      rootDir: '.',
      tsBuildInfoFile: toTsconfigPath(
        mod.root,
        resolve(dist, relative(MODULES, mod.root), 'tsconfig.tsbuildinfo')
      )
    },
    exclude: ['modules/**'],
    extends: toTsconfigPath(mod.root, TSCONFIG_BASE),
    include: ['src/**/*.ts'],
    references: Array.from(references.values())
  };
}

function createBuildTsconfig(modules: Mod[]) {
  const root = resolve('.');

  return {
    files: [],
    references: [
      {
        path: toTsconfigPath(root, TSCONFIG)
      },
      ...modules.map((mod) => ({
        path: toTsconfigProjectPath(root, mod.root)
      }))
    ]
  };
}

function getUpdatedModules(modules: Mod[], roots?: ModRoot[]) {
  if (!roots) {
    return modules;
  }

  const dict = new Map(modules.map((mod) => [mod.root, mod]));

  return roots.map((root) => {
    const key = resolve(root.root);
    const mod = dict.get(key);

    assert(mod, `${root.name}: module is not found`);

    return mod;
  });
}

function toTsconfigProjectPath(from: string, root: string) {
  return toTsconfigPath(from, resolve(root, TSCONFIG_JSON));
}

function toTsconfigPath(from: string, to: string) {
  const path = relative(from, to).split(sep).join('/');
  if (!path) {
    return '.';
  }

  if (path.startsWith('.')) {
    return path;
  }

  return `./${path}`;
}

async function removeStaleModuleTsconfigs(modules: Mod[]) {
  const root = new Set(modules.map((mod) => mod.root));
  for await (const path of glob(resolve(MODULES, '**', TSCONFIG_JSON))) {
    if (!root.has(dirname(path))) {
      await rm(path);
    }
  }
}

export function createDependencyCandidates(
  parentRoot: string,
  dependency: string
) {
  const levels = getModuleLevels(parentRoot);
  const candidates: string[] = [];

  for (let depth = levels.length; depth > 0; depth -= 1) {
    const [root, ...nested] = levels.slice(0, depth);
    if (!root) {
      continue;
    }

    candidates.push(
      join(
        MODULES,
        root,
        ...nested.flatMap((module) => ['modules', module]),
        'modules',
        dependency
      )
    );
  }

  candidates.push(join(MODULES, dependency));

  return candidates;
}

function getModuleLevels(path: string) {
  const relativePath = relative(MODULES, path);

  if (
    !relativePath ||
    relativePath.startsWith('..') ||
    isAbsolute(relativePath)
  ) {
    return [];
  }

  const segments = relativePath.split(sep).filter(Boolean);
  const [root] = segments;

  if (!root || root.includes('.')) {
    return [];
  }

  const levels = [root];
  let index = 1;

  while (index + 1 < segments.length && segments[index] === 'modules') {
    const nested = segments[index + 1];

    if (!nested) {
      break;
    }

    levels.push(nested);
    index += 2;
  }

  return levels;
}
