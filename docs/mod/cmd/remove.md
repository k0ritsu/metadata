# `mod remove`

Removes root modules from the editable workspace.

```bash
mod remove <module>...
```

The command requires one or more module names.

## Scope

`remove` only accepts root modules:

```text
src/modules/<module>
```

It must not be used to remove cache modules directly. Cache cleanup is derived
from the dependency graph after root modules are removed.

## Root Removal

For every requested module, `remove`:

1. verifies that the module exists in the root set;
2. removes the module from `modules[""].dependencies`;
3. physically deletes `src/modules/<module>`.

If a requested module is not installed as a root module, the command fails.

## Still Needed By Other Modules

If the removed root module is still required by another reachable root module,
the same module version must remain available as a cached dependency.

Example:

```text
src/modules/app                 # depends on lib@1.0.0
src/modules/lib                 # lib@1.0.0
```

After:

```bash
mod remove lib
```

`lib@1.0.0` is no longer editable root state, but it is still required by `app`,
so it is installed in cache:

```text
src/modules/.cache/lib@1.0.0
```

If that cache directory already exists, the root copy is deleted and the cache
copy is kept.

## No Longer Needed

If the removed module is not required by any remaining root module, it is
deleted completely:

```text
src/modules/<module>
```

No cache copy is created.

## Dependency Cleanup

After root modules are removed, `remove` recalculates the reachable dependency
graph using the same rules as `tidy`.

It physically deletes cache module directories that are no longer reachable.

It also removes duplicate cache entries when the exact same module/version is
provided by a remaining root module.

Root module directories that were not explicitly requested are never deleted.

## Lockfile Updates

After cleanup, `remove` writes a flat `modlock.json` containing only reachable
modules.

The root set no longer contains removed modules:

```json
{
  "modules": {
    "": {
      "dependencies": {
        "app": "1.0.0"
      }
    }
  }
}
```

For module keys that survive, `remove` preserves:

- `resolved`;
- `integrity`.

## TypeScript Configs

`remove` regenerates TypeScript configs after the lockfile and disk layout are
updated.

Generated paths must match runtime loader resolution exactly.

## Failure Cases

`remove` fails when:

- no module names are passed;
- a requested module is not installed as a root module;
- a surviving dependency range cannot be satisfied by root or cache;
- a dependency cycle is detected;
- a module that must be moved to cache cannot be copied safely.
