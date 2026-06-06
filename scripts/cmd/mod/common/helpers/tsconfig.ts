import assert from 'node:assert/strict';
import { glob, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import {
  CACHE,
  MODULES,
  MODULES_ALIAS,
  ROOT_NODE,
  TSCONFIG_PROJECT
} from '../constants.ts';
import type { Modlock } from '../types.ts';
import { createModuleKey } from './key.ts';
import { readModlock, resolveModuleRoot } from './modlock.ts';

const TSCONFIG_BASE = resolve('tsconfig.base.json');
const TSCONFIG_BUILD = resolve('tsconfig.build.json');
const TSCONFIG = resolve(TSCONFIG_PROJECT);

const CORE_ALIASES = {
  '#core/errors/*': resolve('src', 'errors', '*'),
  '#core/loader': resolve('src', 'loader', 'types.ts'),
  '#core/logger': resolve('src', 'logger', 'types.ts'),
  '#core/router': resolve('src', 'router', 'types.ts'),
  '#core/store': resolve('src', 'store', 'types.ts')
};

export async function createTsconfigs(
  toUpdate?: Array<{
    root: string;
  }>
): Promise<void> {
  const modlock = await readModlock();
  const modules = Object.keys(modlock.modules).filter(
    (key) => key !== ROOT_NODE
  );

  if (toUpdate) {
    const roots = new Set(toUpdate.map(({ root }) => resolve(root)));

    await Promise.all(
      modules
        .filter((key) => roots.has(resolveModuleRoot(key, modlock)))
        .map((key) => {
          return writeFile(
            resolve(resolveModuleRoot(key, modlock), TSCONFIG_PROJECT),
            JSON.stringify(createModuleTsconfig(modlock, key), undefined, 2)
          );
        })
    );
  } else {
    await Promise.all(
      modules.map((key) => {
        return writeFile(
          resolve(resolveModuleRoot(key, modlock), TSCONFIG_PROJECT),
          JSON.stringify(createModuleTsconfig(modlock, key), undefined, 2)
        );
      })
    );
  }

  await Promise.all([
    writeFile(
      TSCONFIG_BUILD,
      JSON.stringify(createBuildTsconfig(modlock, modules), undefined, 2)
    ),
    removeStaleModuleTsconfigs(modlock, modules)
  ]);
}

function createModuleTsconfig(modlock: Modlock, key: string): unknown {
  const root = resolveModuleRoot(key, modlock);

  const node = modlock.modules[key];
  assert(node, `${key}: module is missing from modlock`);

  const paths = Object.fromEntries(
    Object.entries(CORE_ALIASES).map(([alias, path]) => [
      alias,
      [toTsconfigPath(root, path)]
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
        path: toTsconfigPath(root, TSCONFIG)
      }
    ]
  ]);

  for (const [dependency, version] of Object.entries(node.dependencies)) {
    const dependencyRoot = resolveModuleRoot(
      createModuleKey(dependency, version),
      modlock
    );
    const dependencyPath = toTsconfigPath(root, dependencyRoot);

    paths[`${MODULES_ALIAS}${dependency}`] = [dependencyPath];
    paths[`${MODULES_ALIAS}${dependency}/*`] = [`${dependencyPath}/*`];

    references.set(dependencyRoot, {
      path: toTsconfigPath(root, resolve(dependencyRoot, TSCONFIG_PROJECT))
    });
  }

  const dist = resolve('dist', 'modules');

  return {
    compilerOptions: {
      outDir: toTsconfigPath(root, resolve(dist, relative(MODULES, root))),
      paths,
      rootDir: '.',
      tsBuildInfoFile: toTsconfigPath(
        root,
        resolve(dist, relative(MODULES, root), 'tsconfig.tsbuildinfo')
      )
    },
    extends: toTsconfigPath(root, TSCONFIG_BASE),
    include: ['src/**/*.ts'],
    references: Array.from(references.values())
  };
}

function createBuildTsconfig(modlock: Modlock, modules: string[]): unknown {
  const root = resolve('.');

  return {
    files: [],
    references: [
      {
        path: toTsconfigPath(root, TSCONFIG)
      },
      ...modules.map((key) => ({
        path: toTsconfigPath(
          root,
          resolve(resolveModuleRoot(key, modlock), TSCONFIG_PROJECT)
        )
      }))
    ]
  };
}

function toTsconfigPath(from: string, to: string): string {
  const path = relative(from, to).split(sep).join('/');
  if (!path) {
    return '.';
  }

  if (path.startsWith('.')) {
    return path;
  }

  return `./${path}`;
}

async function removeStaleModuleTsconfigs(
  modlock: Modlock,
  modules: string[]
): Promise<void> {
  const roots = new Set(modules.map((key) => resolveModuleRoot(key, modlock)));
  const stale: Promise<void>[] = [];

  for (const pattern of [
    resolve(MODULES, '*', TSCONFIG_PROJECT),
    resolve(CACHE, '*', TSCONFIG_PROJECT)
  ]) {
    for await (const path of glob(pattern)) {
      if (!roots.has(dirname(path))) {
        stale.push(
          rm(path, {
            force: true
          })
        );
      }
    }
  }

  await Promise.all(stale);
}
