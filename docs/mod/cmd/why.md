# `mod why`

Prints why a selected module version is reachable from the root set.

```bash
mod why <module[@version]>
```

The output starts with the selected module key and then prints one importer chain:

```text
# lib@1.2.0
root
app@1.0.0
lib@1.2.0
```

If a name is ambiguous, pass an exact version.
