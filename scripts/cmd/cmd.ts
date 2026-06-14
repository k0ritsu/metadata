export interface CmdContext {
  fetch: typeof fetch;
  logger: {
    debug(msg: string): void;
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
  };
}

export interface CmdMain {
  (args: string[], context: CmdContext): Promise<void>;
}

interface CmdOptions {
  name: string;
  description: string;
  main: CmdMain;
}

export class CmdError extends Error {}

const repository = new Map<string, CmdOptions>();

registerCommand({
  name: 'help',
  description: 'Show all commands or details for one command',
  async main([name], context) {
    if (typeof name === 'string') {
      const options = repository.get(name);
      if (options) {
        context.logger.info(`${options.name}\t${options.description}`);
      }

      return;
    }

    for (const options of repository.values()) {
      context.logger.info(`${options.name}\t${options.description}`);
    }
  }
});

export function registerCommand(options: CmdOptions) {
  if (repository.has(options.name)) {
    throw new CmdError(`Command '${options.name}' already registered`);
  }

  repository.set(options.name, options);
}

export async function main() {
  const [name, ...args] = process.argv.slice(2);
  try {
    if (name) {
      const options = repository.get(name);
      if (options) {
        await options.main(args, {
          fetch,
          logger: console
        });

        return;
      }
    }

    console.error('Unknown command');
  } catch (error) {
    switch (true) {
      case error instanceof Error:
        console.error(error.message);
        break;
      default:
        console.error(error);
        break;
    }
  }

  process.exit(1);
}
