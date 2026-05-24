# `mod status`

Shows root modules whose current files differ from locked integrity.

```bash
mod status
```

## Scope

`status` checks only root modules from:

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

Cached dependencies are not checked by `status`.

The command is meant to show editable root modules that differ from their
published or installed target artifact.

## Check

For each root module, `status`:

1. resolves the physical directory:

```text
src/modules/<module>
```

2. finds the corresponding lockfile key:

```text
<module>@<version>
```

3. reads the locked `integrity`;
4. computes current integrity from files on disk;
5. prints the module only when it differs.

Generated files are excluded from integrity:

```text
tsconfig.json
```

Nested dependency directories are excluded:

```text
modules/
```

## Missing Integrity

If a root module has no locked `integrity`, `status` prints a warning.

Missing integrity does not make the command fail.

This allows newly created or unpublished local modules to exist without being
treated as broken.

## Output

Only modules with differences or warnings are printed.

Example:

```text
ping@1.0.0: integrity differs
draft@0.1.0: integrity is missing
```

When everything matches, the command prints nothing.

## Exit Codes

- `0`: no root module differs, and any missing integrity entries were warnings;
- `1`: at least one root module differs or is missing on disk.

## Does Not

`status` does not:

- check cached dependencies;
- recalculate `modlock.json`;
- update `integrity`;
- publish modules;
- install missing modules.
