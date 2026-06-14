import { glob, mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { CmdError, registerCommand } from '../cmd.ts';
import { CACHE, MODULE, MODULES } from './common/constants.ts';
import { createModuleKey } from './common/helpers/key.ts';
import { readModuleManifest } from './common/helpers/manifest.ts';
import { isInsidePath } from './common/helpers/path.ts';

const TYPESCRIPT_EXTENSION = '.ts';
const JAVASCRIPT_EXTENSION = '.js';

registerCommand({
  name: 'build',
  description: 'Copy module manifests into dist/modules',
  async main(args) {
    parseArgs({
      strict: true,
      allowPositionals: false,
      args
    });

    const paths = await collectModulePaths();

    for (const path of paths) {
      const manifest = await readModuleManifest(path, {
        validateDependencyRanges: false
      });

      const root = dirname(path);
      if (!isValidModuleRoot(root, manifest.name, manifest.version)) {
        throw new CmdError(`${root}: Invalid module root for ${manifest.name}@${manifest.version}`);
      }

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
  }
});

async function collectModulePaths() {
  const paths: string[] = [];

  for (const pattern of [resolve(MODULES, '*', MODULE), resolve(CACHE, '*', MODULE)]) {
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
