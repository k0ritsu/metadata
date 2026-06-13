# `mod create`

Creates a new empty root module.

```bash
mod create <name>
```

## Behavior

The command creates:

```text
src/modules/<name>/module.json
```

with the default version:

```json
{
  "name": "<name>",
  "description": "",
  "version": "0.1.0",
  "dependencies": {}
}
```

The default version is fixed by the command. There is no version argument.

## Lockfile

If `src/modules/modlock.json` does not exist, `create` creates a minimal lockfile:

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

Then it adds the new module to the root set:

```json
{
  "modules": {
    "": {
      "dependencies": {
        "<name>": "0.1.0"
      }
    },
    "<name>@0.1.0": {
      "dependencies": {}
    }
  }
}
```

`create` does not need to run a full dependency resolution pass. A newly created module has no
dependencies, so the command can update the lockfile directly.

## Duplicate Rules

`create` must fail when the root module directory already exists:

```text
src/modules/<name>
```

Root modules are unique by filesystem path. Two root modules with the same name cannot exist at the
same time.

If the same module name exists only in `.cache`, `create` may still create a new root module. The
new root module is a separate editable module version.

If the exact module key already exists in the lockfile, `create` must fail:

```text
<name>@0.1.0
```

## TypeScript Config

After creating the module, `create` generates that module's `tsconfig.json`.

Because the new module has no dependencies, the generated config contains only:

- core aliases;
- root project reference;
- module output paths.

It does not need to regenerate configs for unrelated modules.

## Does Not

`create` does not:

- download anything;
- install dependencies;
- modify `.cache`;
- publish the module;
- compute `integrity`;
- set `resolved`.
