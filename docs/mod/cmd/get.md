# `mod get`

Installs or updates root modules from the configured repository.

```bash
mod get <module[@version]>...
mod get <module@range>...
```

Version selection:

- no version or `latest` selects the maximum published semver from the repository;
- exact versions install that version;
- ranges install the maximum published version satisfying the range.

For direct `mod get <module>`, latest is always determined by the repository. Cache does not prove
which version is latest.

If the selected exact version already exists in:

```text
src/modules/.cache/<module>@<version>
```

the module is promoted to:

```text
src/modules/<module>
```

without downloading the archive again.

After installing requested root modules, `get` resolves dependencies recursively. Resolution checks
root exact matches first, then cache, then the repository. Installed artifacts record local
`integrity` and `resolved` from the repository version metadata `archiveUrl`.

Failure cases:

- repository config is missing;
- no module names are passed;
- a requested version or range is invalid;
- no published version satisfies the request;
- repository version metadata does not include `archiveUrl`;
- downloaded archive is unsafe or has the wrong manifest identity.
