import { resolve } from 'node:path';
import { MODULES, ROOT_NODE } from './common/constants.ts';
import { createModuleIntegrity } from './common/helpers/integrity.ts';
import { createModuleKey } from './common/helpers/key.ts';
import { readModlock } from './common/helpers/modlock.ts';
import { exists } from './common/helpers/path.ts';
import type { CommandHandler } from './common/types.ts';

interface Row {
  key: string;
  status: 'changed' | 'missing-integrity' | 'missing-module';
}

export const status: CommandHandler = async () => {
  const modlock = await readModlock();
  const rows: Row[] = [];

  let hasFailure = false;

  for (const [dependency, version] of Object.entries(
    modlock.modules[ROOT_NODE]?.dependencies ?? {}
  )) {
    const key = createModuleKey(dependency, version);
    const root = resolve(MODULES, dependency);

    const rooted = await exists(root);
    if (!rooted) {
      rows.push({
        key,
        status: 'missing-module'
      });

      hasFailure = true;

      continue;
    }

    const node = modlock.modules[key];
    if (!node?.integrity) {
      rows.push({
        key,
        status: 'missing-integrity'
      });

      continue;
    }

    const actual = await createModuleIntegrity(root);
    if (actual !== node.integrity) {
      rows.push({
        key,
        status: 'changed'
      });

      hasFailure = true;

      continue;
    }
  }

  for (const row of rows) {
    console.log(formatStatusRow(row));
  }

  if (hasFailure) {
    process.exitCode = 1;
  }
};

function formatStatusRow(row: Row) {
  switch (row.status) {
    case 'changed':
      return `${row.key}: integrity differs`;
    case 'missing-integrity':
      return `${row.key}: integrity is missing`;
    case 'missing-module':
      return `${row.key}: module is missing`;
  }
}
