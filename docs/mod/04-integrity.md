# Integrity

`integrity` describes the installed or published artifact for a module key.

It does not describe the current editable working tree after local changes. Local edits are folded
back into the lockfile only when a command publishes or installs an artifact and writes a new
artifact checksum.

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

## Writers

Commands write `integrity` only when they materialize an artifact boundary:

- `mod install` computes integrity for installed archives and verifies it during lockfile installs;
- `mod publish` computes integrity from the uploaded artifact and stores it after a successful
  publish.

`mod tidy` preserves existing integrity for unchanged module keys but does not recompute it.
