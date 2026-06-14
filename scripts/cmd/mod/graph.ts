import { parseArgs } from 'node:util';
import { CmdError, registerCommand } from '../cmd.ts';
import { ROOT_NODE } from './common/constants.ts';
import { createModuleKey } from './common/helpers/key.ts';
import { readModlock } from './common/helpers/modlock.ts';

const ROOT = 'root';

registerCommand({
  name: 'graph',
  description: 'Print the selected module dependency graph',
  async main(args, context) {
    parseArgs({
      strict: true,
      allowPositionals: false,
      args
    });

    const modlock = await readModlock();
    const root = modlock.modules[ROOT_NODE];
    if (!root) {
      throw new CmdError('Root module set is missing from lockfile');
    }

    const lines: string[] = [];
    for (const [name, version] of sortedEntries(root.dependencies)) {
      lines.push(`${ROOT} ${createModuleKey(name, version)}`);
    }

    for (const [key, node] of sortedEntries(modlock.modules)) {
      if (key === ROOT_NODE) {
        continue;
      }

      for (const [name, version] of sortedEntries(node.dependencies)) {
        lines.push(`${key} ${createModuleKey(name, version)}`);
      }
    }

    context.logger.info(lines.join('\n'));
  }
});

function sortedEntries<T>(record: Record<string, T>) {
  return Object.entries(record).toSorted(([left], [right]) => left.localeCompare(right));
}
