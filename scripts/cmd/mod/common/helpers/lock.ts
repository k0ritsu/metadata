import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import type { CmdMain } from '../../../cmd.ts';
import { MODULES } from '../constants.ts';
import { isRecord } from './record.ts';

const LOCK = '.modlock';

class LockError extends Error {}

interface Lock {
  cmd: string;
  cwd: string;
  pid: number;
  timestamp: string;
}

export function withModuleLock(command: string, main: CmdMain) {
  const path = resolve(MODULES, LOCK);

  const wrapper: CmdMain = async (args, context) => {
    await acquireLock(path, command);

    try {
      await main(args, context);
    } finally {
      await releaseLock(path);
    }
  };

  return wrapper;
}

async function acquireLock(path: string, cmd: string) {
  await mkdir(MODULES, {
    recursive: true
  });

  const timestamp = new Date().toISOString();
  const lock = {
    cmd,
    cwd: process.cwd(),
    pid: process.pid,
    timestamp
  } satisfies Lock;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await writeFile(path, JSON.stringify(lock, undefined, 2), {
        flag: 'wx'
      });

      return;
    } catch (error) {
      if (!isFileExistsError(error)) {
        throw error;
      }

      if (await removeStaleLockIfPossible(path)) {
        continue;
      }

      const lock = await readLock(path);
      if (lock) {
        throw new LockError(
          `Command '${lock.cmd}' is already running in ${lock.cwd} \
(pid ${lock.pid}, started ${lock.timestamp})`
        );
      }

      throw new LockError('Lock file disappeared while acquiring the lock');
    }
  }

  throw new LockError('Failed to acquire lock');
}

function isFileExistsError(error: unknown) {
  return isRecord(error) && error['code'] === 'EEXIST';
}

async function removeStaleLockIfPossible(path: string) {
  const lock = await readLock(path);
  if (!lock) {
    throw new LockError('Lock file is missing');
  }

  if (isPidAlive(lock.pid)) {
    return false;
  }

  await releaseLock(path);

  return true;
}

async function readLock(path: string) {
  try {
    const value: unknown = JSON.parse(
      await readFile(path, {
        encoding: 'utf8'
      })
    );

    assertLock(value);

    return value;
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return;
    }

    throw error;
  }
}

function assertLock(value: unknown): asserts value is Lock {
  if (
    !isRecord(value) ||
    typeof value['cmd'] !== 'string' ||
    typeof value['cwd'] !== 'string' ||
    typeof value['pid'] !== 'number' ||
    typeof value['timestamp'] !== 'string'
  ) {
    throw new LockError('Lock file is corrupted');
  }
}

function isFileNotFoundError(error: unknown) {
  return isRecord(error) && error['code'] === 'ENOENT';
}

function isPidAlive(pid: number) {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    if (isRecord(error) && error['code'] === 'ESRCH') {
      return false;
    }

    return true;
  }
}

async function releaseLock(path: string) {
  await rm(path, {
    force: true
  });
}
