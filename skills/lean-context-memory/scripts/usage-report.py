#!/usr/bin/env python3
"""Compare matched runs using reported token usage, never bytes or file lengths."""

import argparse
import json
import math
from pathlib import Path
import statistics
import sys

from usage_providers import FORMATS, normalize_response


COUNTS = ("input_tokens", "cached_input_tokens", "output_tokens")
IDENTITY = ("task_id", "pair_id", "model", "fixture_commit", "config_id", "cache_mode")


def count(value):
    if type(value) is not int or value < 0:
        raise ValueError("token counts must be non-negative integers")
    return value


def usage(value, peak=True):
    if not isinstance(value, dict):
        raise ValueError("usage must be an object")
    result = {key: count(value[key]) for key in COUNTS}
    if result["cached_input_tokens"] > result["input_tokens"]:
        raise ValueError("cached input is a subset of input tokens")
    result["cache_write_input_tokens"] = count(value.get("cache_write_input_tokens", 0))
    if "total_tokens" in value and count(value["total_token…259 tokens truncated…), str) or not row[key] for key in IDENTITY + ("trace_path",)):
            raise ValueError("each run requires task_id, pair_id, model, fixture_commit, config_id, cache_mode and trace_path")
        if row["cache_mode"] not in {"cold", "warm"}:
            raise ValueError("cache_mode must be cold or warm")
        if row.get("source") not in {"provider_usage", "codex_token_count"}:
            raise ValueError("source must identify reported usage, not a byte/token estimate")
        if row.get("quality_passed") is not None and type(row["quality_passed"]) is not bool:
            raise ValueError("quality_passed must be true, false or null")
        duration = row.get("duration_ms")
        if duration is not None and (type(duration) not in (int, float) or not math.isfinite(duration) or duration < 0):
            raise ValueError("duration_ms must be a finite non-negative harness measurement")
        row["usage"] = usage(row["usage"])
        key = (row["task_id"], row["pair_id"])
        if key in runs:
            raise ValueError("duplicate task/pair in " + str(path))
        runs[key] = row
    if not runs:
        raise ValueError("no run measurements in " + str(path))
    return runs


def aggregate(runs, rates):
    data = {key: sum(row["usage"][key] for row in runs) for key in COUNTS}
    data["uncached_input_tokens"] = data["input_tokens"] - data["cached_input_tokens"]
    data["total_tokens"] = data["input_tokens"] + data["output_tokens"]
    data["peak_input_tokens"] = max(row["usage"]["peak_input_tokens"] for row in runs)
    data["duration_ms"] = sum(row["duration_ms"] for row in runs) if all(row.get("duration_ms") is not None for row in runs) else None
    if rates is not None:
        if any(row["usage"]["cache_write_input_tokens"] for row in runs):
            raise ValueError("cache-write pricing is unsupported; omit rates and report token counts")
        data["estimated_cost"] = sum(data[key] * rate for key, rate in zip(
            ("uncached_input_tokens", "cached_input_tokens", "output_tokens"), rates)) / 1_000_000
    return data


def percent(before, after):
    return (before - after) * 100 / before if before else None


def compare(args):
    before, after = load_runs(args.baseline), load_runs(args.optimized)
    if before.keys() != after.keys():
        raise ValueError("task/pair sets must match; do not omit failed or expensive runs")
    for key in before:
        if any(before[key][field] != after[key][field] for field in IDENTITY):
            raise ValueError("matched runs must use the same model version, fixture revision and cache regime")
    rate_values = (args.input_rate, args.cached_input_rate, args.output_rate)
    rates = None
    if any(value is not None for value in rate_values):
        if any(value is None or not math.isfinite(value) or value < 0 for value in rate_values):
            raise ValueError("supply all three finite non-negative per-million token rates")
        rates = rate_values
    left, right = aggregate(list(before.values()), rates), aggregate(list(after.values()), rates)
    passed = all(row.get("quality_passed") is True for row in [*before.values(), *after.values()])
    savings = {key: percent(left[key], right[key]) if left[key] is not None and right[key] is not None else None for key in left} if passed else None
    paired = [percent(before[key]["usage"]["input_tokens"] + before[key]["usage"]["output_tokens"],
                      after[key]["usage"]["input_tokens"] + after[key]["usage"]["output_tokens"]) for key in before]
    valid_pairs = [value for value in paired if value is not None]
    repetitions = {}
    for task, _ in before:
        repetitions[task] = repetitions.get(task, 0) + 1
    pilot = min(repetitions.values()) < 5
    note = "Pilot: fewer than five matched repetitions per task." if pilot else "Matched observations; no causal or statistical-significance claim."
    note += " Peak input is an observed context proxy, not exact context occupancy; cached input is already included in input."
    if not passed:
        note += " Quality failed or is unverified; savings claims are blocked."
    quality_counts = {}
    for label, group in [("baseline", before), ("optimized", after)]:
        quality_counts[label] = {"passed": sum(row.get("quality_passed") is True for row in group.values()),
                                "failed": sum(row.get("quality_passed") is False for row in group.values()),
                                "unverified": sum(row.get("quality_passed") is None for row in group.values())}
    result = {"comparable": passed, "pairs": len(before), "baseline": left, "optimized": right,
              "quality_counts": quality_counts,
              "savings_pct": savings, "median_paired_total_savings_pct": statistics.median(valid_pairs) if passed and valid_pairs else None,
              "paired_total_savings_range_pct": [min(valid_pairs), max(valid_pairs)] if passed and valid_pairs else None,
              "note": note}
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"{'COMPARABLE' if passed else 'QUALITY BLOCKED'}: {len(before)} matched run pairs")
        for key in left:
            saved = savings[key] if savings else None
            suffix = f"; savings {saved:.2f}%" if saved is not None else ""
            print(f"{key}: {left[key]} -> {right[key]}{suffix}")
        if passed:
            print(f"Paired total-token savings: median {result['median_paired_total_savings_pct']}; range {result['paired_total_savings_range_pct']} (%)")
        print("Quality counts: " + json.dumps(quality_counts, sort_keys=True))
        print(note)
    return 0 if passed else 1


def capture_record(args, source, counts, peak, updates, **extra):
    if args.duration_ms is not None and (not math.isfinite(args.duration_ms) or args.duration_ms < 0):
        raise ValueError("duration-ms must be a finite non-negative harness measurement")
    record = {field: getattr(args, field) for field in IDENTITY}
    record.update(source=source, trace_path=str(Path(args.trace).resolve()),
                  quality_passed={"passed": True, "failed": False, "unverified": None}[args.quality],
                  duration_ms=args.duration_ms, usage=counts | {"peak_input_tokens": peak}, usage_updates=updates,
                  **extra)
    print(json.dumps(record))
    return 0


def capture_api(args):
    totals = dict.fromkeys((*COUNTS, "cache_write_input_tokens"), 0)
    seen = {}
    peak = 0
    for row in rows(args.trace):
        request_id, model, normalized = normalize_response(args.format, row)
        if model != args.model:
            raise ValueError("trace contains a different model or mixed model versions")
        values = usage(normalized, peak=False)
        if request_id in seen:
            if values != seen[request_id]:
                raise ValueError("conflicting duplicate or partial streaming response; export final usage once")
            continue
        seen[request_id] = values
        for key in totals:
            totals[key] += values[key]
        peak = max(peak, values["input_tokens"])
    if not seen:
        raise ValueError("no final provider usage records")
    return capture_record(args, "provider_usage", totals, peak, len(seen), provider_format=args.format)


def capture(args):
    previous = None
    peak = updates = 0
    models = set()
    for row in rows(args.trace):
        payload = row.get("payload", {})
        if not isinstance(payload, dict):
            raise ValueError("invalid trace payload")
        if "spawn_agent" in str(payload.get("name", "")):
            raise ValueError("delegated work requires aggregated child usage; parent-only capture is incomplete")
        if row.get("type") == "turn_context" and payload.get("model"):
            models.add(payload["model"])
        if row.get("type") != "event_msg" or payload.get("type") != "token_count" or not payload.get("info"):
            continue
        info = payload["info"]
        total, last = usage(info["total_token_usage"], peak=False), usage(info["last_token_usage"], peak=False)
        if previous is not None and any(total[key] < previous[key] for key in total):
            raise ValueError("usage counter reset; use a complete fresh session per run")
        delta = {key: total[key] - (previous[key] if previous else 0) for key in total}
        if any(delta.values()):
            if delta != last:
                raise ValueError("incomplete trace or non-request usage update; start a fresh run")
            updates += 1
        peak = max(peak, last["input_tokens"])
        previous = total
    if previous is None or not updates:
        raise ValueError("no usable reported token_count records")
    if models and models != {args.model}:
        raise ValueError("trace contains a different model or mixed model versions")
    return capture_record(args, "codex_token_count", previous, peak, updates)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    comp = commands.add_parser("compare")
    comp.add_argument("baseline")
    comp.add_argument("optimized")
    comp.add_argument("--json", action="store_true")
    for flag in ("input-rate", "cached-input-rate", "output-rate"):
        comp.add_argument("--" + flag, type=float)
    for name, help_text in [("capture-codex", "Import a complete fresh Codex CLI session JSONL"),
                            ("capture-api", "Import final provider responses from any agent's API harness")]:
        cap = commands.add_parser(name, help=help_text)
        cap.add_argument("trace")
        if name == "capture-api":
            cap.add_argument("--format", choices=FORMATS, required=True)
        for field in IDENTITY:
            cap.add_argument("--" + field.replace("_", "-"), required=True, choices=["cold", "warm"] if field == "cache_mode" else None)
        cap.add_argument("--quality", choices=["passed", "failed", "unverified"], default="unverified")
        cap.add_argument("--duration-ms", type=float)
    args = parser.parse_args()
    try:
        if args.command == "compare":
            return compare(args)
        return capture_api(args) if args.command == "capture-api" else capture(args)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
