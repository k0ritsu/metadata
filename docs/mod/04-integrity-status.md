# Integrity And Status

`integrity` describes the installed or published artifact for a module key.

It does not describe the current editable working tree after local changes.
Local edits become visible through `mod status`.

## Integrity Inputs

Integrity is computed from module files on disk.

Generated files are excluded:

```text
tsconfig.json
```

Nested dependency directories are excluded:

```text
modules/
```

The result is stored as:

```text
sha512-...
```

## `mod status`

`mod status` checks only root modules listed in `modules[""].dependencies`.

For each module it:

1. resolves the physical root under `src/modules/<module>`;
2. computes current integrity from files on disk;
3. compares that value with the lockfile's `integrity`;
4. prints changed modules;
5. prints missing integrity entries as warnings;
6. prints missing root module directories.

Exit codes:

- `0`: no root module differs, and any missing integrity entries were warnings;
- `1`: at least one root module differs or is missing on disk.

Output format:

```text
<module>@<version>: integrity differs
<module>@<version>: integrity is missing
<module>@<version>: module is missing
```

Cached dependencies are not checked by `status`.
