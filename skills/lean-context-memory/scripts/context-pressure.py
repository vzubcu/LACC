#!/usr/bin/env python3
"""Report advisory context pressure from explicit usage or a supplied Codex trace; never compacts automatically."""
import argparse
import json
from pathlib import Path
import sys


def non_negative_int(name, value):
    if type(value) is not int or value < 0:
        raise ValueError(f"{name} must be a non-negative integer")
    return value


def latest_codex_input(path):
    stream = sys.stdin if path == "-" else Path(path).open(encoding="utf-8")
    close = stream is not sys.stdin
    latest = None
    try:
        for number, line in enumerate(stream, 1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{number}: invalid JSON") from exc
            if not isinstance(row, dict):
                raise ValueError(f"{path}:{number}: record must be an object")
            payload = row.get("payload")
            if row.get("type") != "event_msg" or not isinstance(payload, dict) or payload.get("type") != "token_count":
                continue
            info = payload.get("info")
            if not isinstance(info, dict):
                continue
            last = info.get("last_token_usage")
            if not isinstance(last, dict) or "input_tokens" not in last:
                continue
            latest = non_negative_int("last_token_usage.input_tokens", last["input_tokens"])
    finally:
        if close:
            stream.close()
    if latest is None:
        raise ValueError("no usable Codex token_count record with last_token_usage.input_tokens")
    return latest


def classify(percent, checkpoint_at, compact_at, urgent_at):
    if percent >= urgent_at:
        return (
            "urgent",
            "Checkpoint ACTIVE_STATE now. Avoid substantial new exploration until the host-native context compaction completes; reload hot memory afterward.",
        )
    if percent >= compact_at:
        return (
            "compact_recommended",
            "Refresh ACTIVE_STATE, then use the host-native context compaction before substantial new work; reload hot memory afterward.",
        )
    if percent >= checkpoint_at:
        return (
            "checkpoint",
            "Refresh ACTIVE_STATE before the next substantial task so a later context compaction can preserve the handoff.",
        )
    return ("normal", "Continue normally; update ACTIVE_STATE at natural task boundaries.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--input-tokens", type=int, help="Observed current/main-request input tokens reported by the host")
    source.add_argument("--codex-trace", help="Explicit Codex session JSONL path, or - for stdin; no trace discovery is performed")
    parser.add_argument("--context-window", type=int, required=True, help="Known context-window size for the active model")
    parser.add_argument("--checkpoint-at", type=float, default=70.0)
    parser.add_argument("--compact-at", type=float, default=80.0)
    parser.add_argument("--urgent-at", type=float, default=90.0)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        window = non_negative_int("context-window", args.context_window)
        if window == 0:
            raise ValueError("context-window must be greater than zero")
        if not (0 < args.checkpoint_at < args.compact_at < args.urgent_at <= 100):
            raise ValueError("thresholds must satisfy 0 < checkpoint-at < compact-at < urgent-at <= 100")
        if args.input_tokens is not None:
            observed = non_negative_int("input-tokens", args.input_tokens)
            source_name = "explicit"
        else:
            observed = latest_codex_input(args.codex_trace)
            source_name = "codex_trace"

        percent = observed * 100.0 / window
        status, action = classify(percent, args.checkpoint_at, args.compact_at, args.urgent_at)
        result = {
            "status": status,
            "source": source_name,
            "observed_input_tokens": observed,
            "context_window_tokens": window,
            "pressure_pct": round(percent, 2),
            "thresholds_pct": {
                "checkpoint": args.checkpoint_at,
                "compact_recommended": args.compact_at,
                "urgent": args.urgent_at,
            },
            "checkpoint_required_before_compaction": status in {"checkpoint", "compact_recommended", "urgent"},
            "auto_compact": False,
            "action": action,
            "note": "Observed request input is a context-pressure proxy, not exact free context. No files or host commands were changed or invoked.",
        }
        if observed > window:
            result["warning"] = "observed input exceeds the supplied context window; verify the trace and model window"
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"{status.upper()}: {observed}/{window} observed input tokens ({percent:.2f}%)")
            print("Action: " + action)
            if "warning" in result:
                print("Warning: " + result["warning"])
            print("Advisory only: no automatic compact command was executed.")
        return 0
    except (OSError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
