# `mod repo`

Reads or writes the module repository URL.

```bash
mod repo get
mod repo set <url>
```

`mod repo get` prints the URL from `src/modules/modrc.json`.

`mod repo set <url>` validates the repository before writing config by calling:

```text
GET /ping
```

The response must be HTTP 200 JSON:

```json
{
  "pong": true
}
```

On success, the command writes:

```text
src/modules/modrc.json
```
