import { parseArgs } from 'node:util';
import { CmdError, registerCommand } from '../cmd.ts';
import { ROOT_NODE } from './common/constants.ts';
import { createModuleKey } from './common/helpers/key.ts';
import { assertModuleName, isSemver } from './common/helpers/manifest.ts';
import { readModlock } from './common/helpers/modlock.ts';
import type { Modlock } from './common/types.ts';

registerCommand({
  name: 'why',
  description: 'Explain why a module is reachable from the root set',
  async main(args, env) {
    const { positionals } = parseArgs({
      strict: true,
      allowPositionals: true,
      args
    });

    if (positionals.length > 1) {
      throw new CmdError(
        `Unexpected argument '${positionals[1]}'. This command takes exactly one positional argument`
      );
    }

    const [spec] = positionals;
    if (!spec) {
      throw new CmdError('Module name is required');
    }

    const modlock = await readModlock();
    const target = parseWhySpec(spec, modlock);
    const path = findPath(target, modlock);

    env.logger.info(`# ${target}`);
    if (!path) {
      env.logger.info('(root module set does not need module)');

      return;
    }

    env.logger.info(path.join('\n'));
  }
});

function parseWhySpec(spec: string, modlock: Modlock) {
  let name = spec;
  let version: string | undefined;

  const index = spec.lastIndexOf('@');
  if (index > 0) {
    name = spec.slice(0, index);
    version = spec.slice(index + 1);
  }

  assertModuleName(name);
  if (version) {
    if (!isSemver(version)) {
      throw new CmdError(`${version}: Invalid module version`);
    }

    return createModuleKey(name, version);
  }

  const rootVersion = modlock.modules[ROOT_NODE]?.dependencies[name];
  if (rootVersion) {
    return createModuleKey(name, rootVersion);
  }

  const matches = Object.keys(modlock.modules).filter((key) => key.startsWith(`${name}@`));
  if (matches.length !== 1) {
    throw new CmdError(`${name}: Module version is ambiguous or missing`);
  }

  const [match] = matches;
  if (!match) {
    throw new CmdError(`${name}: Module version is ambiguous or missing`);
  }

  return match;
}

function findPath(target: string, modlock: Modlock): string[] | undefined {
  const root = modlock.modules[ROOT_NODE];
  if (!root) {
    throw new CmdError('Root module set is missing from lockfile');
  }

  const queue = Object.entries(root.dependencies).map(([name, version]) => ({
    key: createModuleKey(name, version),
    path: ['root', createModuleKey(name, version)]
  }));
  const seen = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current.key)) {
      continue;
    }

    if (current.key === target) {
      return current.path;
    }

    seen.add(current.key);

    const node = modlock.modules[current.key];
    if (!node) {
      continue;
    }

    for (const [name, version] of Object.entries(node.dependencies)) {
      const key = createModuleKey(name, version);
      queue.push({
        key,
        path: [...current.path, key]
      });
    }
  }

  return undefined;
}
