import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const MODULES = resolve('src', 'modules');
const MODLOCK = resolve(MODULES, 'modlock.json');

interface Modlock {
  lockfileVersion: number;
  modules: Record<
    string,
    {
      dependencies: Record<string, string>;
      integrity?: string;
      resolved?: string;
    }
  >;
}

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
  mkdirSync(dirname(path), {
    recursive: true
  });
  writeFileSync(path, content, {
    encoding: 'utf8'
  });
}

function writeModuleManifest(root: string, name: string, version: string) {
  write(
    resolve(root, 'module.json'),
    JSON.stringify(
      {
        name,
        description: '',
        version
      },
      undefined,
      2
    )
  );
}

function writeModlock(modules: Modlock['modules']) {
  writeRawModlock({
    lockfileVersion: 1,
    modules
  });
}

function writeRawModlock(modlock: Modlock) {
  writeFileSync(MODLOCK, JSON.stringify(modlock, undefined, 2), {
    encoding: 'utf8'
  });
}

function withModlock<T>(modules: Modlock['modules'], callback: () => T) {
  const previous = readFileSync(MODLOCK, 'utf8');

  try {
    writeModlock(modules);

    return callback();
  } finally {
    writeFileSync(MODLOCK, previous, {
      encoding: 'utf8'
    });
  }
}

function withRawModlock<T>(modlock: Modlock, callback: () => T) {
  const previous = readFileSync(MODLOCK, 'utf8');

  try {
    writeRawModlock(modlock);

    return callback();
  } finally {
    writeFileSync(MODLOCK, previous, {
      encoding: 'utf8'
    });
  }
}

test('loader resolves a root module dependency from .cache', () => {
  const prefix = `loader-test-${process.pid}-root`;

  const appName = `${prefix}-app`;
  const dependencyName = `${prefix}-dep`;

  const app = resolve(MODULES, appName);
  const dependency = resolve(MODULES, '.cache', `${dependencyName}@1.0.0`);

  try {
    writeModuleManifest(app, appName, '1.0.0');
    writeModuleManifest(dependency, dependencyName, '1.0.0');
    write(
      resolve(dependency, 'src', 'value.ts'),
      `export const value = 'locked';
`
    );
    write(
      resolve(app, 'src', 'main.ts'),
      `import { value } from '#modules/${dependencyName}/src/value.js';
console.log(value);
`
    );

    withModlock(
      {
        '': {
          dependencies: {
            [appName]: '1.0.0'
          }
        },
        [`${appName}@1.0.0`]: {
          dependencies: {
            [dependencyName]: '1.0.0'
          }
        },
        [`${dependencyName}@1.0.0`]: {
          dependencies: {}
        }
      },
      () => {
        assert.equal(runModule(resolve(app, 'src', 'main.ts')), 'locked');
      }
    );
  } finally {
    rmSync(app, {
      force: true,
      recursive: true
    });
    rmSync(dependency, {
      force: true,
      recursive: true
    });
  }
});

test('loader resolves transitive dependencies from the importing module key', () => {
  const prefix = `loader-test-${process.pid}-transitive`;

  const appName = `${prefix}-app`;
  const wrapperName = `${prefix}-wrapper`;
  const valueName = `${prefix}-value`;

  const app = resolve(MODULES, appName);
  const wrapper = resolve(MODULES, '.cache', `${wrapperName}@1.0.0`);
  const value = resolve(MODULES, '.cache', `${valueName}@2.0.0`);

  try {
    writeModuleManifest(app, appName, '1.0.0');
    writeModuleManifest(wrapper, wrapperName, '1.0.0');
    writeModuleManifest(value, valueName, '2.0.0');
    write(
      resolve(value, 'src', 'value.ts'),
      `export const value = 'transitive';
`
    );
    write(
      resolve(wrapper, 'src', 'wrapper.ts'),
      `import { value } from '#modules/${valueName}/src/value.js';
export const wrapped = value;
`
    );
    write(
      resolve(app, 'src', 'main.ts'),
      `import { wrapped } from '#modules/${wrapperName}/src/wrapper.js';
console.log(wrapped);
`
    );

    withModlock(
      {
        '': {
          dependencies: {
            [appName]: '1.0.0'
          }
        },
        [`${appName}@1.0.0`]: {
          dependencies: {
            [wrapperName]: '1.0.0'
          }
        },
        [`${wrapperName}@1.0.0`]: {
          dependencies: {
            [valueName]: '2.0.0'
          }
        },
        [`${valueName}@2.0.0`]: {
          dependencies: {}
        }
      },
      () => {
        assert.equal(runModule(resolve(app, 'src', 'main.ts')), 'transitive');
      }
    );
  } finally {
    rmSync(app, {
      force: true,
      recursive: true
    });
    rmSync(wrapper, {
      force: true,
      recursive: true
    });
    rmSync(value, {
      force: true,
      recursive: true
    });
  }
});

test('loader resolves a promoted dependency from src/modules', () => {
  const prefix = `loader-test-${process.pid}-promoted`;

  const appName = `${prefix}-app`;
  const dependencyName = `${prefix}-dep`;

  const app = resolve(MODULES, appName);
  const promotedDependency = resolve(MODULES, dependencyName);

  try {
    writeModuleManifest(app, appName, '1.0.0');
    writeModuleManifest(promotedDependency, dependencyName, '1.0.0');
    write(
      resolve(promotedDependency, 'src', 'value.ts'),
      `export const value = 'promoted';
`
    );
    write(
      resolve(app, 'src', 'main.ts'),
      `import { value } from '#modules/${dependencyName}/src/value.js';
console.log(value);
`
    );

    withModlock(
      {
        '': {
          dependencies: {
            [appName]: '1.0.0',
            [dependencyName]: '1.0.0'
          }
        },
        [`${appName}@1.0.0`]: {
          dependencies: {
            [dependencyName]: '1.0.0'
          }
        },
        [`${dependencyName}@1.0.0`]: {
          dependencies: {}
        }
      },
      () => {
        assert.equal(runModule(resolve(app, 'src', 'main.ts')), 'promoted');
      }
    );
  } finally {
    rmSync(app, {
      force: true,
      recursive: true
    });
    rmSync(promotedDependency, {
      force: true,
      recursive: true
    });
  }
});

test('loader uses cached dependency when root has a different version', () => {
  const prefix = `loader-test-${process.pid}-conflict`;

  const appName = `${prefix}-app`;
  const rootDependencyName = `${prefix}-dep`;

  const app = resolve(MODULES, appName);
  const rootDependency = resolve(MODULES, rootDependencyName);
  const cachedDependency = resolve(
    MODULES,
    '.cache',
    `${rootDependencyName}@2.0.0`
  );

  try {
    writeModuleManifest(app, appName, '1.0.0');
    writeModuleManifest(rootDependency, rootDependencyName, '1.0.0');
    writeModuleManifest(cachedDependency, rootDependencyName, '2.0.0');
    write(
      resolve(rootDependency, 'src', 'value.ts'),
      `export const value = 'root-v1';
`
    );
    write(
      resolve(cachedDependency, 'src', 'value.ts'),
      `export const value = 'cached-v2';
`
    );
    write(
      resolve(app, 'src', 'main.ts'),
      `import { value } from '#modules/${rootDependencyName}/src/value.js';
console.log(value);
`
    );

    withModlock(
      {
        '': {
          dependencies: {
            [appName]: '1.0.0',
            [rootDependencyName]: '1.0.0'
          }
        },
        [`${appName}@1.0.0`]: {
          dependencies: {
            [rootDependencyName]: '2.0.0'
          },
          integrity: 'sha512-'
        },
        [`${rootDependencyName}@1.0.0`]: {
          dependencies: {},
          integrity: 'sha512-'
        },
        [`${rootDependencyName}@2.0.0`]: {
          dependencies: {},
          integrity: 'sha512-'
        }
      },
      () => {
        assert.equal(runModule(resolve(app, 'src', 'main.ts')), 'cached-v2');
      }
    );
  } finally {
    rmSync(app, {
      force: true,
      recursive: true
    });
    rmSync(rootDependency, {
      force: true,
      recursive: true
    });
    rmSync(cachedDependency, {
      force: true,
      recursive: true
    });
  }
});

test('loader resolves core aliases inside modules', () => {
  const appName = `loader-test-${process.pid}-core`;
  const app = resolve(MODULES, appName);

  try {
    writeModuleManifest(app, appName, '1.0.0');
    write(
      resolve(app, 'src', 'main.ts'),
      `import { DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT } from '#core/constants.js';
import { Conflict } from '#core/errors/conflict.js';
import { NotFound } from '#core/errors/not-found.js';

console.log(
  [
    new NotFound().status,
    new Conflict().status,
    DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT
  ].join(':')
);
`
    );

    withModlock(
      {
        '': {
          dependencies: {
            [appName]: '1.0.0'
          }
        },
        [`${appName}@1.0.0`]: {
          dependencies: {}
        }
      },
      () => {
        assert.equal(
          runModule(resolve(app, 'src', 'main.ts')),
          '404:409:60000'
        );
      }
    );
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

test('loader import rejects unsupported lockfile versions', () => {
  const root = resolve('src', `loader-test-${process.pid}-version`);

  try {
    write(
      resolve(root, 'main.ts'),
      `console.log('loaded');
`
    );

    withRawModlock(
      {
        lockfileVersion: 2,
        modules: {
          '': {
            dependencies: {}
          }
        }
      },
      () => {
        assert.throws(() => {
          runModule(resolve(root, 'main.ts'));
        }, /unsupported lockfile version 2; expected 1/);
      }
    );
  } finally {
    rmSync(root, {
      force: true,
      recursive: true
    });
  }
});
