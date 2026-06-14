import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

export function stringifyJson(value: unknown) {
  return JSON.stringify(value, undefined, 2);
}

export function stringifySortedJson(value: unknown) {
  return stringifyJson(sortJson(value));
}

export async function writeJsonFile(path: string, value: unknown) {
  await writeAtomicJsonFile(path, stringifySortedJson(value));
}

export async function writeOrderedJsonFile(path: string, value: unknown) {
  await writeAtomicJsonFile(path, stringifyJson(value));
}

async function writeAtomicJsonFile(path: string, content: string) {
  const parent = dirname(path);
  await mkdir(parent, {
    recursive: true
  });

  const temporaryDirectory = await mkdtemp(resolve(parent, `.mod-tmp-${basename(path)}-`));
  const temporaryPath = resolve(temporaryDirectory, basename(path));

  try {
    await writeFile(temporaryPath, content);
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryDirectory, {
      force: true,
      recursive: true
    });
  }
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJson(entry)])
    );
  }

  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}
