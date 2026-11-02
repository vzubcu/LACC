# Exploration helpers

```bash
bash <skill_dir>/scripts/dep-graph.sh src/checkout.ts publishCheckout --signal checkout.ready
```

Path-qualified import candidates rank ahead of explicit symbol/signal matches. Bare generic
stems such as index/utils/types are not treated as inbound references. Aliases, DI, re-exports
and dynamic resolution are incomplete: verify candidates with code, tests and narrower searches.
Output defaults to 40 references/5000 UTF-8 bytes; scan defaults to 5000 decoded files/16 MiB
read bytes, with a 1 MiB file cap. `--max-files`, `--scan-bytes`, `--limit`, `--max-bytes` and
repeatable `--exclude` globs are configurable. Inventory generation still enumerates filenames;
the scan caps bound content reads, not total filesystem traversal time.

Git/ripgrep inventories honor their ignore rules. Root dist/vendor/memory directories are
excluded; bin/build/obj and nested source directories remain searchable unless ignored or explicitly excluded.
Excluded and oversized/binary/unsafe counts and exhausted budgets disclose incomplete coverage.
The explicitly selected target is always considered, including when an exclusion would match it.

```bash
bash <skill_dir>/scripts/ast-skeleton.sh src/checkout.py --limit 40 --max-bytes 5000
```

The compatibility name now calls a bounded extractor. Python uses stdlib AST definition starts;
other languages use declaration heuristics. Multiline signatures, methods and dynamic declarations
may need targeted source reads. Decorators alone are not signatures. This is not a resolved graph
or a complete multi-language AST parser.

```bash
bash <skill_dir>/scripts/ctx-slice.sh build.log 100
some_command 2>&1 | bash <skill_dir>/scripts/ctx-slice.sh - 100
```

Stdin spools into a private random temporary file and is cleaned up automatically. `--keep`
explicitly retains the private log and prints its path on stderr; the caller owns its cleanup.
The helper preserves the first/last requested lines, with an omission notice. It bounds lines,
not bytes: narrow a giant single line separately. Set `pipefail` in the calling shell when the
upstream command's status must propagate. Truncation is not a substitute for checking failures.
