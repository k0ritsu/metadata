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

  const dependencies = modlock.modules[ROOT_NODE]?.dependencies ?? {};
  const rows: Row[] = [];

  let failed = false;

  for (const [dependency, version] of Object.entries(dependencies)) {
    const key = createModuleKey(dependency, version);
    const root = resolve(MODULES, dependency);

    const found = await exists(root);
    if (!found) {
      rows.push({
        key,
        status: 'missing-module'
      });

      failed = true;

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

      continue;
    }
  }

  for (const row of rows) {
    console.log(formatStatusRow(row));
  }

  if (failed) {
    process.exitCode = 1;
  }
};

function formatStatusRow(row: Row): string {
  switch (row.status) {
    case 'changed':
      return `${row.key}: integrity differs`;
    case 'missing-integrity':
      return `${row.key}: integrity is missing`;
    case 'missing-module':
      return `${row.key}: module is missing`;
  }
}
