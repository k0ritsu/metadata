import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('repo set validates ping and writes repository config', () => {
  const root = mkdtempSync(join(tmpdir(), 'metadata-mod-repo-'));
  const repoUrl = String(pathToFileURL(resolve('scripts/cmd/mod/repo.ts')));

  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
const { repo } = await import(${JSON.stringify(repoUrl)});
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  if (url.pathname !== '/ping') {
    return new Response('', { status: 404 });
  }

  return new Response(JSON.stringify({ pong: true }), {
    headers: { 'content-type': 'application/json' }
  });
};

await repo(['set', 'https://repo.local'], {
  fetch: globalThis.fetch,
  logger: console
});
`
    ],
    {
      cwd: root
    }
  );

  assert.deepEqual(readJson(join(root, 'src', 'modules', 'modrc.json')), {
    repository: 'https://repo.local'
  });
});
