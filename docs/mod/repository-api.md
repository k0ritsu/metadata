# Metadata Repository API

Этот контракт описывает HTTP API, которое используют `mod repo set`, `mod get`, `mod download` и
`mod publish`.

Base URL хранится в:

```text
src/modules/modrc.json
```

## Health Check

### `GET /ping`

Используется командой:

```bash
mod repo set <url>
```

Успешный ответ:

```http
200 OK
content-type: application/json
```

```json
{
  "pong": true
}
```

Если статус не `200`, body не JSON, или `pong` не `true`, repository считается недоступным и
`modrc.json` не обновляется.

## Publish Module Version

### `POST /modules/:name/versions`

Публикует новую immutable-версию модуля.

Path params:

- `name`: имя модуля.

Request body:

- gzip-compressed tar archive;
- `content-type: application/gzip`;
- archive должен содержать одну общую root-папку;
- внутри общей root-папки должен лежать `module.json`;
- `module.json.name` должен совпадать с `:name`;
- tar paths должны быть безопасными relative paths;
- directory, global pax и extended pax entries игнорируются;
- unsupported tar entry types приводят к ошибке.

Successful response:

```http
201 Created
content-type: application/json
```

```json
{
  "name": "app",
  "description": "Example module",
  "version": "1.0.0",
  "repositoryUrl": "https://github.com/org/app",
  "archiveUrl": "https://api.github.com/repos/org/app/tarball/refs/tags/v1.0.0"
}
```

`mod publish` должен записывать `archiveUrl` в `modlock.modules["app@1.0.0"].resolved`.
`integrity` сервер не возвращает; CLI считает его локально по опубликованному file set.

Known errors:

- `400 Invalid Module Name`
- `400 Invalid Module Manifest`
- `400 Invalid Module Dependencies`
- `400 Invalid File Path`
- `400 Duplicate File Path`
- `400 Invalid Tarball`
- `400 Missing module.json`
- `400 Manifest Name Mismatch`
- `400 Unsupported Tar Entry`
- `409 Module Version Already Exists`
- `500 Invalid Repository Config`
- `500 Invalid Adapter Config`
- mapped upstream GitHub errors with JSON `detail`.

## Search Modules

### `GET /modules/search`

Search params:

- `query`: string;
- `skip`: number, default `0`, minimum `0`;
- `take`: number, default `20`, minimum `1`, maximum `20`.

Successful response:

```json
{
  "objects": [
    {
      "name": "app",
      "description": "Example module",
      "version": "1.0.0",
      "repositoryUrl": "https://github.com/org/app"
    }
  ],
  "total": 1
}
```

Эта команда сейчас не требуется для базового `mod get`, но может использоваться для будущего поиска.

## Get Module Metadata

### `GET /modules/:name`

Возвращает metadata модуля и список версий.

Path params:

- `name`: имя модуля.

Successful response:

```json
{
  "name": "app",
  "description": "Example module",
  "versions": ["1.1.0", "1.0.0"]
}
```

`versions` отсортированы по semver descending адаптером.

Known errors:

- `400 Invalid Module Name`
- `404 Module Not Found`

## List Module Versions

### `GET /modules/:name/versions`

Возвращает список опубликованных версий модуля.

Path params:

- `name`: имя модуля.

Successful response:

```json
["1.1.0", "1.0.0"]
```

`mod get <name>` использует этот endpoint, чтобы выбрать latest: максимальную доступную semver
версию.

Repository обязан возвращать только валидные semver versions. CLI может считать невалидную версию в
этом ответе ошибкой repository contract. Отдельный endpoint для latest пока не требуется.

Known errors:

- `400 Invalid Module Name`
- `404 Module Not Found`

## Get Module Version Metadata

### `GET /modules/:name/versions/:version`

Возвращает metadata конкретной версии.

Path params:

- `name`: имя модуля;
- `version`: exact semver version.

Successful response:

```json
{
  "manifest": {
    "name": "app",
    "description": "Example module",
    "version": "1.0.0",
    "main": "src/main.js",
    "dependencies": {
      "lib": "^1.2.0"
    }
  },
  "repositoryUrl": "https://github.com/org/app",
  "archiveUrl": "https://api.github.com/repos/org/app/tarball/refs/tags/v1.0.0"
}
```

`mod get` должен использовать `archiveUrl` как `resolved` для этой версии. Если API перестанет
возвращать `archiveUrl`, API нужно обновить, а не восстанавливать URL эвристикой в CLI.

`manifest` валидируется только по официальным полям:

- `name`;
- `description`;
- `version`;
- `main`;
- `dependencies`.

Дополнительные поля разрешены как passthrough и не валидируются CLI.

Known errors:

- `400 Invalid Module Name`
- `400 Invalid Semver`
- `404 Module Not Found`

## Download Module Archive

### `GET /modules/:name/versions/:version/archive`

Скачивает archive конкретной версии.

Path params:

- `name`: имя модуля;
- `version`: exact semver version.

Successful response:

```http
200 OK
content-type: application/gzip
```

Body:

- gzip-compressed tar archive;
- archive должен содержать одну общую root-папку, внутри которой лежат файлы модуля.

`mod download` использует URL из `modlock.modules[key].resolved`. Для модулей, полученных через
текущий API, это обычно `archiveUrl` из `GET /modules/:name/versions/:version` или `POST
/modules/:name/versions`.

Known errors:

- `400 Invalid Module Name`
- `400 Invalid Semver`
- `404 Archive Not Found`
- `404 Module Not Found`

## Error Shape

Ошибки приложения сериализуются как `HttpError`:

```json
{
  "type": "about:blank",
  "status": 404,
  "title": "Module Not Found",
  "detail": "The requested module could not be found.",
  "instance": "/"
}
```

CLI должен показывать понятное сообщение, в первую очередь используя `detail`, затем `title`, затем
fallback вида `repository request failed with <status>`.
