import assert from 'node:assert/strict';
import { glob, mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { CACHE, MODULE, MODULES } from './common/constants.ts';
import { createModuleKey } from './common/helpers/key.ts';
import { readModuleManifest } from './common/helpers/manifest.ts';
import { isInsidePath } from './common/helpers/path.ts';
import type { CommandHandler } from './common/types.ts';

const TYPESCRIPT_EXTENSION = '.ts';
const JAVASCRIPT_EXTENSION = '.js';

export const build: CommandHandler = async () => {
  const paths = await collectModulePaths();
  for (const path of paths) {
    const manifest = await readModuleManifest(path, {
      validateDependencyRanges: true
    });

    const root = dirname(path);

    assert(
      isValidModuleRoot(root, manifest.name, manifest.version),
      `${root}: invalid module root for ${manifest.name}@${manifest.version}`
    );

    if (manifest.main?.endsWith(TYPESCRIPT_EXTENSION)) {
      const main = manifest.main.slice(0, -TYPESCRIPT_EXTENSION.length);
      manifest.main = `${main}${JAVASCRIPT_EXTENSION}`;
    }

    const dist = resolve('dist', relative(resolve('src'), path));
    await mkdir(dirname(dist), {
      recursive: true
    });
    await writeFile(dist, JSON.stringify(manifest, undefined, 2));
  }
};

async function collectModulePaths() {
  const paths: string[] = [];

  for (const pattern of [
    resolve(MODULES, '*', MODULE),
    resolve(CACHE, '*', MODULE)
  ]) {
    for await (const path of glob(pattern)) {
      paths.push(path);
    }
  }

  return paths;
}

function isValidModuleRoot(root: string, dependency: string, version: string) {
  return isInsidePath(root, CACHE)
    ? basename(root) === createModuleKey(dependency, version)
    : basename(root) === dependency;
}
