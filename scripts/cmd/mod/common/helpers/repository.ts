import { readFile } from 'node:fs/promises';
import { MODRC } from '../constants.ts';
import { assertModrc, resolveModrc } from './modrc.ts';
import { isRecord } from './record.ts';

class RepositoryError extends Error {}

export async function resolveRepository(repository?: string) {
  if (repository) {
    return repository;
  }

  const path = await resolveModrc();
  if (!path) {
    throw new RepositoryError(`no repository argument or ${MODRC} found`);
  }

  const modrc: unknown = JSON.parse(
    await readFile(path, {
      encoding: 'utf8'
    })
  );

  assertModrc(modrc);

  return modrc.repository;
}

export async function api(repository: string, path: string, init?: RequestInit) {
  const response = await request(createRepositoryUrl(repository, path), init);

  return response.json();
}

export async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new RepositoryError(await formatResponseError(response));
  }

  return response;
}

async function formatResponseError(response: Response) {
  const fallback = `repository request failed with ${response.status}`;

  const body = await response.text();
  if (!body) {
    return fallback;
  }

  try {
    const parsed: unknown = JSON.parse(body);
    if (isRecord(parsed) && typeof parsed['detail'] === 'string') {
      return `${fallback}: ${parsed['detail']}`;
    }
  } catch {}

  return fallback;
}

export function createRepositoryUrl(repository: string, path: string) {
  return new URL(path, repository).href;
}
