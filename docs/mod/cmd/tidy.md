# `mod tidy`

Rebuilds module metadata from files on disk.

```bash
mod tidy
```

## Purpose

`tidy` is the consistency command for the local module workspace.

It:

- rebuilds `src/modules/modlock.json`;
- keeps only reachable cached modules in the lockfile;
- physically removes unused cache directories;
- physically removes cache entries duplicated by root modules with the same
  version;
- regenerates per-module `tsconfig.json` files;
- regenerates `tsconfig.build.json`.

Root module directories are never removed by `tidy`.

## Root Scan

The command starts from root modules only:

```text
src/modules/<module>/module.json
```

Dot-directories under `src/modules`, including `.cache`, are not root modules.

Every root module is written to:

```json
{
  "modules": {
    "": {
      "dependencies": {
        "<module>": "<version>"
      }
    }
  }
}
```

## Dependency Resolution

For each root module, and then recursively for each dependency:

1. read the dependency range from `module.json`;
2. if the root set contains the same dependency name and a version satisfying
   the range, use the root module;
3. otherwise inspect cache entries matching:

```text
src/modules/.cache/<dependency>@*/module.json
```

4. choose the maximum semver version satisfying the range;
5. fail if no root or cache module satisfies the range.

Example:

```text
app -> lib@^1.0.0

.cache/lib@1.2.0
.cache/lib@1.3.0
```

`tidy` selects:

```text
lib@1.3.0
```

## Cache Cleanup

After the reachable graph is known, `tidy` cleans `.cache`.

It removes:

- cache module directories not reachable from any root module;
- cache module directories whose exact module key is already provided by a root
  module.

Example:

```text
src/modules/lib                 # lib@1.0.0
src/modules/.cache/lib@1.0.0
```

The cache copy is redundant and must be removed:

```text
src/modules/.cache/lib@1.0.0
```

`tidy` must not remove root module directories.

## Lockfile Output

`tidy` writes a flat lockfile:

```json
{
  "lockfileVersion": 1,
  "modules": {
    "": {
      "dependencies": {
        "app": "1.0.0"
      }
    },
    "app@1.0.0": {
      "dependencies": {
        "lib": "1.3.0"
      }
    },
    "lib@1.3.0": {
      "dependencies": {}
    }
  }
}
```

Only reachable module keys are written.

## Metadata Preservation

When a module key already exists in the previous lockfile, `tidy` preserves:

- `resolved`;
- `integrity`.

The dependency map may be recalculated, but artifact metadata for the same key
must survive.

## TypeScript Configs

`tidy` regenerates TypeScript config files for all reachable modules.

For each reachable module key, excluding `""`, it writes:

```text
<resolved-module-root>/tsconfig.json
```

The generated paths must match runtime loader resolution exactly.

It also removes stale generated `tsconfig.json` files from cache modules that
are no longer reachable.

## Failure Cases

`tidy` fails when:

- a root module directory name does not match `module.json.name`;
- a cache directory name does not match `<module>@<version>` from `module.json`;
- a dependency range cannot be satisfied by root or cache;
- a dependency cycle is detected.

## Does Not

`tidy` does not:

- download modules;
- publish modules;
- recompute `integrity`;
- update `resolved`;
- remove root module directories.
