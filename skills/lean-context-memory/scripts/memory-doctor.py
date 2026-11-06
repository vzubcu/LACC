#!/usr/bin/env python3
"""Read-only diagnostic and triage plan for source-backed project memory."""
import argparse
from collections import Counter
import json
from pathlib import Path
import sys

from memory_common import (COMMIT, batch_source_statuses, budgets,
                           conflict_keys, fact_lines, fact_record,
                           git, local_file, topic_files)

MAX_TOPIC_BYTES = 1024 * 1024
MAX_SCAN_BYTES = 16 * 1024 * 1024
MAX_FACTS = 1000

ACTIONS = {
    "invalid-fact": "Repair fact syntax and provenance; verify before confirming.",
    "changed-source": "Inspect current source and tests; update the claim or revalidate after review.",
    "untracked-source": "Commit and review the real source before attaching provenance.",
    "missing-source": "Find the replacement source; never fabricate a file or commit.",
    "unsafe-source": "Replace the unsafe reference with a permitted, reviewed source.",
    "unavailable-commit": "Recover the checked revision or re-establish provenance manually.",
    "pending-review": "Resolve the hypothesis against current code and tests.",
    "potential-conflict": "Compare keyed claims against code; reconcile manually, never choose automatically.",
}


def scan(root):
    facts = []
    issues = []
    scanned = 0
    incomplete = False
    for path in topic_files(root):
        size = path.stat().st_size
        if size > MAX_TOPIC_BYTES or scanned + size > MAX_SCAN_BYTES:
            incomplete = True
            continue
        raw = path.read_bytes()
        scanned += len(raw)
        relative = path.relative_to(root).as_posix()
        for number, line in fact_lines(raw.decode("utf-8")):
            location = f"{relative}:{number}"
            if len(facts) >= MAX_FACTS:
                incomplete = True
                break
            try:
                fact, data, sources = fact_record(line)
            except ValueError:
                issues.append({"code": "invalid-fact", "location": location,
                               "action": ACTIONS["invalid-fact"]})
                continue
            facts.append({
                "location": location, "fact": fact.strip(), "key": data.get("key"),
                "sources": sources, "revision": data["verified"].strip(chr(96)),
                "state": data.get("state", "confirmed"),
            })
        if len(facts) >= MAX_FACTS:
            incomplete = True
            break

    identities = conflict_keys((r["key"], r["fact"], r["location"]) for r in facts)
    for key, locations in sorted(identities.items()):
        issues.append({
            "code": "potential-conflict", "key": key,
            "locations": locations[:8], "related_count": len(locations),
            "action": ACTIONS["potential-conflict"],
        })
    in_git = git(root, "rev-parse", "--is-inside-work-tree").returncode == 0
    known_revisions = {}
    pending = set()
    for fact in facts:
        revision, location = fact["revision"], fact["location"]
        if revision not in known_revisions:
            known_revisions[revision] = (
                in_git and bool(COMMIT.fullmatch(revision)) and
                git(root, "rev-parse", "--verify", revision + "^{commit}").returncode == 0)
        if not known_revisions[revision]:
            issues.append({"code": "unavailable-commit", "location": location,
                           "action": ACTIONS["unavailable-commit"]})
        for source in fact["sources"]:
            dest = local_file(root, source)
            if dest is None:
                issues.append({"code": "unsafe-source", "location": location,
                               "source": source, "action": ACTIONS["unsafe-source"]})
            elif not dest.is_file():
                issues.append({"code": "missing-source", "location": location,
                               "source": source, "action": ACTIONS["missing-source"]})
            elif known_revisions[revision]:
                pending.add((revision, source))
        if fact["state"] == "review":
            issues.append({"code": "pending-review", "location": location,
                           "action": ACTIONS["pending-review"]})

    statuses = batch_source_statuses(root, pending) if pending else {}
    for fact in facts:
        for source in fact["sources"]:
            code = statuses.get((fact["revision"], source))
            if code:
                issues.append({"code": code, "location": fact["location"],
                               "source": source, "action": ACTIONS[code]})

    weight = {
        "potential-conflict": 0, "changed-source": 1, "missing-source": 1,
        "unsafe-source": 1, "untracked-source": 1, "unavailable-commit": 1,
        "invalid-fact": 2, "pending-review": 3,
    }
    issues.sort(key=lambda row: (weight[row["code"]], row["code"],
                                  row.get("location", ""), row.get("key", "")))
    return facts, issues, scanned, incomplete


def report(issues, scanned, facts, incomplete, max_items, max_bytes, as_json):
    counts = dict(sorted(Counter(issue["code"] for issue in issues).items()))
    status = "incomplete" if incomplete else ("review" if issues else "healthy")
    result = {
        "status": status, "total_issues": len(issues), "facts_scanned": facts,
        "topic_bytes_scanned": scanned, "counts": counts,
        "scan_incomplete": incomplete, "items": [], "output_truncated": False,
        "note": "Read-only suggestions. Matching source hashes never proves semantic correctness.",
    }
    if as_json:
        for issue in issues[:max_items]:
            result["items"].append(issue)
            encoded = json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            if len(encoded) > max_bytes - 60:
                result["items"].pop()
                break
        result["output_truncated"] = len(result["items"]) < len(issues)
        text = json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n"
        if len(text.encode("utf-8")) > max_bytes:
            raise ValueError("diagnostic header exceeds response budget; use a larger --max-bytes")
    else:
        header = (f"{status.upper()}: {len(issues)} issues; {facts} facts; "
                  f"{scanned} bytes scanned; counts={counts}\n")
        if len(header.encode("utf-8")) > max_bytes - 120:
            raise ValueError("diagnostic summary exceeds response budget")
        lines = []
        size = len(header.encode("utf-8"))
        for issue in issues[:max_items]:
            where = issue.get("location", ",".join(issue.get("locations", [])))
            identity = " key=" + issue["key"] if "key" in issue else ""
            source = " source=" + issue["source"] if "source" in issue else ""
            line = f"- {issue['code']}: {where}{identity}{source}; {issue['action']}\n"
            if size + len(line.encode("utf-8")) > max_bytes - 120:
                break
            lines.append(line)
            size += len(line.encode("utf-8"))
        result["output_truncated"] = len(lines) < len(issues)
        footer = (f"[scan_incomplete={incomplete}; "
                  f"output_truncated={result['output_truncated']}; "
                  f"shown={len(lines)}/{len(issues)}; no memory was changed]\n")
        text = header + "".join(lines) + footer
        if len(text.encode("utf-8")) > max_bytes:
            raise ValueError("diagnostic summary exceeds response budget")
    sys.stdout.write(text)
    return status


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_dir", nargs="?", default=".")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--limit", type=int, default=20, help="Maximum issue descriptions (1-50)")
    parser.add_argument("--max-bytes", type=int, help="UTF-8 output bound; limited by project load_bytes")
    args = parser.parse_args()
    try:
        root = Path(args.project_dir).resolve()
        if not root.is_dir():
            raise ValueError("project directory does not exist")
        if not 1 <= args.limit <= 50:
            raise ValueError("limit must be between 1 and 50")
        cap = budgets(root)["load_bytes"]
        if args.max_bytes is not None:
            if args.max_bytes < 512:
                raise ValueError("max-bytes must be >=512")
            cap = min(cap, args.max_bytes)
        facts, issues, scanned, incomplete = scan(root)
        status = report(issues, scanned, len(facts), incomplete, args.limit, cap, args.json)
        return 0 if status == "healthy" else 1
    except (OSError, UnicodeError, ValueError) as exc:
        print("ERROR: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
