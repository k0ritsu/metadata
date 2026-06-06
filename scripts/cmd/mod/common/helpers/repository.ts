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

export function createRepositoryUrl(repository: string, path: string): string {
  return new URL(path, repository).href;
}

export async function fetchRepository(
  repository: string,
  path: string,
  init?: RequestInit
): Promise<unknown> {
  const response = await fetchUrl(createRepositoryUrl(repository, path), init);

  return response.json();
}

export async function fetchUrl(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(await formatRepositoryError(response));
  }

  return response;
}

async function formatRepositoryError(response: Response): Promise<string> {
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

  return `${fallback}: ${body}`;
}
