# `mod build`

Copies module manifests into the build output.

```bash
mod build
```

## Purpose

TypeScript compilation moves executable files into the build directory, but
module metadata must be present there too.

`build` copies every installed module manifest from `src/modules` into the
matching build location.

## Source Modules

`build` processes all module directories on disk:

```text
src/modules/<module>/module.json
src/modules/.cache/<module>@<version>/module.json
```

This is intentionally broader than the reachable lockfile graph. If a module
exists on disk, its manifest is copied.

Dot-directories other than `.cache` are ignored.

## Destination Layout

Root module manifests are copied to:

```text
<build>/modules/<module>/module.json
```

Cached dependency manifests are copied to:

```text
<build>/modules/.cache/<module>@<version>/module.json
```

The build output must preserve the same root/cache shape as `src/modules`.

## Manifest Rewriting

`build` rewrites runtime entry fields from TypeScript extensions to JavaScript
extensions.

Example:

```json
{
  "main": "index.ts"
}
```

becomes:

```json
{
  "main": "index.js"
}
```

If the entry already uses `.js`, it is copied as-is.

Only runtime file references are rewritten. Names, versions, dependencies,
exports, and artifact metadata are not recalculated by `build`.

## No Cleanup

`build` does not clean stale manifests from the build directory.

Full build-output cleanup can be handled by a separate command or by removing
the whole build directory before compilation.

## Does Not

`build` does not:

- rebuild `modlock.json`;
- resolve dependencies;
- install modules;
- verify `integrity`;
- publish modules;
- remove stale build files.

## Failure Cases

`build` fails when:

- an installed module has no `module.json`;
- a root module directory name does not match `module.json.name`;
- a cache directory name does not match `<module>@<version>` from `module.json`;
- a manifest entry path cannot be safely rewritten.
