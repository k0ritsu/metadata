import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MODRC, MODULES } from '../constants.ts';
import type { Modrc } from '../types.ts';
import { exists } from './path.ts';
import { isRecord } from './record.ts';

export async function resolveRepository(repository?: string) {
  if (repository) {
    return repository;
  }

  const path = await resolveModrc();
  assert(
    path,
    `repository is required: no repository argument or ${MODRC} found`
  );

  const modrc: Modrc = JSON.parse(
    await readFile(path, {
      encoding: 'utf8'
    })
  );

  assert(
    typeof modrc.repository === 'string',
    `${path}: repository is required`
  );

  return modrc.repository;
}

async function resolveModrc() {
  const path = resolve(MODULES, MODRC);

  if (await exists(path)) {
    return path;
  }

  return undefined;
}

export function createRepositoryUrl(repository: string, path: string) {
  const base = repository.endsWith('/') ? repository : `${repository}/`;
  return new URL(path.replace(/^\/+/, ''), base);
}

export function createRepositoryError(
  prefix: string,
  response: Response,
  body: string
) {
  const fallback = `${prefix} with ${response.status} ${response.statusText}`;

  if (!body) {
    return fallback;
  }

  try {
    const parsed: unknown = JSON.parse(body);
    if (isRecord(parsed) && typeof parsed['detail'] === 'string') {
      return `${fallback}: ${parsed['detail']}`;
    }
  } catch {}

  return `${fallback}: ${body}`;
}
