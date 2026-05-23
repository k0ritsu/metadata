import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const MODULES = resolve('src', 'modules');

function runModule(path: string) {
  return execFileSync(
    process.execPath,
    ['--import', './src/modules/import.ts', path],
    {
      cwd: resolve('.'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  ).trim();
}

function write(path: string, content: string) {
  writeFileSync(path, content, {
    encoding: 'utf8'
  });
}

test('loader resolves a top-level dependency from src/modules', () => {
  const prefix = `loader-test-${process.pid}-top`;

  const app = resolve(MODULES, `${prefix}-app`);
  const dependency = `${prefix}-dep`;

  const root = resolve(MODULES, dependency);

  try {
    mkdirSync(resolve(app, 'src'), {
      recursive: true
    });
    mkdirSync(resolve(root, 'src'), {
      recursive: true
    });
    write(
      resolve(root, 'src', 'value.ts'),
      `export const value = 'root';
`
    );
    write(
      resolve(app, 'src', 'main.ts'),
      `import { value } from '#modules/${dependency}/src/value.js';
console.log(value);
`
    );

    assert.equal(runModule(resolve(app, 'src', 'main.ts')), 'root');
  } finally {
    rmSync(app, {
      force: true,
      recursive: true
    });
    rmSync(root, {
      force: true,
      recursive: true
    });
  }
});

test('loader resolves the nearest nested dependency first', () => {
  const prefix = `loader-test-${process.pid}-nested`;

  const app = resolve(MODULES, `${prefix}-app`);
  const dependency = `${prefix}-dep`;
  const plugin = resolve(app, 'modules', `${prefix}-plugin`);

  const rootDependency = resolve(MODULES, dependency);
  const nestedDependency = resolve(plugin, 'modules', dependency);

  try {
    mkdirSync(resolve(plugin, 'src'), {
      recursive: true
    });
    mkdirSync(resolve(rootDependency, 'src'), {
      recursive: true
    });
    mkdirSync(resolve(nestedDependency, 'src'), {
      recursive: true
    });
    write(
      resolve(rootDependency, 'src', 'value.ts'),
      `export const value = 'root';
`
    );
    write(
      resolve(nestedDependency, 'src', 'value.ts'),
      `export const value = 'nested';
`
    );
    write(
      resolve(plugin, 'src', 'main.ts'),
      `import { value } from '#modules/${dependency}/src/value.js';
console.log(value);
`
    );

    assert.equal(runModule(resolve(plugin, 'src', 'main.ts')), 'nested');
  } finally {
    rmSync(app, {
      force: true,
      recursive: true
    });
    rmSync(rootDependency, {
      force: true,
      recursive: true
    });
  }
});

test('loader falls back from nested modules to parent modules', () => {
  const prefix = `loader-test-${process.pid}-fallback`;

  const app = resolve(MODULES, `${prefix}-app`);
  const dependency = `${prefix}-dep`;
  const plugin = resolve(app, 'modules', `${prefix}-plugin`);

  const parentDependency = resolve(app, 'modules', dependency);

  try {
    mkdirSync(resolve(plugin, 'src'), {
      recursive: true
    });
    mkdirSync(resolve(parentDependency, 'src'), {
      recursive: true
    });
    write(
      resolve(parentDependency, 'src', 'value.ts'),
      `export const value = 'parent';
`
    );
    write(
      resolve(plugin, 'src', 'main.ts'),
      `import { value } from '#modules/${dependency}/src/value.js';
console.log(value);
`
    );

    assert.equal(runModule(resolve(plugin, 'src', 'main.ts')), 'parent');
  } finally {
    rmSync(app, {
      force: true,
      recursive: true
    });
  }
});

test('loader does not resolve module aliases outside src/modules', () => {
  const root = resolve('src', `loader-test-${process.pid}-outside`);

  try {
    mkdirSync(root, {
      recursive: true
    });
    write(
      resolve(root, 'main.ts'),
      `import '#modules/missing/src/value.js';
`
    );

    assert.throws(() => {
      runModule(resolve(root, 'main.ts'));
    }, /ERR_PACKAGE_IMPORT_NOT_DEFINED/);
  } finally {
    rmSync(root, {
      force: true,
      recursive: true
    });
  }
});
