import type {
  InitializeHook,
  LoadHook,
  ResolveHook,
  ResolveHookContext
} from 'node:module';
import { extname, isAbsolute, join, relative, sep } from 'node:path';
import { cwd } from 'node:process';
import { fileURLToPath } from 'node:url';

export interface Modlock {
  lockfileVersion: number;
  modules: Record<string, ModlockNode>;
}

interface ModlockNode {
  dependencies: Record<string, string>;
  integrity?: string;
  resolved?: string;
}

interface ModuleAlias {
  dependency: string;
  path: string;
}

const NODE_MODULES = join(cwd(), 'node_modules');
const MODULES = import.meta.dirname;

const CACHE = join(MODULES, '.cache');

const MODULES_ALIAS = '#modules/';
const ROOT_NODE = '';

const EXTENSION = extname(import.meta.filename);
const JAVASCRIPT_EXTENSION = '.js';

let modules: Modlock['modules'] = {};

export const initialize: InitializeHook<{
  modlock: Modlock;
}> = ({ modlock }) => {
  modules = modlock.modules;
};

export const resolve: ResolveHook = (specifier, context, nextResolve) => {
  if (isInsidePath(context, NODE_MODULES)) {
    return nextResolve(specifier, context);
  }

  if (isInsidePath(context, MODULES)) {
    specifier = resolveModuleSpecifier(specifier, context);
  }

  return nextResolve(withRuntimeExtension(specifier), context);
};

export const load: LoadHook = (url, context, nextLoad) => {
  return nextLoad(url, context);
};

function resolveModuleSpecifier(
  specifier: string,
  context: ResolveHookContext
): string {
  const alias = parseModuleAlias(specifier);
  if (!alias) {
    return specifier;
  }

  const importer = getImporterKey(context, specifier);
  const version = getDependencyVersion(importer, alias.dependency);

  const module = createModuleKey(alias.dependency, version);
  assertModlockNode(module);

  const dependencyRoot = resolveDependencyRoot(alias.dependency, version, {
    module
  });

  return join(dependencyRoot, alias.path);
}

function parseModuleAlias(specifier: string): ModuleAlias | undefined {
  if (specifier.startsWith(MODULES_ALIAS)) {
    specifier = specifier.slice(MODULES_ALIAS.length);
  } else {
    return;
  }

  const [dependency, ...pathParts] = specifier.split('/');
  if (!dependency) {
    throw new Error(`Invalid module alias "${specifier}"`);
  }

  return {
    dependency,
    path: join(...pathParts)
  };
}

function getImporterKey(
  context: ResolveHookContext,
  specifier: string
): string {
  const parentPath = getParentPath(context);
  if (!parentPath) {
    throw new Error(`cannot resolve "${specifier}" without a file parent URL`);
  }

  const relativePath = relative(MODULES, parentPath);

  const [root, module] = relativePath.split(sep).filter(Boolean);
  if (!root) {
    throw new Error(`cannot determine importing module for "${specifier}"`);
  }

  if (isInsidePath(context, CACHE)) {
    if (!module) {
      throw new Error(`cannot determine dependency module for "${specifier}"`);
    }

    assertModlockNode(module);

    return module;
  }

  return createModuleKey(root, getDependencyVersion(ROOT_NODE, root));
}

function createModuleKey(dependency: string, version: string): string {
  return `${dependency}@${version}`;
}

function getDependencyVersion(module: string, dependency: string): string {
  const node = assertModlockNode(module);

  const version = node.dependencies[dependency];
  if (!version) {
    throw new Error(
      `${module || 'root module set'} does not depend on ${dependency}`
    );
  }

  return version;
}

function assertModlockNode(module: string): ModlockNode {
  const node = modules[module];
  if (!node) {
    throw new Error(`${module || 'root module set'} is missing`);
  }

  return node;
}

function resolveDependencyRoot(
  dependency: string,
  version: string,
  options: {
    module: string;
  }
): string {
  return isRootDependency(dependency, version)
    ? join(MODULES, dependency)
    : join(CACHE, options.module);
}

function isRootDependency(dependency: string, version: string): boolean {
  return modules[ROOT_NODE]?.dependencies[dependency] === version;
}

function isInsidePath(context: ResolveHookContext, root: string): boolean {
  const parentPath = getParentPath(context);
  if (!parentPath) {
    return false;
  }

  const relativePath = relative(root, parentPath);

  return (
    relativePath !== '' &&
    !relativePath.startsWith('..') &&
    !isAbsolute(relativePath)
  );
}

function getParentPath(context: ResolveHookContext): string | undefined {
  const { parentURL } = context;
  if (parentURL?.startsWith('file:')) {
    return fileURLToPath(parentURL);
  }

  return;
}

function withRuntimeExtension(specifier: string): string {
  if (specifier.endsWith(JAVASCRIPT_EXTENSION)) {
    specifier = specifier.slice(0, -JAVASCRIPT_EXTENSION.length);

    return `${specifier}${EXTENSION}`;
  }

  return specifier;
}
