# Module System

The module system documentation is split by responsibility:

- [Overview](mod/00-overview.md)
- [Lockfile](mod/01-lockfile.md)
- [Resolution](mod/02-resolution.md)
- [TypeScript Configs](mod/03-typescript-configs.md)
- [Integrity](mod/04-integrity.md)

## Commands

The module CLI is implemented in `scripts/mod.ts`.

- [`mod create <module>`](mod/cmd/create.md): creates a new editable root module under
  `src/modules/<module>`.
- [`mod repo get`](mod/cmd/repo.md): prints the configured repository URL.
- [`mod repo set <url>`](mod/cmd/repo.md): validates the repository with `GET /ping` and writes
  `modrc.json`.
- [`mod download`](mod/cmd/download.md): installs all locked modules from `resolved` URLs and verifies
  `integrity`.
- [`mod get <module[@version]>...`](mod/cmd/get.md): installs or updates requested modules
  as editable root modules.
- [`mod graph`](mod/cmd/graph.md): prints the selected lockfile graph.
- [`mod verify`](mod/cmd/verify.md): verifies installed modules described by the lockfile.
- [`mod why <module[@version]>`](mod/cmd/why.md): prints why a module is reachable.
- [`mod tidy`](mod/cmd/tidy.md): rebuilds `modlock.json` from root modules and reachable cached
  dependencies, cleans unused cache directories, and regenerates TypeScript configs.
- [`mod remove <module>...`](mod/cmd/remove.md): removes root modules, preserves still-needed
  modules in cache, and deletes unused cache dependencies.
- [`mod publish <module>`](mod/cmd/publish.md): publishes one root module, then updates its
  `resolved` and `integrity` in the lockfile.
- [`mod build`](mod/cmd/build.md): copies module manifests into the build output and rewrites
  runtime entry extensions to `.js`.
