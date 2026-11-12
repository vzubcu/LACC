# Exploration helpers

**BF-2b Bash-free preview** (stacked feature branch, not yet a main release):

```sh
node <skill_dir>/scripts/lacc.mjs reference-scan src/checkout.ts publishCheckout --signal checkout.ready
node <skill_dir>/scripts/lacc.mjs signatures src/checkout.py --limit 40 --max-bytes 5000
node <skill_dir>/scripts/lacc.mjs signatures src/checkout.py --require-ast
node <skill_dir>/scripts/lacc.mjs ctx-slice build.log 100
```

`reference-scan` is a bounded heuristic candidate inventory, not a resolved
call graph. It uses `git ls-files` when possible and an incomplete
filesystem fallback otherwise, excludes common sensitive files and does
not follow symlinks. `signatures` uses an optional Python stdlib parser
**directly (no Bash)** for exact Python AST starts, and otherwise
reports heuristic limitations; `--require-ast` refuses that downgrade.
Without Python, no complete Python syntax or nested-scope guarantee is
claimed. Exact project-specific compiler semantics are out of scope.

The following original shell commands remain supported for backward
compatibility and for parity testing on POSIX machines:

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

Legacy Python searches can use Git/ripgrep inventories with their ignore rules. Root dist/vendor/memory directories are
excluded; bin/build/obj and nested source directories remain searchable unless ignored or explicitly excluded.
Excluded and oversized/binary/unsafe counts and exhausted budgets disclose incomplete coverage.
Broad searches additionally exclude common credential files (.env*, .npmrc, .netrc,
*.pem, *.key, *.p12, *.pfx and known private-key directories), even when tracked.
The legacy Python target may override a user-supplied exclusion, but the
new native Node helper refuses to inspect an explicitly selected known
sensitive target. Avoid publishing source extracts or private log paths.

```bash
bash <skill_dir>/scripts/ast-skeleton.sh src/checkout.py --limit 40 --max-bytes 5000
```

The compatibility name still calls the legacy bounded Python extractor.
The BF-2b native `signatures` command can call that Python parser without Bash
or make a clearly labeled heuristic fallback. Python uses stdlib AST definition starts;
other languages use declaration heuristics. Multiline signatures, methods and dynamic declarations
may need targeted source reads. Decorators alone are not signatures. This is not a resolved graph
or a complete multi-language AST parser.

```bash
bash <skill_dir>/scripts/ctx-slice.sh build.log 100
some_command 2>&1 | bash <skill_dir>/scripts/ctx-slice.sh - 100
```

Stdin is streamed in memory without writing a temporary log by default. `--keep`
explicitly saves stdin into a private file and prints its path on stderr; the caller owns its cleanup.
`--keep` applies only to stdin.
The helper preserves the first/last requested lines, with an omission notice. It bounds lines,
not bytes: narrow a giant single line separately. Set `pipefail` in the calling shell when the
upstream command's status must propagate. Truncation is not a substitute for checking failures.
