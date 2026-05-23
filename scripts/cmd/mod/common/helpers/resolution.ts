import { isAbsolute, join, relative, sep } from 'node:path';
import semver from 'semver';
import { MODULES } from '../constants.ts';
import type { ModuleManifest } from '../types.ts';

export interface ResolvedModule {
  dependencies: NonNullable<ModuleManifest['dependencies']>;
  name: ModuleManifest['name'];
  root: string;
  version: ModuleManifest['version'];
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

export function resolveDependency<T extends ResolvedModule>(
  mod: T,
  name: string,
  range: string,
  modulesByRoot: Map<string, T>
) {
  for (const root of createDependencyCandidates(mod.root, name)) {
    const candidate = modulesByRoot.get(root);
    if (!candidate) {
      continue;
    }

    if (semver.satisfies(candidate.version, range)) {
      return candidate;
    }

    throw new Error(
      `${mod.name}: dependency ${name}@${range} resolves to incompatible ` +
        `${candidate.name}@${candidate.version}`
    );
  }

  throw new Error(`${mod.name}: dependency ${name}@${range} is not installed`);
}

export function getModuleLevels(path: string) {
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
