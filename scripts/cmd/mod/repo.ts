import { parseArgs } from 'node:util';
import { CmdError, registerCommand, type CmdMain } from '../cmd.ts';
import { readModrc, writeModrc } from './common/helpers/modrc.ts';
import { isRecord } from './common/helpers/record.ts';
import { createRepositoryUrl, request, resolveRepository } from './common/helpers/repository.ts';
import { withModuleTransaction } from './common/helpers/transaction.ts';

registerCommand({
  name: 'repo',
  description: 'Get or set the module repository URL',
  async main([subcommand, ...args], context) {
    switch (subcommand) {
      case 'get':
        await get(args, context);
        return;
      case 'set':
        await set(args, context);
        return;
    }

    throw new CmdError('Repo subcommand must be get or set');
  }
});

const get: CmdMain = async (args, env) => {
  parseArgs({
    strict: true,
    allowPositionals: false,
    args
  });

  env.logger.info(resolveRepository(undefined, await readModrc()));
};

const set: CmdMain = withModuleTransaction('repo set', async (args) => {
  const { positionals } = parseArgs({
    strict: true,
    allowPositionals: true,
    args
  });

  const [repository] = positionals;
  if (!repository) {
    throw new CmdError('Repository URL is required');
  }

  if (positionals.length > 1) {
    throw new CmdError(
      `Unexpected argument '${positionals[1]}'. This command takes exactly one positional argument`
    );
  }

  await assertRepositoryReachable(repository);
  await writeModrc(repository);
});

async function assertRepositoryReachable(repository: string) {
  const response = await request(createRepositoryUrl(repository, 'ping'));
  const body: unknown = await response.json();

  if (!isRecord(body) || body['pong'] !== true) {
    throw new CmdError('Repository ping returned invalid response');
  }
}
