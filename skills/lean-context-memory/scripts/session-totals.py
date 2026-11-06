#!/usr/bin/env python3
"""Compare matched *reported total tokens only* (e.g., JetBrains Session explorer)."""
import argparse
import json
from pathlib import Path
import statistics
import sys

MATCH = ("task_id", "pair_id", "model", "fixture_commit", "config_id", "cache_mode")
SOURCES = {"jetbrains_session_explorer", "host_session_total"}


def read_runs(path):
    runs = {}
    session_ids = set()
    with Path(path).open(encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
                if not isinstance(row, dict):
                    raise ValueError("record must be a JSON object")
                for field in MATCH + ("session_id",):
                    if not isinstance(row.get(field), str) or not row[field].strip():
                        raise ValueError("missing or invalid " + field)
                if row.get("cache_mode") not in {"cold", "warm"}:
                    raise ValueError("cache_mode must be cold or warm")
                if row.get("source") not in SOURCES:
                    raise ValueError("source must name a reporting system, not an estimate")
                if type(row.get("total_tokens")) is not int or row["total_tokens"] <= 0:
                    raise ValueError("total_tokens must be a positive reported integer")
                if row.get("quality_passed") is not None and type(row["quality_passed"]) is not bool:
                    raise ValueError("quality_passed must be true, false or null")
                key = (row["task_id"], row["pair_id"])
                if key in runs:
                    raise ValueError("duplicate task/pair")
                if row["session_id"] in session_ids:
                    raise ValueError("duplicate session_id within an arm")
                session_ids.add(row["session_id"])
                runs[key] = row
            except (json.JSONDecodeError, ValueError) as exc:
                raise ValueError(f"{path}:{line_number}: {exc}") from exc
    if not runs:
        raise ValueError("no reported measurements")
    return runs


def compare(left_path, right_path):
    left, right = read_runs(left_path), read_runs(right_path)
    if {x["session_id"] for x in left.values()} & {x["session_id"] for x in right.values()}:
        raise ValueError("session_id is reused across baseline and optimized")
    for field in ("model", "config_id", "cache_mode", "source"):
        if len({r[field] for r in [*left.values(), *right.values()]}) != 1:
            raise ValueError("mixed " + field + " values across benchmark; separate these experiments")
    if left.keys() != right.keys():
        raise ValueError("task/pair sets differ; do not omit failed or expensive attempts")
    for key in left:
        if any(left[key][field] != right[key][field] for field in MATCH):
            raise ValueError(f"unmatched metadata for task/pair {key!r}")
        if left[key]["source"] != right[key]["source"]:
            raise ValueError("reporting source differs across paired sessions")
        if left[key]["session_id"] == right[key]["session_id"]:
            raise ValueError("baseline and optimized must be distinct sessions")
    before = sum(x["total_tokens"] for x in left.values())
    after = sum(x["total_tokens"] for x in right.values())
    pass_all = all(x.get("quality_passed") is True for x in [*left.values(), *right.values()])
    paired = [
        (left[k]["total_tokens"] - right[k]["total_tokens"]) * 100 / left[k]["total_tokens"]
        for k in left
    ]
    counts = {}
    for task, pair in left:
        counts[task] = counts.get(task, 0) + 1
    return {
        "comparable": pass_all,
        "pairs": len(left),
        "source": next(iter(left.values()))["source"],
        "baseline_total_tokens": before,
        "optimized_total_tokens": after,
        "savings_pct": round((before - after) * 100 / before, 4) if pass_all else None,
        "median_paired_savings_pct": round(statistics.median(paired), 4) if pass_all else None,
        "paired_range_pct": [round(min(paired), 4), round(max(paired), 4)] if pass_all else None,
        "quality_counts": {
            label: {
                "passed": sum(r.get("quality_passed") is True for r in rows.values()),
                "failed": sum(r.get("quality_passed") is False for r in rows.values()),
                "unverified": sum(r.get("quality_passed") is None for r in rows.values()),
            }
            for label, rows in (("baseline", left), ("optimized", right))
        },
        "pilot": min(counts.values()) < 5,
        "note": ("Total tokens only; input/output/cache breakdown and cost cannot be inferred. "
                 "Compare fresh, matched, independently verified agent sessions. "
                 "Results from fewer than five pairs per task are a pilot."),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline")
    parser.add_argument("optimized")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        result = compare(args.baseline, args.optimized)
    except (OSError, ValueError) as exc:
        print("ERROR: " + str(exc), file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"{'COMPARABLE' if result['comparable'] else 'QUALITY BLOCKED'}: {result['pairs']} pairs")
        print(f"Reported total tokens: {result['baseline_total_tokens']} -> {result['optimized_total_tokens']}")
        print(f"Savings %: {result['savings_pct']}")
        print(result["note"])
    return 0 if result["comparable"] else 1


if __name__ == "__main__":
    sys.exit(main())
