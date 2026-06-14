# `mod graph`

Prints the selected module graph, one edge per line.

```bash
mod graph
```

Root edges are printed first:

```text
root app@1.0.0
```

Module dependency edges are printed after that:

```text
app@1.0.0 lib@1.2.0
```

The command reads `modlock.json` and does not modify files.
