# Metadata

Modular metadata management system built on Node.js and TypeScript.

The application starts an HTTP server, loads enabled modules from
`src/modules/*/module.json`, and lets modules register routes through a shared
runtime context.

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

The development command loads `.env` and registers the module loader from
`src/modules/import.ts`, so module imports can use the same `.js` specifiers
that are emitted for production builds.

Check the server:

```bash
curl http://localhost:3000/ping
```

## Build and Run

Build the project:

```bash
npm run build
```

The build script compiles the root project and every generated module
`tsconfig.json`. It also runs the module build step, which copies each
`module.json` file into `dist/modules` and keeps runtime `main` entries using
`.js` extensions.

Start the compiled application:

```bash
npm start
```

Run with Docker Compose:

```bash
docker compose up --build
```

## Module System

Modules live under `src/modules`. Each top-level module is discovered from a
`module.json` file:

```json
{
  "name": "ping",
  "description": "A simple ping command to check if the api is responsive",
  "version": "1.0.0",
  "enabled": true,
  "main": "src/main.js",
  "dependencies": {}
}
```

Modules can be library-only or runnable. Library modules only provide code for
other modules to import. Runnable modules opt in to startup loading with
`enabled: true` and a `main` entry.

Fields:

- `name`: unique module name.
- `description`: human-readable module description.
- `version`: module version.
- `enabled`: only enabled modules with a `main` entry are loaded at runtime.
- `main`: module entrypoint. Use a `.js` specifier even when the source file is
  TypeScript, for example `src/main.js` for `src/main.ts`.
- `dependencies`: optional map of module names to versions.

A module entrypoint exports an async `register` function:

```ts
import type { Ctx } from '#core/loader';

export async function register(ctx: Ctx) {
  ctx.router.on('GET', '/example', async (_req, res) => {
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

## Module CLI

The module CLI is implemented in `scripts/mod.ts`.

Initialize module configuration and regenerate module TypeScript references:

```bash
node scripts/mod.ts init --repository http://localhost:1337
```

If `src/modules/modrc.json` already exists, `--repository` is not required:

```bash
node scripts/mod.ts init
```

Build module metadata into `dist/modules`:

```bash
node scripts/mod.ts build
```

Current command status:

| Command   | Status      |
| --------- | ----------- |
| `build`   | Implemented |
| `create`  | Implemented |
| `init`    | Implemented |
| `install` | Implemented |
| `publish` | Implemented |
| `remove`  | Implemented |

## Generated Files

The `init` command maintains module build metadata:

- `src/modules/modrc.json`: module repository configuration.
- `src/modules/modlock.json`: generated module dependency lock file.
- `src/modules/**/tsconfig.json`: generated per-module TypeScript projects.
- `tsconfig.build.json`: generated build references for the root project and
  modules.

Regenerate these files after adding, removing, or changing module dependencies:

```bash
node scripts/mod.ts init
```

## Tests

Run the Node.js test runner:

```bash
npm test
```
