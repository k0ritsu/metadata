# Module Resolution

This document describes how module versions are resolved, how modules are placed
on disk, how TypeScript configs are generated, and how the runtime loader
resolves module imports.

## Core Model

Modules live under `src/modules`.

Top-level modules are installed at:

```text
src/modules/<module>
```

Nested dependencies are installed under the consuming module:

```text
src/modules/<consumer>/modules/<dependency>
src/modules/<consumer>/modules/<nested>/modules/<dependency>
```

The physical directory tree is the source of truth for TypeScript and runtime
resolution. Version selection is handled by install/init logic, not by
TypeScript config generation or the runtime loader.

## Version Resolution in Commands

### Shared Terms

Dependency versions are declared in `module.json`:

```json
{
  "dependencies": {
    "metadata-http": "^1.0.0"
  }
}
```

The value is a semver range. A concrete installed module version satisfies a
dependency when:

```text
semver.satisfies(installed.version, declaredRange)
```

A conflict occurs when the first visible installed module with the requested
name does not satisfy the declared range.

### Candidate Order

For a consumer at:

```text
src/modules/app/modules/plugin
```

and dependency `lib`, the candidate order is:

```text
src/modules/app/modules/plugin/modules/lib
src/modules/app/modules/lib
src/modules/lib
```

For a top-level consumer at:

```text
src/modules/app
```

the candidate order is:

```text
src/modules/app/modules/lib
src/modules/lib
```

This order is used by command-side validation, TypeScript config generation, and
the runtime loader. The difference is what each subsystem does with the
candidates.

### `mod install <module[@version]>`

Directly requested modules are installed at the top level:

```text
src/modules/<module>
```

Their dependencies are then resolved recursively.

For each dependency:

1. Build the filesystem candidate list for the current consumer.
2. Scan candidates from nearest to root.
3. If no candidate exists yet, install the resolved dependency version at the
   root-level candidate when no conflict has been encountered.
4. If a candidate exists and its version satisfies the requested range, reuse
   it.
5. If a candidate exists and its version does not satisfy the requested range,
   install the dependency in the current consumer's local `modules` directory.
6. Recurse into the dependency's own dependencies.

Example:

```text
app -> lib@^1
tool -> lib@^2
```

If `app` is processed first, `lib@1.x` can be installed at:

```text
src/modules/lib
```

When `tool` asks for `lib@^2`, the root `lib@1.x` conflicts, so `lib@2.x` is
installed at:

```text
src/modules/tool/modules/lib
```

Nested conflicts stay local to the nested consumer. If:

```text
app -> lib@^1
app -> plugin@^1
plugin -> lib@^2
```

then `plugin` must not place `lib@2.x` in `app/modules/lib`, because that would
shadow `app`'s own dependency lookup. The conflicting version belongs at:

```text
src/modules/app/modules/plugin/modules/lib
```

### `mod install` Without Arguments

When called without module specs, `mod install` reads `src/modules/modlock.json`
and installs the locked tree.

The lock tree mirrors the intended filesystem layout:

```json
{
  "app": {
    "dependencies": {
      "plugin": {
        "dependencies": {},
        "name": "plugin",
        "version": "1.0.0"
      }
    },
    "name": "app",
    "version": "1.0.0"
  }
}
```

Top-level keys are placed under `src/modules`. Nested `dependencies` are placed
under the owning module's `modules` directory unless a visible compatible
version already satisfies that locked dependency.

### `mod init`

`mod init` does not download modules. It reads the current filesystem tree and
regenerates:

- `src/modules/modlock.json`
- `src/modules/modrc.json`
- per-module `tsconfig.json` files
- `tsconfig.build.json`

For lock generation, `init` validates dependency ranges against the filesystem
layout:

1. Load every `module.json` under `src/modules/**`.
2. Treat only direct children of `src/modules` as lock roots.
3. For each dependency edge, scan candidates from nearest to root.
4. The first existing candidate with that name must satisfy the declared semver
   range.
5. If no candidate is found, fail.
6. If the first candidate is incompatible, fail.
7. If a dependency cycle is detected, fail.

This makes `init` the consistency check for manually edited module trees.

### `mod remove`

`mod remove <module>` removes only top-level modules.

After removal it rebuilds the remaining lock tree and synchronizes the
filesystem:

1. Remove the requested root nodes from the lock.
2. Collect dependency versions still required by remaining root modules.
3. Hoist a dependency to `src/modules/<dependency>` only when exactly one
   version of that dependency remains and no root module already occupies that
   name.
4. Move existing matching module directories where possible instead of
   re-downloading.
5. Remove stale directories that are no longer represented by the next lock.
6. Regenerate TypeScript configs.

### `mod create`

`mod create <name>` creates a new top-level module:

```text
src/modules/<name>/module.json
```

It creates a minimal manifest and regenerates TypeScript config for that module.
It does not resolve or install dependencies.

### `mod build`

`mod build` copies module manifests into `dist/modules` and rewrites TypeScript
`main` entries to JavaScript entries when needed.

It does not resolve versions and does not change dependency placement.

### `mod publish`

`mod publish [module]` packages one module and uploads it to the configured
repository.

Published archives exclude:

- nested `modules` directories
- generated module `tsconfig.json`

Dependencies are published as manifest ranges, not as vendored module
directories.

## TypeScript Config Generation

Each installed module gets its own generated `tsconfig.json`.

The generator creates:

- core aliases such as `#core/loader`
- module aliases such as `#modules/<dependency>`
- TypeScript project references to resolved dependencies
- output paths under `dist/modules`

TypeScript dependency resolution follows the filesystem, not semver.

For each declared dependency in a module's `module.json`:

1. Build the same candidate list used by the loader.
2. Pick the first candidate directory that exists and contains a module.
3. Generate `paths` for that physical directory.
4. Add a project reference to that module's generated `tsconfig.json`.
5. If no candidate exists, fail.

The generator does not search for a better semver-compatible version. If the
nearest physical module has the wrong version, that is an invalid installation
layout and must be caught by `install` or `init`.

Example for:

```text
src/modules/app/modules/plugin
```

with dependency `lib`, if this exists:

```text
src/modules/app/modules/plugin/modules/lib
```

then `plugin/tsconfig.json` maps:

```json
{
  "compilerOptions": {
    "paths": {
      "#modules/lib": ["./modules/lib"],
      "#modules/lib/*": ["./modules/lib/*"]
    }
  }
}
```

If the local dependency does not exist but this does:

```text
src/modules/app/modules/lib
```

then the generated path points to the parent dependency instead.

## Runtime Loader

The runtime loader is registered from `src/modules/import.ts`.

It handles imports with the module alias prefix:

```ts
import { wrapper } from '#modules/metadata-http/src/wrapper.js';
```

The loader does not resolve versions. It only repeats the filesystem lookup that
TypeScript config generation used.

For an importer at:

```text
src/modules/app/modules/plugin/src/main.ts
```

and specifier:

```text
#modules/lib/src/value.js
```

the loader checks:

```text
src/modules/app/modules/plugin/modules/lib/src/value.ts
src/modules/app/modules/lib/src/value.ts
src/modules/lib/src/value.ts
```

The first existing file wins.

The loader also rewrites runtime `.js` specifiers to the current runtime
extension. In development this allows source files to import `.js` specifiers
while Node executes `.ts` files. In production the same imports resolve to
compiled `.js` files.

The loader only applies module alias resolution for importers inside
`src/modules`. Imports outside `src/modules` are passed to Node's normal
resolver.

## How the Pieces Fit Together

The module system has one version authority and two filesystem consumers.

Version authority:

- `mod install` chooses concrete versions and places dependencies on disk.
- `mod init` validates the current filesystem layout and writes the lock file.

Filesystem consumers:

- TypeScript config generation maps aliases to the first visible dependency
  directory.
- The runtime loader resolves aliases to the first visible dependency file.

The required invariant is:

```text
install/init layout == generated tsconfig paths == runtime loader lookup
```

If this invariant holds:

- TypeScript compiles against the same dependency copy that runtime will load.
- Runtime does not need to know semver policy.
- Version conflicts are expressed only through the filesystem tree.
- The lock file documents the tree that commands should recreate.

If the invariant is broken:

- `mod init` should fail when dependency ranges do not match the physical tree.
- TypeScript generation may fail when a declared dependency is missing.
- The runtime loader may fail when no matching file exists for an alias import.

## Practical Rules

- Use `mod install` to add modules and dependencies when possible.
- Run `mod init` after manually editing module manifests or moving module
  directories.
- Do not manually place a conflicting dependency in a parent module's `modules`
  directory if that dependency belongs to a nested module.
- Do not rely on TypeScript or the runtime loader to choose semver-compatible
  versions. They intentionally follow the filesystem only.
- Published module archives must not contain installed dependency directories.
