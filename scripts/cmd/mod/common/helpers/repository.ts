import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MODRC } from '../constants.ts';
import { assertModrc, resolveModrc } from './modrc.ts';
import { isRecord } from './record.ts';

export async function resolveRepository(repository?: string): Promise<string> {
  if (repository) {
    return repository;
  }

  const path = await resolveModrc();
  assert(
    path,
    `repository is required: no repository argument or ${MODRC} found`
  );

  const modrc: unknown = JSON.parse(
    await readFile(path, {
      encoding: 'utf8'
    })
  );

  assertModrc(modrc, path);

  return modrc.repository;
}

export function createRepositoryUrl(repository: string, path: string) {
  const base = repository.endsWith('/') ? repository : `${repository}/`;

  return new URL(path.replace(/^\/+/, ''), base);
}

export function createRepositoryError(
  prefix: string,
  response: Response,
  body: string
): string {
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
