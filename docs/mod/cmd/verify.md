# `mod verify`

Verifies installed modules described by `src/modules/modlock.json`.

```bash
mod verify
```

The lockfile is the source of truth. Extra directories in `src/modules` or `.cache` are ignored.

`verify` checks:

- every dependency edge points to a lockfile entry;
- each described module has a matching `module.json`;
- locked integrity matches files on disk when integrity is present.
