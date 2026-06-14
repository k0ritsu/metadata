# TODO: Go-like module CLI

Цель: привести команды управления модулями в `src/modules` к модели, похожей на Go modules:
корневой набор модулей живет в `src/modules/<name>`, кеш зависимостей живет в
`src/modules/.cache/<name>@<version>`, а `src/modules/modlock.json` остается единственным
источником выбранных версий и расположений.

## Текущая точка старта

Сейчас реализованы команды:

- `mod build`
- `mod create`
- `mod init`
- `mod install`
- `mod publish`
- `mod remove`
- `mod tidy`

Нужно привести CLI к новому набору:

- `mod build`
- `mod create <module>`
- `mod download`
- `mod get <module[@version]>...`
- `mod graph`
- `mod publish <module>`
- `mod remove <module>...`
- `mod repo get`
- `mod repo set <url>`
- `mod tidy`
- `mod verify`
- `mod why <module[@version]>`

`mod install` в текущем виде нужно разобрать на две команды:

- no-args режим `install` становится `download`;
- режим `install <module...>` становится `get`, но с новой семантикой: команда устанавливает
  запрошенные root-модули и все их транзитивные зависимости рекурсивно.

`mod init` нужно удалить из целевой модели и документации.

## Термины и инварианты

Root module set:

- физически: директории `src/modules/<module>`;
- логически: `modlock.modules[""].dependencies`;
- содержит только напрямую используемые проектом модули;
- не включает `.cache`, dot-директории и служебные файлы.

Cache:

- физически: директории `src/modules/.cache/<module>@<version>`;
- содержит скачанные артефакты зависимостей;
- используется, когда нужная версия не представлена корневым модулем;
- не должен содержать дубликат той же пары `<module>@<version>`, если эта пара уже есть в root
  module set, кроме временного staged-состояния внутри транзакции.

Lockfile:

- путь: `src/modules/modlock.json`;
- root set описывается ключом `""`;
- каждый конкретный модуль описывается ключом `<module>@<version>`;
- `dependencies` в каждом non-root узле должны быть конкретными выбранными версиями, а не ranges;
- `resolved` и `integrity` обязательны для модулей, которые должны скачиваться через
  `mod download`;
- `resolved` и `integrity` могут отсутствовать у локально созданных/неопубликованных root-модулей.

Общие инварианты:

- `modlock.json` является единственным источником выбранных версий.
- Runtime loader, `tsconfig.json` и физическое расположение модулей должны совпадать с
  `modlock.json`.
- Работа с зависимостями происходит только в жестко заданном дереве `src/modules`: root modules,
  cache, `module.json`, `modlock.json`, `modrc.json` и module `tsconfig.json`.
- Команды не принимают настраиваемый root/path для module root/cache/lockfile.
- Разрешенные записи вне `src/modules` ограничены TypeScript/build метаданными:
  `tsconfig.build.json`, root `tsconfig.json` и `dist/**/tsconfig.tsbuildinfo`.
- `mod build` дополнительно читает `module.json` из `src/modules` и переносит их в жестко заданное
  дерево `dist/modules`.
- Root модуль удовлетворяет зависимость только при совпадении имени и версии.
- Команды не должны создавать вложенные `modules/` директории внутри модулей.
- В модуле сгенерированным файлом может быть только `tsconfig.json`; вложенные `modules/` в модуле
  появляться не должны. `tsconfig.tsbuildinfo` разрешен только в `dist`.
- `tsconfig.json` не входит в publish-архивы и integrity.
- Все команды, которые меняют файловую систему или `modlock.json`, должны быть атомарными на
  локальном диске: при ошибке восстанавливается исходное состояние.

## Уточненные решения

1. `mod init` удаляется.
2. `module.json.dependencies` должны поддерживать semver ranges.
3. Общий список зависимостей - это все записи `modlock.modules`, кроме root module set `""`.
4. `mod download` скачивает все записи из общего списка зависимостей. Если скачанная запись
   присутствует в root module set, она кладется в `src/modules/<name>`, иначе в
   `src/modules/.cache/<name>@<version>`.
5. `mod repo set` проверяет доступность репозитория через `GET /ping`; валидный ответ:
   HTTP 200 и JSON `{ "pong": true }`.
6. `mod graph` выводит граф по аналогии с `go mod graph`.
7. `mod publish` не может откатить уже загруженный архив на сервере. При ошибке после upload нужно
   откатить все локальные изменения, которые можно откатить, и напечатать recovery-инструкцию.
8. `mod get <name>`, если нужная версия уже есть в `.cache`, переносит ее из cache в root без
   повторного скачивания. Cache считается доверенным: руками туда не лезут.
9. `mod remove` должен падать, если still-used root-модуль нужно перенести в cache, но у него нет
   `integrity`. В cache должны попадать только зависимости, которые можно воспроизвести на другой
   системе.
10. Работа с зависимостями у всех `mod *` команд ограничена `src/modules`. При этом разрешено
    обновлять root-level TypeScript configs (`tsconfig.build.json`, root `tsconfig.json`) и
    `dist/**/tsconfig.tsbuildinfo`. Остальные файлы вне `src/modules`, например `package.json`, не
    должны создаваться или изменяться этими командами.
11. `module.json` валидируется только по описанным полям. Дополнительные пользовательские ключи
    разрешены, не проверяются и должны сохраняться при копировании/публикации.
12. Semver ranges разрешены в `module.json.dependencies`; выбирается максимальная доступная версия,
    удовлетворяющая range. Root module с точным совпадением имени и версии всегда побеждает cache и
    repository, даже если где-то доступна более новая версия.
13. Если пользователь повторно ставит root-модуль через `mod get`, локальная dirty-копия
    заменяется скачанным/перенесенным artifact, а `integrity` обновляется.
14. `mod tidy` строит root module set из файловой системы: сканирует root-директории в
    `src/modules`, затем распутывает зависимости через root/cache. Существующий `modlock` нужен
    только для переноса прежних `integrity` и `resolved`.
15. `mod graph` должен выводить сначала root module set, затем cache, с алфавитной сортировкой.
16. `mod why` использует go-like формат вывода.
17. Сетевые команды локально откатывают все изменения при ошибке, но уже выполненные сетевые
    запросы не откатываются.
18. `resolved` для `mod get` нужно брать из `archiveUrl`, который возвращает
    `GET /modules/:name/versions/:version`. Если API не возвращает archive URL, нужно обновлять API,
    а не собирать URL эвристикой в CLI.
19. `integrity` всегда считается CLI локально по установленному/published artifact; серверный
    integrity не используется.
20. `mod install` и `mod init` удаляются полностью: они должны вести себя как неизвестные команды,
    без alias и подсказок совместимости.
21. `mod get` при разрешении транзитивной зависимости сначала использует root exact match, затем
    подходящую версию из cache, и только если подходящей версии нет локально, идет в repository.
22. `mod download` только устанавливает или заменяет модули из `modlock`; он не удаляет лишние root
    или cache директории. Удаление неиспользуемого cache делает `mod tidy`, удаление root-модулей
    делает `mod remove`.
23. `mod verify` использует `modlock` как источник истины и проверяет только описанные в нем модули
    и edges. Лишние директории в filesystem игнорируются.
24. `module.json.main`, если указан, должен быть строкой, безопасным relative path, иметь расширение
    `.ts` или `.js`, и соответствующий source file должен существовать.
25. Repository archive contract должен быть единым: archive содержит одну общую root-папку, внутри
    которой лежит `module.json` и остальные файлы модуля. Это соответствует GitHub tarball shape.
26. JSON-файлы, которые пишут команды, форматируются стабильно: ключи отсортированы по алфавиту,
    отступ 2 пробела, без переноса строки в конце файла.
27. Поле `enabled` устарело и удаляется из схемы и документации. Если оно встретится как extra key,
    CLI не должен специально его валидировать.
28. Для прямого `mod get <name>` latest всегда определяется через repository; cache не доказывает,
    что версия является latest.
29. Скачивания и установки пока выполняются последовательно, не параллельно.
30. `mod remove` удаляет dirty root-модуль без дополнительной защиты, если этот модуль больше никем
    не используется и не переносится в cache.

## Общий refactor перед командами

### 1. Ввести транзакционный слой для локальных изменений

Сейчас отдельные операции частично атомарны, но команды в целом не откатываются полностью.
Нужен helper уровня `withModuleTransaction`, который умеет:

- брать существующий `withModuleLock`;
- до изменений делать backup файлов/директорий, которые команда может менять;
- писать новые версии во временные sibling-директории/файлы;
- применять изменения через atomic rename;
- при ошибке возвращать старые директории, `src/modules/modlock.json`, `src/modules/modrc.json` и
  module `tsconfig.json`;
- чистить временные `.mod-tmp-*` и `.mod-backup-*` после успеха или rollback.

Команды, которые обязаны использовать транзакцию:

- `create`
- `download`
- `get`
- `publish` для локальной части
- `remove`
- `repo set`
- `tidy`

`build`, `graph`, `repo get`, `verify`, `why` не обязаны менять state.

### 2. Уменьшить связанность helpers

Нужно перестроить helper-слой так, чтобы функции делали одну работу и получали все необходимые
данные извне. Это должно уменьшить повторные обращения к filesystem и сделать команды проще для
тестирования.

Принципы:

- Разделять IO helpers и pure helpers.
- Pure helpers не читают filesystem, не пишут filesystem и не ходят в сеть.
- IO helpers читают/пишут только явно переданные пути или фиксированные paths из path constants.
- Не делать скрытых `readModlock()`, `readModuleManifest()`, `createTsconfigs()` внутри
  вычислительных helpers. Команда читает данные один раз, собирает context/snapshot и передает его
  дальше.
- Функция должна выполнять одну задачу: parse, validate, resolve, plan, write, move, cleanup, render.
- Helpers не должны самостоятельно решать, когда перечитывать состояние с диска. Повторное чтение
  допускается только на границах транзакции или перед commit, если нужно проверить внешний conflict.
- Планирование изменений отделить от применения изменений. Сначала строится план, потом он
  применяется транзакционно.

Рекомендуемый command context:

```ts
interface ModuleWorkspaceSnapshot {
  cache: Map<string, ModuleDescriptor>;
  cacheByName: Map<string, ModuleDescriptor[]>;
  modlock?: Modlock;
  modrc?: Modrc;
  roots: Map<string, ModuleDescriptor>;
}
```

`ModuleDescriptor` должен содержать уже прочитанные данные:

```ts
interface ModuleDescriptor {
  key: string;
  manifest: ModuleManifest;
  root: string;
  source: 'root' | 'cache';
}
```

Команда выбирает, какой snapshot ей нужен:

- `build`: root/cache descriptors по `modlock`;
- `create`: текущий `modlock`, root/cache existence для создаваемого key;
- `download`: `modlock` и planned install locations;
- `get`: root/cache snapshot, repository metadata по недостающим версиям;
- `publish`: root descriptor, current `modlock`, expected graph;
- `remove`: root/cache snapshot и current graph;
- `tidy`: filesystem root/cache snapshot и previous `modlock` только для metadata preservation;
- `verify`, `graph`, `why`: `modlock` плюс минимальный filesystem snapshot только там, где нужен.

Примеры refactor targets:

- `createTsconfigs(modlock, descriptors)` не должен сам читать `modlock`.
- `createModuleIntegrity(root, files)` не должен сам собирать file list, если caller уже собрал
  publish/install file set.
- `resolveModuleRoot(key, rootSet)` должен быть pure и не читать `modlock`.
- `createNextModlock(snapshot, previousModlock)` должен быть pure после чтения manifests.
- `writeModlock(modlock)` только валидирует и пишет уже готовый object.

### 3. Разделить repository client и module installer

Нужно вынести из `scripts/cmd/mod/install.ts` общие части:

- парсинг module spec: `<name>` или `<name>@<version>`;
- получение latest/concrete version;
- root/cache/repository resolution для транзитивных зависимостей;
- скачивание `.tar.gz`;
- безопасное распаковывание архива;
- нормализация archive должна требовать единый common root directory и снимать этот root при
  установке;
- чтение и валидация `module.json` из архива;
- вычисление integrity;
- запись staged module root;
- перенос staged root в `src/modules/<name>` или `src/modules/.cache/<name>@<version>`;
- последовательное выполнение download/install шагов с общим rollback на ошибке;
- нормализация ошибок API сервера.

Repository endpoints описаны в `docs/mod/repository-api.md`. CLI должен использовать `archiveUrl`
из version metadata как `resolved` и считать `integrity` локально.

Предлагаемые файлы:

- `scripts/cmd/mod/common/helpers/spec.ts`
- `scripts/cmd/mod/common/helpers/download.ts`
- `scripts/cmd/mod/common/helpers/install-module.ts`
- `scripts/cmd/mod/common/helpers/transaction.ts`
- `scripts/cmd/mod/common/helpers/workspace.ts`
- `scripts/cmd/mod/common/helpers/plan.ts`

### 4. Явно описать lockfile операции

Нужны helper-функции:

- `getRootDependencies(modlock)`;
- `getModuleNode(modlock, key)`;
- `setRootDependency(modlock, name, version)`;
- `removeRootDependency(modlock, name)`;
- `setModuleNode(modlock, key, node)`;
- `removeUnreachableNodes(modlock)`;
- `walkModlockGraph(modlock)`;
- `findDependents(modlock, keyOrName)`;
- `assertNoRootCacheDuplicate(name, version)`.

Это упростит `graph`, `verify`, `why`, `remove`, `tidy`.

### 5. Жестко закрепить рабочие пути

Все helpers должны использовать только фиксированные пути:

- `src/modules`
- `src/modules/.cache`
- `src/modules/modlock.json`
- `src/modules/modrc.json`
- `src/modules/**/module.json`
- `src/modules/**/tsconfig.json`
- `tsconfig.build.json`
- `tsconfig.json`
- `dist/**/tsconfig.tsbuildinfo`

Запрещено добавлять CLI flags или config для смены module root/cache/lockfile paths.
Работа с зависимостями должна оставаться в `src/modules`. Вне `src/modules` разрешено писать только
root-level TypeScript configs и `dist/**/tsconfig.tsbuildinfo`; запрещено писать `package.json` и
любые другие внешние файлы из команд `create`, `download`, `get`, `publish`, `remove`, `repo`,
`tidy`, `verify`, `why`, `graph`.

`mod build` использует дополнительный фиксированный путь `dist/modules` только для копирования
manifest-файлов в build output.

### 6. Обновить документацию

Документы, которые нужно переписать:

- `docs/module-resolution.md`
- `docs/mod/00-overview.md`
- `docs/mod/01-lockfile.md`
- `docs/mod/02-resolution.md`
- `docs/mod/03-typescript-configs.md`
- `docs/mod/04-integrity.md`
- `docs/mod/repository-api.md`
- `docs/mod/cmd/build.md`
- `docs/mod/cmd/create.md`
- `docs/mod/cmd/publish.md`
- `docs/mod/cmd/remove.md`
- `docs/mod/cmd/tidy.md`
- `README.md`

Документы, которые нужно добавить:

- `docs/mod/cmd/download.md`
- `docs/mod/cmd/get.md`
- `docs/mod/cmd/graph.md`
- `docs/mod/cmd/repo.md`
- `docs/mod/cmd/verify.md`
- `docs/mod/cmd/why.md`

Документы, которые нужно удалить:

- `docs/mod/cmd/install.md`
- `docs/mod/cmd/init.md`

### 7. Обновить test suite

Существующие `test/cmd/install.test.ts` нужно разделить:

- `test/cmd/download.test.ts`;
- `test/cmd/get.test.ts`.

Добавить:

- `test/cmd/graph.test.ts`;
- `test/cmd/repo.test.ts`;
- `test/cmd/verify.test.ts`;
- `test/cmd/why.test.ts`;
- rollback-тесты для `create`, `download`, `get`, `publish`, `remove`, `repo set`, `tidy`.

Тесты должны проверять не только итоговые файлы, но и что при ошибке исходное состояние не
изменилось.

## Команда `mod build`

Целевое поведение:

- не принимает аргументов;
- переносит `module.json` из root module set и cache из `src/modules` в `dist/modules`;
- сохраняет форму директорий:
  - `src/modules/<name>/module.json` -> `dist/modules/<name>/module.json`;
  - `src/modules/.cache/<name>@<version>/module.json` ->
    `dist/modules/.cache/<name>@<version>/module.json`;
- если в manifest есть `main` с расширением `.ts`, переписывает только расширение на `.js`;
- если `main` уже `.js`, оставляет как есть.

Что изменить:

- Сейчас `build` обходит все `src/modules/*/module.json` и `.cache/*/module.json` на диске.
  Нужно перейти на обход `modlock`: root module set плюс общий список зависимостей. Модуль
  копируется из `src/modules/<name>`, если его `<name>@<version>` присутствует в root module set,
  иначе из `src/modules/.cache/<name>@<version>`.
- Добавить strict no-args тест.
- Добавить тест, что `.ts` меняется на `.js`, а остальные поля не меняются.
- Добавить тест, что пользовательские дополнительные поля в `module.json` сохраняются.
- Добавить тест, что некорректный `main` приводит к ошибке.
- Добавить тест, что root/cache layout в `dist` совпадает с `src`.

Критерии готовности:

- `mod build extra` падает с понятной ошибкой.
- Некорректный `module.json` или несовпадение имени директории с manifest приводят к ошибке.
- Некорректный `main` в `module.json` приводит к ошибке.
- При ошибке команда не оставляет частично записанный `module.json` в `dist` для текущего модуля.

## Команда `mod create <module>`

Целевое поведение:

- принимает ровно одно имя модуля;
- создает root-модуль в `src/modules/<module>`;
- пишет предзаданный `module.json`;
- добавляет модуль в `modlock.modules[""].dependencies`;
- добавляет node `<module>@<version>` в `modlock.modules`;
- генерирует `src/modules/<module>/tsconfig.json`;
- при ошибке полностью откатывает созданные файлы и изменения lockfile.

Предзаданный `module.json`:

```json
{
  "name": "<module>",
  "description": "",
  "version": "0.1.0",
  "dependencies": {}
}
```

Правила дубликатов:

- ошибка, если `src/modules/<module>` уже существует;
- ошибка, если root module set уже содержит `<module>`;
- ошибка, если `modlock.modules["<module>@0.1.0"]` уже существует;
- ошибка, если `src/modules/.cache/<module>@0.1.0` уже существует.

Что изменить:

- Сейчас `create` не проверяет cache-дубликат `<name>@0.1.0`.
- Сейчас `create` делает запись manifest и `modlock` параллельно, потом генерирует tsconfig; при
  ошибке tsconfig часть state уже остается. Нужно перевести на транзакцию.
- Сейчас `parseArgs` не проверяет, что передан ровно один positional: лишние аргументы фактически
  игнорируются после `[name]`. Нужно падать при `0` и `>1` аргументах.

Критерии готовности:

- `mod create app` создает manifest, lock node, root dependency и module tsconfig.
- `mod create app extra` падает.
- Повторное `mod create app` падает.
- `mod create app` падает, если есть `.cache/app@0.1.0`.
- Любая ошибка записи/генерации откатывает manifest, директорию модуля, `modlock.json` и
  module `tsconfig.json`.

## Команда `mod download`

Целевое поведение:

- не принимает аргументов;
- читает все зависимости из `src/modules/modlock.json`;
- скачивает архивы по `resolved`;
- проверяет, что рассчитанный integrity скачанного модуля равен `integrity` из lockfile;
- размещает модули в файловой системе:
  - entries, которые присутствуют в root module set, в `src/modules/<name>`;
  - остальные entries в `src/modules/.cache/<name>@<version>`;
- генерирует `tsconfig.json` для каждого установленного модуля;
- при любой ошибке полностью откатывает скачанные директории, замененные модули и сгенерированные
  configs.

Что изменить:

- Переименовать no-args режим `mod install` в `mod download`.
- Зарегистрировать `download` через command repository factory.
- Убрать у команды поддержку positional args.
- Убрать `--repository`: `download` должен использовать `resolved` из lockfile, а не строить URL из
  текущего repo config.
- Проверять наличие `resolved` и `integrity` у каждого node из общего списка зависимостей.
- Сохранять root/cache расположение строго по lockfile resolution.
- Генерировать TypeScript configs только после успешного скачивания всех модулей и успешной
  integrity-проверки.

Критерии готовности:

- `mod download extra` падает.
- Если archive отсутствует, не gzip tar, содержит unsafe path или неверный manifest name/version,
  весь state откатывается.
- Если integrity не совпал, весь state откатывается.
- Если один из нескольких downloads падает, ранее скачанные модули откатываются.
- Лишние root/cache директории, которых нет в `modlock`, не удаляются.
- После успеха `mod verify` проходит.

## Команда `mod get <module[@version]>...`

Целевое поведение:

- принимает один или более module spec;
- spec может быть:
  - `<name>`: скачать последнюю доступную версию;
  - `<name>@<version>`: скачать конкретную версию;
- работает только с root module set;
- скачивает каждый указанный модуль как root-модуль в `src/modules/<name>`;
- рекурсивно скачивает все требуемые подзависимости запрошенных модулей, пока не дойдет до модулей
  без зависимостей;
- подзависимости ставятся в cache, если только нужная пара `<name>@<version>` уже не представлена
  root module set;
- заносит в `modlock`:
  - root dependency `<name>: <version>`;
  - node `<name>@<version>` для каждого установленного root-модуля и подзависимости;
  - `resolved` и `integrity` для каждого скачанного или перенесенного artifact;
  - concrete dependency versions, выбранные из semver ranges в `module.json`;
- генерирует `tsconfig.json` для скаченного root-модуля;
- при ошибке полностью откатывает filesystem, `modlock.json` и generated configs.

Что изменить:

- Переименовать args-режим `mod install` в `mod get`.
- CLI spec поддерживает только `<name>` и `<name>@<exact-version>`.
- Сохранить рекурсивную установку зависимостей, но привести ее к новой семантике `get`.
- `module.json.dependencies` поддерживает semver ranges; при установке нужно выбирать concrete
  version и записывать ее в `modlock`.
- При разрешении dependency range порядок источников такой:
  - root exact match побеждает;
  - если в cache есть одна или несколько подходящих версий, выбирается максимальная подходящая cache
    версия;
  - если локально подходящей версии нет, выбирается максимальная подходящая версия из repository.
- При `get <name>` запросить latest у репозитория.
- При `get <name>@<version>` скачивать только эту версию.
- Для скачивания конкретной версии сначала читать `GET /modules/:name/versions/:version` и брать
  `resolved` из `archiveUrl`, затем скачивать archive.
- Если скачанный manifest name/version не совпадает со spec, падать и откатываться.
- Если в root уже есть `<name>`:
  - команда транзакционно заменяет root-модуль скачанным/перенесенным artifact;
  - если локальная копия была изменена руками и отличается от locked integrity, изменения
    перетираются;
  - `integrity` пересчитывается по установленному artifact и обновляется в `modlock`.
- Если `.cache/<name>@<version>` уже существует и эта версия нужна как root dependency, перенести ее
  из cache в root без повторного скачивания и без повторной проверки integrity.

Критерии готовности:

- `mod get app` скачивает latest и делает `app` root dependency.
- `mod get app@1.2.3` скачивает конкретную версию.
- `mod get app lib@2.0.0` применяет все изменения атомарно: ошибка второго модуля откатывает первый.
- `mod get` без аргументов падает.
- `mod get app@bad` падает до обращения к сети.
- Транзитивные зависимости из `module.json` скачиваются рекурсивно.
- После `mod get` команда `mod tidy` успешно достраивает тот же граф без сетевых запросов.

## Команда `mod graph`

Целевое поведение:

- не принимает аргументов;
- читает только `src/modules/modlock.json`;
- выводит визуальное отображение зависимостей между модулями;
- не читает filesystem и не пересчитывает граф.

Формат вывода аналогичен `go mod graph`: одна строка на одно ребро графа.

```text
root app@1.0.0
root tool@1.0.0
app@1.0.0 lib@1.2.0
tool@1.0.0 lib@2.0.0
```

Правила:

- root set отображается как `root`;
- root dependencies идут из `modlock.modules[""].dependencies`;
- edges каждого module node идут из `node.dependencies`;
- порядок вывода стабильный: сначала root edges, затем cache/module edges, все группы и
  dependencies сортируются по алфавиту;
- если node указан в dependency, но отсутствует в lockfile, команда падает с понятной ошибкой;
- cycles в lockfile должны отображаться без бесконечной рекурсии и приводить к ошибке или отметке
  cycle. Лучше падать, чтобы `modlock` оставался строгим.

Критерии готовности:

- `mod graph extra` падает.
- Граф выводит разные версии одной зависимости как разные nodes.
- Missing node/cycle в `modlock` дают понятные ошибки.

## Команда `mod publish <module>`

Целевое поведение:

- принимает ровно одно имя модуля;
- публикует только root-модуль из `src/modules/<module>`;
- не работает с cache;
- отправляет `.tar.gz` archive на сервер;
- сервер возвращает ссылки на репозиторий и архив;
- команда считает integrity опубликованного артефакта;
- пишет `resolved` и `integrity` в `modlock`;
- при ошибке локальная операция полностью откатывается;
- ошибки API сервера показываются понятным сообщением.

Что изменить:

- Сейчас команда допускает лишние positional args через `[name]`. Нужно требовать ровно один.
- После успешного upload remote state не откатывается: архив нельзя удалить с сервера. При
  последующей локальной ошибке команда откатывает только локальные изменения и печатает
  recovery-инструкцию.
- Integrity нужно считать по тому же file set, который отправляется в archive. Сейчас это почти так,
  но нужно закрепить тестом, что archive и integrity используют один список файлов.
- Ошибки repository API уже форматируются через `detail`; нужно расширить формат, если сервер
  возвращает другой shape (`message`, `error`, validation errors).
- Перед upload сохранить preflight:
  - root module существует;
  - `module.json.name` совпадает с директорией;
  - модуль есть в root set;
  - node `<name>@<version>` есть в `modlock`;
  - dependency graph не stale относительно `mod tidy`.

Критерии готовности:

- `mod publish app` отправляет archive без generated `tsconfig.json`.
- `mod publish app extra` падает.
- `mod publish` без аргументов падает.
- Cached module нельзя опубликовать напрямую.
- Stale graph блокирует upload до сетевого запроса.
- После успеха `modlock.modules["app@version"].resolved` и `.integrity` обновлены.
- Если локальная запись lockfile падает, старый lockfile восстановлен, а пользователю показана
  понятная recovery-инструкция.

## Команда `mod remove <module>...`

Целевое поведение:

- принимает один или более имен без версии;
- работает только с root module set;
- не удаляет cache-модули напрямую;
- удаляет модуль из root set;
- если модуль больше никем не используется, удаляет root-директорию полностью;
- если модуль еще нужен другим reachable модулям, переносит root-директорию в cache;
- обновляет `modlock`:
  - либо удаляет module node полностью, если он больше не reachable;
  - либо удаляет только root dependency, если node остается dependency;
- при ошибке полностью откатывает filesystem, lockfile и generated configs.

Что изменить:

- Сейчас команда частично умеет preserve-to-cache, но не обернута в полноценную транзакцию.
- Нужно проверить, что все requested modules есть в root set до любых изменений.
- Нужно планировать все удаления до исполнения, чтобы ошибка по одному модулю не оставляла уже
  удаленные предыдущие.
- Нужно явно удалить stale tsconfig для удаленных cache/root модулей после успешного пересчета.
- Если удаляемый root-модуль больше никем не используется после удаления всего requested set, он
  удаляется даже при локальных ручных изменениях.
- Нужно сохранить запрет на удаление dirty root module, если результатом должен стать cache artifact
  с тем же `<name>@<version>`.
- Если still-used root-модуль нужно перенести в cache, а в `modlock` для него нет `integrity`,
  команда должна падать. Cache должен содержать только воспроизводимые artifact-зависимости.

Критерии готовности:

- `mod remove app lib` атомарен: ошибка удаления `lib` откатывает удаление `app`.
- `mod remove app@1.0.0` падает, потому что версия не принимается.
- Still-used root переносится в `.cache/<name>@<version>`.
- Still-used root без locked `integrity` не переносится и команда падает без изменений state.
- Unused root удаляется полностью.
- `modlock` после успеха содержит только reachable nodes.
- После успеха `mod verify` проходит.

## Команда `mod repo`

Целевое поведение:

- имеет две подкоманды:
  - `mod repo set <url>`;
  - `mod repo get`.

### `mod repo set <url>`

Требования:

- принимает ровно один URL;
- URL должен быть валидным;
- repository должен отвечать на `GET /ping` статусом 200 и JSON body `{ "pong": true }`;
- после успешной проверки пишет `src/modules/modrc.json`;
- при ошибке оставляет старый `modrc.json` без изменений.

Что изменить:

- Заменить настройку repository из удаляемого `mod init --repository` на `mod repo set`.
- Добавить URL validation в `modrc` helper.
- Добавить repository probe helper для `GET /ping`.
- Записывать `modrc.json` транзакционно.

Критерии готовности:

- `mod repo set http://localhost:1337` пишет `{ "repository": "http://localhost:1337" }`.
- Невалидный URL падает до сетевого запроса.
- Неотвечающий repository или ответ не `{ "pong": true }` не меняет старый `modrc.json`.
- Лишние аргументы дают ошибку.

### `mod repo get`

Требования:

- не принимает аргументов;
- читает `src/modules/modrc.json`;
- выводит текущий repository URL;
- если config отсутствует, падает с понятной ошибкой.

Критерии готовности:

- `mod repo get` печатает URL.
- `mod repo get extra` падает.
- Нет `modrc.json` -> понятная ошибка.

## Команда `mod tidy`

Целевое поведение:

- не принимает аргументов;
- перестраивает `modlock.json` по тому, что есть в filesystem;
- строит root module set из файловой системы, сканируя root-директории `src/modules/<module>`;
- для каждого reachable модуля читает `module.json`;
- зависимости из `module.json` заносит в `modlock`;
- падает, если не нашла требуемую зависимость;
- удаляет unreachable cache entries;
- удаляет cache-дубликаты, если та же версия представлена root-модулем;
- сохраняет `resolved` и `integrity` у unchanged module keys;
- генерирует `tsconfig.json` для reachable модулей;
- при ошибке полностью откатывает lockfile, cache cleanup и generated configs.

Что изменить:

- `tidy` должен сохранить текущую базовую идею: root set создается из root-директорий в
  `src/modules`, а существующий `modlock` используется только для переноса `integrity` и `resolved`
  у surviving keys.
- `tidy` должен сохранять поддержку semver ranges и выбирать подходящую concrete version из root
  set или cache.
- Сейчас `tidyWorkspace` пишет lockfile до `createTsconfigs` и `cleanCache`; если эти шаги падают,
  lockfile уже изменен. Нужно транзакционное применение.

Критерии готовности:

- `mod tidy extra` падает.
- Missing dependency дает понятную ошибку и не меняет старый `modlock.json`.
- Ошибка генерации tsconfig не меняет старый `modlock.json`.
- Unreachable cache удаляется только после успешного построения нового graph.
- `resolved` и `integrity` сохраняются у surviving keys.

## Команда `mod verify`

Целевое поведение:

- не принимает аргументов;
- проверяет, что filesystem соответствует `modlock.json`;
- проверяет расположение модулей;
- проверяет integrity там, где оно есть в lockfile;
- если что-то не совпало, падает с понятной ошибкой;
- если все хорошо, сообщает, что все ok.

Проверки:

- `src/modules/modlock.json` существует и валиден.
- `modlock.modules[""]` существует.
- Для каждого root dependency `<name>: <version>`:
  - есть node `<name>@<version>`;
  - есть `src/modules/<name>/module.json`;
  - manifest name/version совпадают.
- Для каждого non-root node:
  - если `<name>@<version>` представлен root set, он должен быть в `src/modules/<name>`;
  - иначе он должен быть в `src/modules/.cache/<name>@<version>`;
  - manifest name/version совпадают с key.
- Для каждой dependency edge есть соответствующий module node.
- Для каждого module key из `modlock` ожидается ровно одно расположение: root, если key представлен
  root set, иначе cache.
- Лишние root/cache директории, которых нет в `modlock`, игнорируются.
- Если node содержит `integrity`, рассчитанный integrity совпадает.
- Если node содержит `resolved`, это непустой валидный URL.

Критерии готовности:

- `mod verify` печатает `OK` или аналогичное короткое сообщение.
- `mod verify extra` падает.
- Missing root, missing cache, wrong manifest, wrong integrity и missing edge node покрыты тестами.
- Extra filesystem directories не считаются ошибкой.

## Команда `mod why <module[@version]>`

Целевое поведение:

- принимает ровно один аргумент;
- аргумент может быть:
  - `<name>`;
  - `<name>@<version>`;
- работает с root module set и cache;
- для root module set указывает, что модуль используется как root dependency;
- для зависимости с версией ищет модуль или модули, которые используют ее.

Предлагаемая логика:

- Если передано `<name>`:
  - если `<name>` есть в `modlock.modules[""].dependencies`, вывести, что это root dependency, и
    указать выбранную версию;
  - дополнительно вывести все dependents любых versions этого module name;
  - если ничего не найдено, команда завершается с exit code 1 и понятным сообщением.
- Если передано `<name>@<version>`:
  - если root set содержит `<name>: <version>`, вывести `root depends on <name>@<version>`;
  - найти все nodes, у которых `dependencies[name] === version`;
  - вывести цепочки от root до этих nodes, чтобы было понятно, почему dependency reachable.

Формат вывода go-like: header с `# <module>` и затем одна цепочка dependency path на строку или
многострочный path.

Пример допустимого вывода:

```text
# lib@1.2.0
root app@1.0.0 lib@1.2.0
root tool@1.0.0 plugin@1.0.0 lib@1.2.0
```

Критерии готовности:

- `mod why app` показывает root dependency.
- `mod why lib@1.2.0` показывает importer chain.
- Разные версии одного module name не смешиваются.
- Missing module дает понятное сообщение и exit code 1.
- `mod why`, `mod why a b`, `mod why bad@version` падают.

## Обновить CLI shell и naming

Naming:

- Все сущности, связанные с command shell, должны начинаться с `Cmd`.
- Текущий `CommandHandler` назван некорректно и должен быть переименован.
- `Handler` в command shell terminology заменяется на `Main`.
- Итоговое имя типа entrypoint функции команды: `CmdMain`.
- `CmdError` уже соответствует правилу и остается.

`scripts/cmd/cmd.ts` должен содержать фабрику repository команд:

```ts
interface CmdMain {
  (args: string[]): Promise<void>;
}

interface CmdRegistration {
  description: string;
  main: CmdMain;
  name: string;
}
```

Требования к фабрике:

- создает command repository;
- предоставляет функцию регистрации команды;
- регистрация принимает `name`, `description`, `main`;
- повторная регистрация того же `name` должна падать ошибкой;
- по умолчанию регистрирует команду `help`;
- `help` без аргументов выводит отсортированный по алфавиту список доступных команд;
- `help <command>` выводит строку `description` указанной команды;
- `mod --help` не является специальным случаем и не должен быть эквивалентом `mod help`;
- флаг `--help` у команд не поддерживается;
- unknown command, включая удаленные `install` и `init`, обрабатывается как обычная неизвестная
  команда без alias и compatibility message.
- формат ошибок command shell пока остается простым: `ErrorName: message`.

`scripts/mod.ts` должен:

- создать экземпляр фабрики/repository команд;
- импортировать командные модули только ради регистрации;
- передать `process.argv.slice(2)` в command repository runner;
- не содержать ручной объект `Record<string, CmdMain>`.

Каждая команда должна:

- импортировать функцию регистрации команды;
- зарегистрировать себя через `registerCmd(name, description, main)`;
- экспортировать свой `CmdMain` только если это нужно тестам;
- иметь строковый `description`, пригодный для `mod help` и `mod help <cmd>`. Длина строки остается
  на усмотрение автора команды.

Команды, которые нужно зарегистрировать:

- `build`
- `create`
- `download`
- `get`
- `graph`
- `publish`
- `remove`
- `repo`
- `tidy`
- `verify`
- `why`

Команды, которые нужно удалить:

- `install`
- `init`

## Обновить package scripts

Текущий `prebuild` использует:

```json
"prebuild": "node scripts/mod.ts tidy"
```

`mod tidy` можно оставить в `prebuild`: работа с зависимостями остается в `src/modules`, но команда
может обновлять root-level TypeScript configs (`tsconfig.build.json`, root `tsconfig.json`), если
это требуется для build.

Нужно проверить, не требуется ли отдельный шаг:

- `mod download` перед build в чистом окружении;
- `mod verify` в CI перед build/test.

## Порядок реализации

1. Зафиксировать уточненные решения из этого документа в командных docs.
2. Добавить транзакционный helper и покрыть его локальными unit/integration тестами через команды.
3. Вынести repository/download/install helpers из текущего `install.ts`.
4. Реализовать `repo`.
5. Разделить `install` на `download` и `get`, затем полностью удалить `install`.
6. Довести `create`, `remove`, `tidy`, `publish` до строгой проверки аргументов и rollback.
7. Реализовать read-only команды `graph`, `verify`, `why`.
8. Обновить docs и README.
9. Переписать и расширить тесты.
10. Прогнать `npm test` и `npm run build`.

## Минимальный acceptance checklist

- Все целевые команды зарегистрированы через command repository factory.
- Старые `mod install` и `mod init` полностью удалены и обрабатываются как unknown command.
- Каждая mutating команда либо завершается полностью, либо возвращает локальный workspace в исходное
  состояние.
- `modlock.json`, runtime loader resolution и generated module TypeScript paths внутри
  `src/modules` описывают один и тот же граф.
- `mod download` и `mod get` проверяют integrity скачанных артефактов.
- `mod verify` проходит после успешных `create`, `get`, `download`, `remove`, `tidy`, `publish`.
- Документация содержит отдельный файл для каждой целевой команды.
- Тесты покрывают happy path, argument validation, filesystem layout, lockfile changes, integrity
  errors и rollback.
