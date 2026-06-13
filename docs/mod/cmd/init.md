# `mod init`

Initializes module configuration files.

```bash
mod init --repository <url>
```

or, when `modrc.json` already exists:

```bash
mod init
```

## Purpose

`init` is a bootstrap command. It does not resolve modules and does not scan `src/modules`.

It only ensures that the configuration files exist:

```text
src/modules/modrc.json
src/modules/modlock.json
```

## Repository Config

`modrc.json` stores the module repository URL:

```json
{
  "repository": "https://repo.example"
}
```

If `modrc.json` does not exist, `--repository` is required.

If `modrc.json` exists and `--repository` is not passed, the file is left as-is.

If `modrc.json` exists and `--repository` is passed, only the repository URL is updated.

## Lockfile

If `modlock.json` does not exist, `init` creates the minimal lockfile:

```json
{
  "lockfileVersion": 1,
  "modules": {
    "": {
      "dependencies": {}
    }
  }
}
```

If `modlock.json` already exists, `init` must not rewrite it.

## Does Not

`init` does not:

- scan root modules;
- resolve dependencies;
- read `.cache`;
- download modules;
- install modules;
- remove modules;
- regenerate TypeScript configs.

Use `mod tidy` to scan local module files and rebuild module resolution.
