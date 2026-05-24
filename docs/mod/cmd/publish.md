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

Cached dependencies cannot be published directly. If a cached dependency needs
local changes, it must first be promoted to root with `mod install` or another
root-level workflow.

## Published Version

The published module identity comes from:

```text
src/modules/<module>/module.json
```

The module key is:

```text
<name>@<version>
```

If that version already exists in the repository, publish fails. Published
versions are immutable.

## Artifact

`publish` packages the module directory and uploads it to the repository.

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

After a successful upload, `publish` updates the module entry in
`src/modules/modlock.json`.

It records:

```json
{
  "integrity": "sha512-...",
  "resolved": "https://repo/modules/<module>/versions/<version>/archive"
}
```

`integrity` is computed from the published artifact.

`resolved` is the repository URL returned by the publish API.

Dependency edges are not recalculated by publish. If dependencies changed, run
`mod tidy` before publishing.

## Status After Publish

Publishing local changes makes the current module artifact the new locked
target.

After a successful publish, `mod status` should not report an integrity
difference for that module unless files are changed again.

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
