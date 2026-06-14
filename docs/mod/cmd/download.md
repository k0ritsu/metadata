# `mod download`

Installs every concrete module entry from `src/modules/modlock.json`.

```bash
mod download
```

The command accepts no positional arguments.

For each non-root lockfile key, `download` reads `resolved`, downloads that archive, verifies
`integrity`, and installs it at the location selected by the root set:

```text
src/modules/<module>
src/modules/.cache/<module>@<version>
```

`download` does not remove extra root or cache directories. Use `mod tidy` to remove unused cache
entries and `mod remove` to remove root modules.

Failure cases:

- a locked module is missing `resolved`;
- a locked module is missing `integrity`;
- the archive does not contain one common root folder;
- the archive manifest identity does not match the lockfile key;
- computed integrity differs from the lockfile.
