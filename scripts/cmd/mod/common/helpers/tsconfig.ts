import assert from 'node:assert';
import { glob, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { MODULE } from '../constants.ts';
import type { Mod } from '../types.ts';

interface ModRoot {
  root: string;
  name: Mod['name'];
}

interface ModDeps extends ModRoot {
  dependencies: Mod['dependencies'];
}

const MODULES = resolve('src', 'modules');

const TSCONFIG = 'tsconfig.json';
const BASE_TSCONFIG = resolve('tsconfig.base.json');
const ROOT_TSCONFIG = resolve(TSCONFIG);

const CORE_ALIASES = {
  '#core/loader': resolve('src', 'loader', 'types.ts'),
  '#core/logger': resolve('src', 'logger', 'types.ts'),
  '#core/router': resolve('src', 'router', 'types.ts'),
  '#core/store': resolve('src', 'store', 'types.ts')
};

export async function createTsconfigs(toUpdate?: ModRoot[]) {
  const modules = await loadModules();
  await Promise.all([
    ...getUpdatedModules(modules, toUpdate).map((mod) =>
      writeFile(
        resolve(mod.root, TSCONFIG),
        JSON.stringify(createModuleTsconfig(mod, modules), undefined, 2)
      )
    ),
    writeFile(
      resolve('tsconfig.build.json'),
      JSON.stringify(createBuildTsconfig(modules), undefined, 2)
    ),
    removeStaleModuleTsconfigs(modules)
  ]);
}

async function loadModules() {
  const modules: ModDeps[] = [];

  for await (const path of glob(resolve(MODULES, '**', MODULE))) {
    const mod: Partial<Mod> = JSON.parse(
      await readFile(path, {
        encoding: 'utf8'
      })
    );

    assert(mod.name, `${path}: name is required`);

    const root = dirname(path);
    modules.push({
      root,
      dependencies: mod.dependencies ?? {},
      name: mod.name
    });
  }

  return modules.sort((left, right) => left.root.localeCompare(right.root));
}

function createModuleTsconfig(mod: ModDeps, modules: ModDeps[]) {
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
      ROOT_TSCONFIG,
      {
        path: toTsconfigPath(mod.root, ROOT_TSCONFIG)
      }
    ]
  ]);

  const dependencyNames = getDependencyNames(mod, modules);
  for (const dependencyName of dependencyNames) {
    const dependencyRoots = createDependencyCandidates(
      dependencyName,
      mod.root
    ).filter((root) => modules.some((module) => module.root === root));

    if (dependencyRoots.length === 0) {
      continue;
    }

    const dependencyPaths = dependencyRoots.map((root) =>
      toTsconfigPath(mod.root, root)
    );

    paths[`#modules/${dependencyName}`] = dependencyPaths;
    paths[`#modules/${dependencyName}/*`] = dependencyPaths.map(
      (path) => `${path}/*`
    );

    for (const root of dependencyRoots) {
      references.set(root, {
        path: toTsconfigProjectPath(mod.root, root)
      });
    }
  }

  const dist = resolve('dist', 'modules');

  return {
    extends: toTsconfigPath(mod.root, BASE_TSCONFIG),
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
    references: Array.from(references.values()),
    include: ['src/**/*.ts'],
    exclude: ['modules/**']
  };
}

function createBuildTsconfig(modules: ModDeps[]) {
  const root = resolve('.');

  return {
    files: [],
    references: [
      {
        path: toTsconfigPath(root, ROOT_TSCONFIG)
      },
      ...modules.map((mod) => ({
        path: toTsconfigProjectPath(root, mod.root)
      }))
    ]
  };
}

function getUpdatedModules(modules: ModDeps[], roots?: ModRoot[]) {
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

function getDependencyNames(mod: ModDeps, modules: ModDeps[]) {
  const names = new Set<string>(Object.keys(mod.dependencies));
  for (const mod of modules) {
    if (dirname(dirname(mod.root)) === mod.root) {
      names.add(mod.name);
    }
  }

  return Array.from(names);
}

function createDependencyCandidates(dependency: string, path: string) {
  const levels = getModuleLevels(path);
  const candidates: string[] = [];

  for (let depth = levels.length; depth > 0; depth--) {
    const current = levels.slice(0, depth);

    const [root, ...nested] = current;
    if (!root) {
      continue;
    }

    const moduleRoot = join(
      MODULES,
      root,
      ...nested.flatMap((module) => ['modules', module])
    );

    candidates.push(join(moduleRoot, 'modules', dependency));
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

function toTsconfigProjectPath(from: string, root: string) {
  return toTsconfigPath(from, resolve(root, TSCONFIG));
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

async function removeStaleModuleTsconfigs(modules: ModDeps[]) {
  const root = new Set(modules.map((mod) => mod.root));
  for await (const path of glob(resolve(MODULES, '**', 'tsconfig.json'))) {
    if (!root.has(dirname(path))) {
      await rm(path);
    }
  }
}
