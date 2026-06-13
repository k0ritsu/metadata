# `mod publish`

Publishes one root module to the configured module repository.

```bash
mod publish <module>
```

## Scope

`publish` only works with root modules:

```text
src/modules/<module>
```

The command requires exactly one module name.

Cached dependencies cannot be published directly. If a cached dependency needs local changes, it
must first be promoted to root with `mod install` or another root-level workflow.

## Published Version

The published module identity comes from:

```text
src/modules/<module>/module.json
```

The module key is:

```text
<name>@<version>
```

If that version already exists in the repository, publish fails. Published versions are immutable.

## Artifact

Before packaging or uploading, `publish` validates local state:

- the module exists as a root module in `modlock.json`;
- `<module>@<version>` exists in `modlock.json`;
- the dependency graph in `modlock.json` matches what `mod tidy` would produce.

If the graph is stale, run `mod tidy` before publishing.

`publish` packages the module directory and uploads it to the repository only after local preflight
succeeds.

Generated files are not part of the artifact:

```text
tsconfig.json
```

Nested dependency directories are not part of the artifact:

```text
modules/
```

The same file set is used for `integrity`.

## Lockfile Updates

After a successful upload, `publish` updates the module entry in `src/modules/modlock.json`.

It records:

```json
{
  "integrity": "sha512-...",
  "resolved": "https://repo/modules/<module>/versions/<version>/archive"
}
```

`integrity` is computed from the published artifact.

`resolved` is the repository URL returned by the publish API.

Dependency edges are not recalculated by publish. If dependencies changed, run `mod tidy` before
publishing.

If the repository upload succeeds but the local lockfile update fails, the command prints the
returned archive URL and a recovery note. Record that URL manually, or rerun `mod publish <module>`
only when the repository accepts idempotent same-version publishes.

## Integrity After Publish

Publishing local changes makes the uploaded module artifact the new locked target.

After a successful publish, the module entry in `modlock.json` stores the integrity computed from
that artifact. Later local edits do not update the lockfile until the module is published or
installed again.

## Does Not

`publish` does not:

- publish cached dependencies;
- publish multiple modules at once;
- infer a new version;
- overwrite an existing published version;
- rebuild the dependency graph;
- install dependencies.

## Failure Cases

`publish` fails when:

- no module name is passed;
- more than one module name is passed;
- the module is not installed as a root module;
- `module.json.name` does not match the root directory name;
- the target version already exists in the repository;
- repository config is missing;
- the repository upload fails;
- the repository does not return a `resolved` URL;
- the artifact cannot be packaged safely.
