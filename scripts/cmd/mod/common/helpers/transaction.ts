import { cp, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import type { CmdMain } from '../../../cmd.ts';
import { MODULES, TSCONFIG_PROJECT } from '../constants.ts';
import { withModuleLock } from './lock.ts';
import { exists } from './path.ts';

const BACKUP_PREFIX = '.mod-backup-workspace-';

const ROOT_TSCONFIG_BUILD = resolve('tsconfig.build.json');
const ROOT_TSCONFIG = resolve(TSCONFIG_PROJECT);

export function withModuleTransaction(cmd: string, handler: CmdMain) {
  return withModuleLock(cmd, async (args, env) => {
    const backup = await createWorkspaceBackup();

    try {
      await handler(args, env);
      await removeWorkspaceBackup(backup);
    } catch (error) {
      await restoreWorkspaceBackup(backup);

      throw error;
    }
  });
}

async function createWorkspaceBackup() {
  const root = await mkdtemp(resolve(dirname(MODULES), BACKUP_PREFIX));
  const modules = resolve(root, basename(MODULES));
  const tsconfigBuild = resolve(root, 'tsconfig.build.json');
  const tsconfig = resolve(root, TSCONFIG_PROJECT);

  if (await exists(MODULES)) {
    await cp(MODULES, modules, {
      recursive: true,
      filter: (source) => {
        const name = basename(source);

        return !name.startsWith('.mod-tmp-') && !name.startsWith('.mod-backup-');
      }
    });
  }

  if (await exists(ROOT_TSCONFIG_BUILD)) {
    await cp(ROOT_TSCONFIG_BUILD, tsconfigBuild);
  }

  if (await exists(ROOT_TSCONFIG)) {
    await cp(ROOT_TSCONFIG, tsconfig);
  }

  return {
    root,
    modules,
    tsconfig,
    tsconfigBuild
  };
}

async function restoreWorkspaceBackup(backup: Awaited<ReturnType<typeof createWorkspaceBackup>>) {
  await rm(MODULES, {
    force: true,
    recursive: true
  });

  if (await exists(backup.modules)) {
    await mkdir(dirname(MODULES), {
      recursive: true
    });
    await rename(backup.modules, MODULES);
  }

  await restoreFile(ROOT_TSCONFIG_BUILD, backup.tsconfigBuild);
  await restoreFile(ROOT_TSCONFIG, backup.tsconfig);

  await removeWorkspaceBackup(backup);
}

async function restoreFile(target: string, backup: string) {
  await rm(target, {
    force: true
  });

  if (await exists(backup)) {
    await rename(backup, target);
  }
}

async function removeWorkspaceBackup(backup: Awaited<ReturnType<typeof createWorkspaceBackup>>) {
  await rm(backup.root, {
    force: true,
    recursive: true
  });
}
