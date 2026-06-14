# Resolution

Dependency graph construction starts from root modules.

1. Read root modules from `src/modules/<module>`.
2. Read each module's dependencies from `module.json`.
3. If the dependency exists in root with the exact requested version, use root.
4. Otherwise use `src/modules/.cache/<dependency>@<version>`.
5. Repeat recursively.

Root only wins on exact name and version match.

Commands such as `tidy`, `get`, and `remove` perform this construction and write concrete
dependency versions into `modlock.json`.

Runtime resolution does not read `module.json` and does not choose versions. It only consumes the
concrete graph already written to `modlock.json`.

## Version Conflict Example

```text
root:
  app@1.0.0
  dep@1.0.0

app@1.0.0:
  dep@2.0.0
```

`app` must resolve `dep` to:

```text
src/modules/.cache/dep@2.0.0
```

not:

```text
src/modules/dep
```

## Runtime Loader

`src/modules/import.ts`:

1. reads `src/modules/modlock.json`;
2. checks `lockfileVersion`;
3. passes the parsed lockfile to `src/modules/loader.ts`.

The loader handles imports with the `#modules/` prefix:

```ts
import { wrapper } from '#modules/metadata-http/src/wrapper.js';
```

For each module alias import, the loader:

1. determines the importing module from `parentURL`;
2. resolves that importer to a module key;
3. reads the requested dependency version from `modlock.modules[importerKey]`;
4. builds `<dependency>@<version>`;
5. resolves to root if root has the same dependency version;
6. otherwise resolves to `.cache`;
7. appends the imported path.

For importers inside cache:

```text
src/modules/.cache/metadata-http@0.1.0/src/wrapper.ts
```

the importer key is:

```text
metadata-http@0.1.0
```

The loader does not choose semver versions and does not verify installed files. Missing files fail
through Node's normal module resolution errors.
