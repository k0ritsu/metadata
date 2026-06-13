#!/usr/bin/env node

import { CmdError, type CommandHandler } from './cmd/cmd.ts';
import { build } from './cmd/mod/build.ts';
import { create } from './cmd/mod/create.ts';
import { init } from './cmd/mod/init.ts';
import { install } from './cmd/mod/install.ts';
import { publish } from './cmd/mod/publish.ts';
import { remove } from './cmd/mod/remove.ts';
import { tidy } from './cmd/mod/tidy.ts';

const commands: Record<string, CommandHandler> = {
  build,
  create,
  init,
  install,
  publish,
  remove,
  tidy
};

try {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    throw new CmdError('command is required');
  }

  const handler = commands[command];
  if (!handler) {
    throw new Error(`${command}: unknown command`);
  }

  await handler(args);
} catch (error) {
  if (error instanceof Error) {
    console.error(`${error.name}: ${error.message}`);

    if (process.env['DEBUG']) {
      console.error(error.stack);
    }
  } else {
    console.error(String(error));
  }

  process.exit(1);
}
