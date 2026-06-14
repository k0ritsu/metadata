import { MODRC } from '../constants.ts';
import type { Modrc } from '../types.ts';
import { isRecord } from './record.ts';

class RepositoryError extends Error {}

export function resolveRepository(repository?: string, modrc?: Modrc) {
  if (repository) {
    return repository;
  }

  if (modrc) {
    return modrc.repository;
  }

  throw new RepositoryError(`No repository argument or ${MODRC} found`);
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
  const fallback = `Repository request failed with ${response.status}`;

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
