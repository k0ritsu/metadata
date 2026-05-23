import { access } from 'node:fs/promises';
import type { LoadHook, ResolveHook, ResolveHookContext } from 'node:module';
import { extname, isAbsolute, join, relative, sep } from 'node:path';
import { cwd } from 'node:process';
import { fileURLToPath } from 'node:url';

const EXTENSION = extname(import.meta.filename);

const NODE_MODULES = join(cwd(), 'node_modules');
const MODULES = import.meta.dirname;

const MODULES_ALIAS = '#modules/';

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  if (isInsidePath(context, NODE_MODULES)) {
    return nextResolve(specifier, context);
  }

  if (isInsidePath(context, MODULES)) {
    specifier = await resolveSpecifier(specifier, context);
  }

  return nextResolve(withRuntimeExtension(specifier), context);
};

export const load: LoadHook = (url, context, nextLoad) => {
  return nextLoad(url, context);
};

function isInsidePath(context: ResolveHookContext, path: string) {
  if (!context.parentURL) {
    return false;
  }

  const relativePath = relative(path, fileURLToPath(context.parentURL));

  return (
    relativePath !== '' &&
    !relativePath.startsWith('..') &&
    !isAbsolute(relativePath)
  );
}

async function resolveSpecifier(
  specifier: string,
  context: ResolveHookContext
) {
  if (specifier.startsWith(MODULES_ALIAS)) {
    specifier = specifier.slice(MODULES_ALIAS.length);
  } else {
    return specifier;
  }

  const [dependency, ...paths] = specifier.split('/');
  if (!dependency) {
    throw new Error(`invalid module alias "${MODULES_ALIAS}${specifier}"`);
  }

  const candidates = createDependencyCandidates(dependency, context);
  for (const candidate of candidates) {
    const resolved = withRuntimeExtension(join(candidate, ...paths));
    try {
      await access(resolved);

      return resolved;
    } catch {
      continue;
    }
  }

  throw new Error(`cannot resolve module alias "${MODULES_ALIAS}${specifier}"`);
}

function createDependencyCandidates(
  dependency: string,
  context: ResolveHookContext
) {
  const levels = getModuleLevels(context);
  const candidates: string[] = [];

  for (let depth = levels.length; depth > 0; depth--) {
    const current = levels.slice(0, depth);

    const [root, ...nested] = current;
    if (!root) {
      continue;
    }

    const modulePath = join(
      MODULES,
      root,
      ...nested.flatMap((module) => ['modules', module])
    );

    candidates.push(join(modulePath, 'modules', dependency));
  }

  candidates.push(join(MODULES, dependency));

  return candidates;
}

function getModuleLevels(context: ResolveHookContext) {
  const { parentURL } = context;
  if (!parentURL) {
    return [];
  }

  const parentPath = fileURLToPath(parentURL);
  const relativePath = relative(MODULES, parentPath);

  if (
    relativePath === '' ||
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

function withRuntimeExtension(specifier: string): string {
  return specifier.replace(/\.js$/, EXTENSION);
}
