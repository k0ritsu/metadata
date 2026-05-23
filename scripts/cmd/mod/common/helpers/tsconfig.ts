import assert from 'node:assert';
import { glob, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { MODULE, MODULES } from '../constants.ts';
import type { ModuleManifest } from '../types.ts';
import { readModuleManifest } from './manifest.ts';
import {
  createDependencyCandidates,
  type ResolvedModule
} from './resolution.ts';

interface ModuleRoot {
  name: ModuleManifest['name'];
  root: string;
}

const TSCONFIG_PROJECT = 'tsconfig.json';

const TSCONFIG_BASE = resolve('tsconfig.base.json');
const TSCONFIG_BUILD = resolve('tsconfig.build.json');
const TSCONFIG = resolve(TSCONFIG_PROJECT);

const CORE_ALIASES = {
  '#core/loader': resolve('src', 'loader', 'types.ts'),
  '#core/logger': resolve('src', 'logger', 'types.ts'),
  '#core/router': resolve('src', 'router', 'types.ts'),
  '#core/store': resolve('src', 'store', 'types.ts')
};

export async function createTsconfigs(toUpdate?: ModuleRoot[]) {
  const modules = await loadModules();
  await Promise.all([
    ...getUpdatedModules(modules, toUpdate).map((mod) => {
      return writeFile(
        resolve(mod.root, TSCONFIG_PROJECT),
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
  const modules: ResolvedModule[] = [];

  for await (const path of glob(resolve(MODULES, '**', MODULE))) {
    const mod = await readModuleManifest(path, {
      validateDependencyRanges: true
    });

    const root = dirname(path);
    modules.push({
      name: mod.name,
      root,
      dependencies: mod.dependencies ?? {},
      version: mod.version
    });
  }

  return modules.sort((left, right) => left.root.localeCompare(right.root));
}

function createModuleTsconfig(mod: ResolvedModule, modules: ResolvedModule[]) {
  const modulesByRoot = new Map(modules.map((module) => [module.root, module]));
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
    const dependency = resolveFilesystemDependency(
      mod,
      dependencyName,
      modulesByRoot
    );
    const dependencyRoots = [dependency.root];

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

function resolveFilesystemDependency(
  mod: ResolvedModule,
  dependencyName: string,
  modulesByRoot: Map<string, ResolvedModule>
) {
  for (const root of createDependencyCandidates(mod.root, dependencyName)) {
    const dependency = modulesByRoot.get(root);
    if (dependency) {
      return dependency;
    }
  }

  assert.fail(`${mod.name}: dependency ${dependencyName} is not installed`);
}

function createBuildTsconfig(modules: ResolvedModule[]) {
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

function getUpdatedModules(modules: ResolvedModule[], roots?: ModuleRoot[]) {
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
  return toTsconfigPath(from, resolve(root, TSCONFIG_PROJECT));
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

async function removeStaleModuleTsconfigs(modules: ResolvedModule[]) {
  const root = new Set(modules.map((mod) => mod.root));
  for await (const path of glob(resolve(MODULES, '**', TSCONFIG_PROJECT))) {
    if (!root.has(dirname(path))) {
      await rm(path);
    }
  }
}
