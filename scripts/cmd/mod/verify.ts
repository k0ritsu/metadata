import { parseArgs } from 'node:util';
import { CmdError, registerCommand } from '../cmd.ts';
import { ROOT_NODE } from './common/constants.ts';
import { createModuleIntegrity } from './common/helpers/integrity.ts';
import { createModuleKey, parseModuleKey } from './common/helpers/key.ts';
import { readModuleManifest } from './common/helpers/manifest.ts';
import { readModlock, resolveModuleRoot } from './common/helpers/modlock.ts';
import type { Modlock } from './common/types.ts';

registerCommand({
  name: 'verify',
  description: 'Verify modules and dependency edges from modlock.json',
  async main(args, context) {
    parseArgs({
      strict: true,
      allowPositionals: false,
      args
    });

    const modlock = await readModlock();
    assertEdges(modlock);

    for (const [key, node] of Object.entries(modlock.modules)) {
      if (key === ROOT_NODE) {
        continue;
      }

      const { dependency, version } = parseModuleKey(key);
      const root = resolveModuleRoot(key, modlock);
      const manifest = await readModuleManifest(root, {
        validateDependencyRanges: true
      });

      if (manifest.name !== dependency || manifest.version !== version) {
        throw new CmdError(`${key}: Installed manifest identity mismatch`);
      }

      if (!node.integrity) {
        throw new CmdError(`${key}: Missing integrity`);
      }

      const actual = await createModuleIntegrity(root);
      if (actual !== node.integrity) {
        throw new CmdError(`${key}: Integrity verification failed`);
      }
    }

    context.logger.info('All modules verified');
  }
});

function assertEdges(modlock: Modlock) {
  for (const [key, node] of Object.entries(modlock.modules)) {
    for (const [name, version] of Object.entries(node.dependencies)) {
      const dependencyKey = createModuleKey(name, version);
      if (!modlock.modules[dependencyKey]) {
        throw new CmdError(
          `${key || 'root module set'}: Dependency ${dependencyKey} is missing from lockfile`
        );
      }
    }
  }
}
