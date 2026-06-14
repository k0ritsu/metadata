import { parseArgs } from 'util';
import { CmdError, registerCommand } from '../cmd.ts';
import { ROOT_NODE } from './common/constants.ts';
import { installArtifactAtRoot } from './common/helpers/install.ts';
import { parseModuleKey } from './common/helpers/key.ts';
import { readModlock, resolveModuleRoot } from './common/helpers/modlock.ts';
import { withModuleTransaction } from './common/helpers/transaction.ts';
import { createTsconfigs } from './common/helpers/tsconfig.ts';

registerCommand({
  name: 'download',
  description: 'Download all modules described by modlock.json',
  main: withModuleTransaction('download', async (args, context) => {
    parseArgs({
      strict: true,
      allowPositionals: false,
      args
    });

    const modlock = await readModlock();

    for (const [key, node] of Object.entries(modlock.modules)) {
      if (key === ROOT_NODE) {
        continue;
      }

      if (!node.resolved) {
        throw new CmdError(`${key}: Missing resolved`);
      }

      if (!node.integrity) {
        throw new CmdError(`${key}: Missing integrity`);
      }

      const { dependency, version } = parseModuleKey(key);
      const root = resolveModuleRoot(key, modlock);

      const metadata = await installArtifactAtRoot(
        root,
        {
          name: dependency,
          version
        },
        node.resolved,
        {
          expectedIntegrity: node.integrity,
          logger: context.logger
        }
      );
      if (metadata.integrity !== node.integrity) {
        throw new CmdError(`${key}: Integrity verification failed`);
      }
    }

    await createTsconfigs(modlock);
  })
});
