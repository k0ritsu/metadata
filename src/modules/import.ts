import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Modlock } from './loader.ts';

const MODLOCK = 'modlock.json';
const LOCKFILE_VERSION = 1;

const EXTENSION = extname(import.meta.filename);

const modlock: Modlock = JSON.parse(
  await readFile(resolve(import.meta.dirname, MODLOCK), {
    encoding: 'utf8'
  })
);

if (modlock.lockfileVersion !== LOCKFILE_VERSION) {
  throw new Error(
    `${MODLOCK}: unsupported lockfile version ${modlock.lockfileVersion}; expected ${LOCKFILE_VERSION}`
  );
}

const specifier = resolve(import.meta.dirname, `loader${EXTENSION}`);
register(specifier, {
  parentURL: pathToFileURL('.'),
  data: {
    modlock
  }
});
