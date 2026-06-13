# Metadata

Modular metadata management system built on Node.js and TypeScript.

The application starts an HTTP server, loads root modules from `src/modules/*/module.json`, and lets
runnable modules register routes through a shared runtime context.

## Requirements

- Node.js `24.16.0`
- npm
- Docker and Docker Compose, optional

## Setup

Install dependencies:

```bash
npm ci
```

Create a local environment file:

```bash
cp .env.example .env
```

Required application variables:

| Variable          | Description                                            | Example    |
| ----------------- | ------------------------------------------------------ | ---------- |
| `APP_NAME`        | Application name used in startup logs                  | `metadata` |
| `APP_VERSION`     | Application version used in startup logs               | `1.0.0`    |
| `HTTP_PORT`       | HTTP server port                                       | `3000`     |
| `USE_PARALLELISM` | Start one worker per available CPU when `true`         | `false`    |
| `LOG_LEVEL`       | Minimum log level: `debug`, `info`, `warn`, or `error` | `debug`    |

## Development

Run the application in watch mode:

```bash
npm run dev
```

The development command loads `.env` and registers the module loader from `src/modules/import.ts`,
so module imports can use the same `.js` specifiers that are emitted for production builds.

Check the server:

```bash
curl http://localhost:3000/ping
```

## Build and Run

Build the project:

```bash
npm run build
```

The build script compiles the root project and every generated module `tsconfig.json`. It also runs
the module build step, which copies each `module.json` file into `dist/modules` and keeps runtime
`main` entries using `.js` extensions.

Start the compiled application:

```bash
npm start
```

Run with Docker Compose:

```bash
docker compose up --build
```

## Module System

Modules live under `src/modules`.

Editable root modules are installed directly under:

```text
src/modules/<module>
```

Cached dependencies are installed under:

```text
src/modules/.cache/<module>@<version>
```

The version authority is:

```text
src/modules/modlock.json
```

Root modules are listed in `modlock.modules[""].dependencies`. Every concrete module version has a
flat lockfile key:

```text
<module>@<version>
```

Each module is described by a `module.json` file:

```json
{
  "name": "ping",
  "description": "A simple ping command to check if the api is responsive",
  "version": "1.0.0",
  "main": "src/main.js",
  "dependencies": {}
}
```

Modules can be library-only or runnable. Library modules only provide code for other modules to
import. Runnable modules opt in to startup loading with a `main` entry.

Fields:

- `name`: unique module name.
- `description`: human-readable module description.
- `version`: module version.
- `main`: module entrypoint. Use a `.js` specifier even when the source file is TypeScript, for
  example `src/main.js` for `src/main.ts`.
- `dependencies`: optional map of module names to versions or ranges.

A module entrypoint exports an async `register` function:

```ts
import type { Context } from '#core/loader';

export async function register(context: Context) {
  context.router.on('GET', '/example', async (_req, res) => {
    res
      .writeHead(200, {
        'Content-Type': 'application/json'
      })
      .end(JSON.stringify({ ok: true }));
  });
}
```

The registration context contains:

- `router`: shared `find-my-way` router.
- `config`: parsed application configuration.
- `logger`: application logger.
- `modules`: loaded module metadata and entrypoints.

Module imports use the `#modules/` prefix:

```ts
import { wrapper } from '#modules/metadata-http/src/wrapper.js';
```

Runtime resolution and generated TypeScript path mappings must resolve the same module/version for
every importer. If a root module provides the exact dependency version, root wins. Otherwise the
dependency resolves from `.cache`.

Full module documentation starts at [Module System](docs/module-resolution.md).

## Module CLI

The module CLI is implemented in `scripts/mod.ts`.

Initialize module configuration:

```bash
node scripts/mod.ts init --repository http://localhost:1337
```

If `src/modules/modrc.json` already exists, `--repository` is not required:

```bash
node scripts/mod.ts init
```

Create a new editable root module:

```bash
node scripts/mod.ts create <module>
```

Install root modules from the repository, or install everything from the lockfile when no module
names are passed:

```bash
node scripts/mod.ts install <module[@version]>...
node scripts/mod.ts install
```

Rebuild the lockfile from root modules and reachable cached dependencies, then regenerate TypeScript
configs:

```bash
node scripts/mod.ts tidy
```

Remove editable root modules and clean unused cache dependencies:

```bash
node scripts/mod.ts remove <module>...
```

Publish one root module:

```bash
node scripts/mod.ts publish <module>
```

Copy module manifests into the build output:

```bash
node scripts/mod.ts build
```

Command behavior is documented in [Module System](docs/module-resolution.md).

## Generated Files

Module commands maintain generated metadata:

- `src/modules/modlock.json`: flat module dependency lockfile.
- `src/modules/modrc.json`: module repository configuration.
- `src/modules/**/tsconfig.json`: generated per-module TypeScript projects.
- `tsconfig.build.json`: generated build references for the root project and modules.

Regenerate lockfile and TypeScript references after changing module dependencies on disk:

```bash
node scripts/mod.ts tidy
```

## Tests

Run the Node.js test runner:

```bash
npm test
```
