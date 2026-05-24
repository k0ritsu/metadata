# Module Resolution

This document describes the target module model: how modules are placed on disk,
how `modlock.json` is built, how TypeScript configs are generated, how the
runtime loader resolves imports, and what each module command is responsible
for.

## Core Model

Modules live under `src/modules`.

Root modules are editable modules installed directly under `src/modules`:

```text
src/modules/<module>
```

Cached dependencies are immutable installed module versions:

```text
src/modules/.cache/<module>@<version>
```

The root set is the list of modules the project owns directly. Cached modules
exist only because at least one root module, or one of its dependencies, needs
that exact version.

The lock file is flat. It does not mirror the filesystem as nested directories:

```json
{
  "lockfileVersion": 1,
  "modules": {
    "": {
      "dependencies": {
        "ping": "1.0.0"
      }
    },
    "ping@1.0.0": {
      "dependencies": {
        "metadata-http": "0.1.0"
      },
      "integrity": "sha512-...",
      "resolved": "https://repo/modules/ping/versions/1.0.0/archive"
    },
    "metadata-http@0.1.0": {
      "dependencies": {},
      "integrity": "sha512-...",
      "resolved": "https://repo/modules/metadata-http/versions/0.1.0/archive"
    }
  }
}
```

The empty module key `""` is the root module set. Every other key uses:

```text
<module>@<version>
```

## Resolution Rule

Resolution starts from root modules.

1. Root modules are read from `src/modules/<module>`.
2. Their dependencies are resolved recursively.
3. A dependency is placed in `.cache` unless the same module and version already
   exists in the root set.
4. If the same module exists in the root set but with a different version, that
   root module must not satisfy the dependency. The required version is resolved
   from `.cache`.

Example:

```text
root:
  a@1.0.0
  app@1.0.0

app@1.0.0:
  a@2.0.0
```

Runtime and TypeScript resolution for `app` must use:

```text
src/modules/.cache/a@2.0.0
```

not:

```text
src/modules/a
```

Root modules are preferred only on exact module name and version match.

## Runtime Loader

The runtime loader is registered by `src/modules/import.ts`.

`import.ts`:

1. reads `src/modules/modlock.json`;
2. checks `lockfileVersion`;
3. passes the parsed lock file to `src/modules/loader.ts`.

The loader handles aliases with the `#modules/` prefix:

```ts
import { wrapper } from '#modules/metadata-http/src/wrapper.js';
```

For every module alias import, the loader:

1. determines the importing module from `parentURL`;
2. resolves that importer to a module key;
3. reads the requested dependency version from `modlock.modules[importerKey]`;
4. builds the dependency key `<dependency>@<version>`;
5. chooses the physical root:
   - `src/modules/<dependency>` if the root set contains that same version;
   - otherwise `src/modules/.cache/<dependency>@<version>`;
6. appends the imported path.

For importers inside `.cache`, the importer key is taken from the cache
directory name:

```text
src/modules/.cache/metadata-http@0.1.0/src/wrapper.ts
```

uses importer key:

```text
metadata-http@0.1.0
```

The loader also rewrites runtime `.js` specifiers to the current runtime
extension. In development this lets TypeScript source files import `.js`
specifiers while Node executes `.ts` files. In production the same imports
resolve to compiled `.js` files.

The loader does not choose semver versions and does not verify installed files.
It follows `modlock.json`. Missing files should fail through Node's normal
module resolution errors.

## TypeScript Config Generation

TypeScript config generation must fully match runtime loader resolution.

For each reachable module key in `modlock.modules`, excluding the root key `""`,
the generated module `tsconfig.json` must:

- include core aliases such as `#core/loader`, `#core/router`, `#core/store`;
- include `#modules/<dependency>` aliases for that module's locked dependencies;
- point each dependency alias at the exact physical directory the runtime loader
  would choose;
- include project references to those dependency module configs;
- write build output under the matching `dist/modules/...` directory.

If runtime would resolve:

```text
#modules/metadata-http
```

from:

```text
src/modules/ping
```

to:

```text
src/modules/.cache/metadata-http@0.1.0
```

then `src/modules/ping/tsconfig.json` must map:

```json
{
  "compilerOptions": {
    "paths": {
      "#modules/metadata-http": ["../.cache/metadata-http@0.1.0"],
      "#modules/metadata-http/*": ["../.cache/metadata-http@0.1.0/*"]
    }
  }
}
```

The required invariant is:

```text
modlock resolution == generated tsconfig paths == runtime loader resolution
```

## Commands

### `mod build`

Copies every reachable module's `module.json` into the corresponding build
directory under `dist/modules`.

Examples:

```text
src/modules/ping/module.json
-> dist/modules/ping/module.json

src/modules/.cache/metadata-http@0.1.0/module.json
-> dist/modules/.cache/metadata-http@0.1.0/module.json
```

`build` does not resolve versions and does not modify `modlock.json`.

### `mod create <name>`

Creates a new empty root module:

```text
src/modules/<name>/module.json
```

It also adds the module to the root set in `modlock.json`.

`create` does not install dependencies.

### `mod init [--repository <url>]`

Initializes module configuration.

It:

1. creates `src/modules/modrc.json` if it does not exist;
2. creates `src/modules/modlock.json` if it does not exist;
3. rewrites `modrc.json` with the passed repository URL when `--repository` is
   provided.

`init` should not download modules. It should not replace `tidy` as the command
that recalculates dependency resolution.

### `mod install [module[@version] ...]`

With no module arguments, installs every module from `modlock.json`.

It:

1. reads each locked module's `resolved` URL;
2. downloads the archive;
3. verifies `integrity`;
4. places root modules under `src/modules/<module>`;
5. places cached dependencies under `src/modules/.cache/<module>@<version>`.

With one or more module arguments, installs those modules as root modules.

It:

1. resolves each requested module from the configured module repository;
2. downloads the archive;
3. computes `integrity`;
4. records `resolved` and `integrity` in `modlock.json`;
5. installs the module under `src/modules/<module>`;
6. installs dependencies into `.cache` unless the same module and version is
   already present in the root set.

If the requested module is already installed in `.cache`, `install` promotes it
to the root level:

```text
src/modules/.cache/<module>@<version>
```

becomes:

```text
src/modules/<module>
```

The lock file root set must be updated accordingly.

### `mod remove <module...>`

Requires one or more module names. It removes only root modules.

For each requested root module:

1. remove it from `src/modules/<module>`;
2. remove it from `modlock.modules[""].dependencies`;
3. if another remaining module still depends on the same module and version,
   move it into `.cache` instead of deleting it;
4. delete dependencies that are no longer reachable from any root module;
5. regenerate `modlock.json`;
6. regenerate TypeScript configs.

`remove` must not remove a module from `.cache` directly by name. Cache contents
are derived from root modules and their reachable dependencies.

### `mod status`

Checks installed modules against the `integrity` values recorded in
`modlock.json`.

It:

1. reads every reachable locked module except the root key `""`;
2. resolves each module to the same physical directory the runtime loader would
   use;
3. computes the current module integrity from files on disk;
4. ignores generated files such as `tsconfig.json`;
5. prints modules whose current integrity differs from the lock;
6. prints modules that are missing an `integrity` value;
7. prints modules that are present in the lock but missing from disk.

`status` does not modify files and does not update `modlock.json`.

Local edits to a root module should show up as an integrity difference until the
module is published and the lock is updated with the new artifact integrity.

### `mod publish [module]`

Packages one module and uploads it to the configured repository.

Published archives include the module's source and `module.json`, but exclude
generated files such as:

```text
tsconfig.json
```

After publish, the module's `resolved` and `integrity` values in `modlock.json`
must be updated to match the published artifact.

Local edits do not automatically change `integrity`. `integrity` describes the
installed or published artifact, not the current working tree state.

### `mod tidy`

Rebuilds `modlock.json` from module files on disk.

It:

1. reads root modules from `src/modules/<module>/module.json`;
2. writes those modules into `modlock.modules[""].dependencies`;
3. recursively reads each module's dependencies;
4. resolves dependencies to root modules when the root has the same module and
   version;
5. otherwise resolves dependencies from `src/modules/.cache/<module>@<version>`;
6. writes only reachable modules into `modlock.modules`;
7. preserves existing `resolved` and `integrity` values for module keys already
   present in the previous lock file;
8. removes unused cached modules from the lock file;
9. regenerates per-module `tsconfig.json` files;
10. regenerates `tsconfig.build.json`.

`tidy` should not scan all cached modules eagerly. It should start from root
modules and read cached modules only when a reachable dependency needs them.

## Practical Rules

- Root modules are editable.
- Cached modules are installed artifacts.
- `modlock.json` is the version authority.
- Runtime loader and generated TypeScript configs must resolve modules the same
  way.
- Do not place dependencies in nested `modules/` directories.
- Do not let a root module satisfy a dependency unless both name and version
  match.
- Use `mod tidy` after editing module manifests or moving modules by hand.
- Use `mod status` to check which installed modules differ from their locked
  artifact integrity.
