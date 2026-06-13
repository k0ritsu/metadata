# Lockfile

The lockfile lives at:

```text
src/modules/modlock.json
```

The current format version is:

```json
{
  "lockfileVersion": 1,
  "modules": {}
}
```

## Root Set

The empty module key `""` represents the root module set:

```json
{
  "modules": {
    "": {
      "dependencies": {
        "ping": "1.0.0"
      }
    }
  }
}
```

Root dependencies are the modules installed directly under `src/modules`.

## Module Entries

Every non-root module key uses:

```text
<module>@<version>
```

Example:

```json
{
  "modules": {
    "ping@1.0.0": {
      "dependencies": {
        "metadata-http": "0.1.0"
      },
      "integrity": "sha512-...",
      "resolved": "https://repo/modules/ping/versions/1.0.0/archive"
    }
  }
}
```

Fields:

- `dependencies`: concrete dependency versions selected for this module.
- `integrity`: checksum of the installed or published artifact.
- `resolved`: archive URL used to install this exact module version.

`dependencies` is required. `integrity` and `resolved` are optional while a module is local or not
yet published, but commands that install from lock need them.

## Reachability

The lockfile contains only:

- root set entry `""`;
- root modules;
- dependencies reachable from root modules.

Unused cache entries must be removed from the lockfile by `mod tidy` and `mod remove`.

## Metadata Preservation

When recalculating module edges, commands should preserve `integrity` and `resolved` for unchanged
module keys.

Changing local files does not update `integrity`. Publishing or installing an artifact updates it.
