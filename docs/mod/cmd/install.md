# `mod install`

Installs modules from the configured module repository.

```bash
mod install
mod install <module[@version]>...
mod install <module@range>...
```

## Modes

With no module arguments, `install` installs everything from
`src/modules/modlock.json`.

With one or more module arguments, `install` installs or updates those modules
as root modules.

## Installing From Lock

When called without arguments, `install`:

1. reads `modlock.json`;
2. for every locked module key, reads `resolved`;
3. downloads the archive;
4. verifies `integrity`;
5. installs root modules under `src/modules/<module>`;
6. installs non-root modules under `src/modules/.cache/<module>@<version>`;
7. regenerates TypeScript configs.

If a locked module has no `resolved` or no `integrity`, install must fail.

## Installing Requested Modules

When modules are passed as arguments, each requested module is installed as a
root module.

Version behavior follows npm-like rules:

- no version means latest;
- `latest` means latest;
- exact version installs that version;
- semver range installs the maximum satisfying published version.

If a root module already exists:

- when no version or `latest` is requested and the installed root is already the
  latest version, nothing is replaced;
- when an explicit version, range, or newer latest resolves to a different
  version, the root module is replaced with the resolved version.

After replacing or adding a root module, dependencies are recalculated and
reinstalled as needed.

## Promote From Cache

If the requested module version already exists in cache:

```text
src/modules/.cache/<module>@<version>
```

then install promotes it to root:

```text
src/modules/<module>
```

The cache copy must disappear.

The root set in `modlock.json` is updated to include:

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

## Dependency Installation

After installing requested root modules, install resolves their dependencies
recursively.

For each dependency:

1. if the root set contains the same module and a version satisfying the range,
   use root;
2. otherwise choose the maximum satisfying published version from the
   repository;
3. install that version under `.cache`;
4. record `resolved` and `integrity`;
5. repeat for the dependency's own dependencies.

Install must not create nested `modules/` directories.

## Lockfile Updates

For every installed artifact, install records:

```json
{
  "integrity": "sha512-...",
  "resolved": "https://repo/modules/<module>/versions/<version>/archive"
}
```

Dependency edges are then rebuilt using the same resolution rules as `tidy`.

After install completes, the lockfile must contain only reachable modules.

## Integrity

Install computes integrity from the installed module artifact and stores it in
`modlock.json`.

When installing from lock, the computed integrity must match the locked value.

## TypeScript Configs

Install regenerates TypeScript configs after all files and lockfile entries are
updated.

Generated paths must match runtime loader resolution.

## Failure Cases

Install fails when:

- repository config is missing;
- requested module does not exist in the repository;
- no published version satisfies the requested version or range;
- downloaded archive has unsafe paths;
- archive `module.json` name/version does not match the resolved module;
- locked install is missing `resolved` or `integrity`;
- integrity verification fails.
