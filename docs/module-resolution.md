# Module System

The module system documentation is split by responsibility:

- [Overview](mod/00-overview.md)
- [Lockfile](mod/01-lockfile.md)
- [Resolution](mod/02-resolution.md)
- [TypeScript Configs](mod/03-typescript-configs.md)
- [Integrity](mod/04-integrity.md)

## Commands

The module CLI is implemented in `scripts/mod.ts`.

- [`mod init`](mod/cmd/init.md): initializes `modrc.json` and creates a minimal `modlock.json` when
  it does not exist.
- [`mod create <module>`](mod/cmd/create.md): creates a new editable root module under
  `src/modules/<module>`.
- [`mod install`](mod/cmd/install.md): installs all locked modules from `resolved` URLs and verifies
  `integrity`.
- [`mod install <module[@version]>...`](mod/cmd/install.md): installs or updates requested modules
  as editable root modules.
- [`mod tidy`](mod/cmd/tidy.md): rebuilds `modlock.json` from root modules and reachable cached
  dependencies, cleans unused cache directories, and regenerates TypeScript configs.
- [`mod remove <module>...`](mod/cmd/remove.md): removes root modules, preserves still-needed
  modules in cache, and deletes unused cache dependencies.
- [`mod publish <module>`](mod/cmd/publish.md): publishes one root module, then updates its
  `resolved` and `integrity` in the lockfile.
- [`mod build`](mod/cmd/build.md): copies module manifests into the build output and rewrites
  runtime entry extensions to `.js`.
