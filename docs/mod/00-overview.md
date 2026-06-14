# Overview

Modules live under `src/modules`.

There are two physical module locations:

```text
src/modules/<module>
src/modules/.cache/<module>@<version>
```

Root modules are editable project modules. Cached modules are installed artifacts required by root
modules or by other cached dependencies.

The module system has one version authority:

```text
src/modules/modlock.json
```

Runtime resolution and generated TypeScript configs must follow the same lockfile graph exactly.

`get`, `download`, `remove`, and `tidy` are responsible for maintaining that graph. Build copies
manifests from the physical module layout. Publish, get, and download are responsible for writing
or verifying artifact integrity.

## Invariants

1. `modlock.json` is the only version authority.
2. Root modules are listed in `modlock.modules[""].dependencies`.
3. Non-root module keys use `<module>@<version>`.
4. A root module satisfies a dependency only when both name and version match.
5. If root and cache contain the same module version, root wins.
6. The system should not intentionally leave the same module version in both root and cache.
7. Cached modules exist only while reachable from the root graph.
8. Commands must not create nested `modules/` dependency directories.
9. Runtime loader resolution and generated TypeScript paths must match exactly.
10. Generated files, including module `tsconfig.json`, are excluded from publish archives and
    integrity checks.

## Physical Meaning

Root module:

```text
src/modules/ping
```

Cached module:

```text
src/modules/.cache/metadata-http@0.1.0
```

If a module is moved from cache to root, it becomes editable:

```text
src/modules/.cache/metadata-http@0.1.0
-> src/modules/metadata-http
```

If an editable root module is removed but still required by another root module, it moves back to
cache:

```text
src/modules/metadata-http
-> src/modules/.cache/metadata-http@0.1.0
```
