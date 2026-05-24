#!/usr/bin/env node

import { build } from './cmd/mod/build.ts';
import { create } from './cmd/mod/create.ts';
import { init } from './cmd/mod/init.ts';
import { install } from './cmd/mod/install.ts';
import { publish } from './cmd/mod/publish.ts';
import { remove } from './cmd/mod/remove.ts';
import { status } from './cmd/mod/status.ts';
import { tidy } from './cmd/mod/tidy.ts';

const [command, ...args] = process.argv.slice(2);
switch (command) {
  case 'build':
    await build(args);
    break;
  case 'create':
    await create(args);
    break;
  case 'init':
    await init(args);
    break;
  case 'install':
    await install(args);
    break;
  case 'publish':
    await publish(args);
    break;
  case 'remove':
    await remove(args);
    break;
  case 'status':
    await status(args);
    break;
  case 'tidy':
    await tidy(args);
    break;
  default:
    throw new Error('unknown');
}
