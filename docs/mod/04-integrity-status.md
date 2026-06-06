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

`mod status` shows local changes in root modules by comparing files on disk with
the `integrity` values saved in `modlock.json`.

It checks only modules listed in `modules[""].dependencies`.

For each module it:

1. resolves the physical root under `src/modules/<module>`;
2. computes current integrity from files on disk;
3. compares that value with the lockfile's `integrity`;
4. prints changed modules;
5. prints missing integrity entries as warnings;
6. prints missing root module directories.

Exit codes:

- `0`: check completed. Changed modules and missing `integrity` are reported in
  output, but do not fail the command;
- `1`: a root module from `modlock.json` is missing on disk.

Output format:

```text
<module>@<version>: integrity differs
<module>@<version>: integrity is missing
<module>@<version>: module is missing
```

Cached dependencies are not checked by `status`.
