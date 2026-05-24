# TypeScript Configs

Generated TypeScript configs must fully match runtime loader resolution.

For every reachable module key in `modlock.modules`, excluding `""`, generate:

```text
<module-root>/tsconfig.json
```

The module root is:

```text
src/modules/<module>
```

when the root set contains the same module and version, otherwise:

```text
src/modules/.cache/<module>@<version>
```

## Paths

Each generated module config must include:

- core aliases such as `#core/loader`, `#core/router`, `#core/store`;
- `#modules/<dependency>`;
- `#modules/<dependency>/*`;
- references to dependency module configs.

If runtime resolves:

```text
#modules/metadata-http
```

from:

```text
src/modules/ping
```

to:

```text
src/modules/.cache/metadata-http@0.1.0
```

then `src/modules/ping/tsconfig.json` must map:

```json
{
  "compilerOptions": {
    "paths": {
      "#modules/metadata-http": ["../.cache/metadata-http@0.1.0"],
      "#modules/metadata-http/*": ["../.cache/metadata-http@0.1.0/*"]
    }
  }
}
```

## Build Config

`tsconfig.build.json` references:

- root `tsconfig.json`;
- every reachable module `tsconfig.json`.

Unused cache modules must not be referenced.

## Invariant

```text
modlock resolution == generated tsconfig paths == runtime loader resolution
```
