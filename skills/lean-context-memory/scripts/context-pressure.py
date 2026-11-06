#!/usr/bin/env python3
"""Read-only, advisory context pressure from observed host context or a Codex session trace."""
import argparse
import json
from pathlib import Path
import sys


def token_count(label, value):
    if type(value) is not int or value < 0:
        raise ValueError(label + " must be a non-negative integer")
    return value


def from_codex_trace(path):
    """Read only an explicitly supplied trace. Prefer active context, not cumulative spend."""
    stream = sys.stdin if path == "-" else Path(path).open(encoding="utf-8")
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
            if (row.get("type") != "event_msg" or not isinstance(payload, dict)
                    or payload.get("type") != "token_count"):
                continue
            info = payload.get("info")
            if not isinstance(info, dict):
                continue
            last = info.get("last_token_usage")
            if not isinstance(last, dict):
                continue
            if "total_tokens" in last:
                used = token_count("last_token_usage.total_tokens", last["total_tokens"])
                metric = "active_context_tokens"
            elif "input_tokens" in last:
                used = token_count("last_token_usage.input_tokens", last["input_tokens"])
                metric = "request_input_proxy"
            else:
                continue
            window = info.get("model_context_window")
            if window is not None:
                window = token_count("model_context_window", window)
                if window == 0:
                    raise ValueError("model_context_window must be greater than zero")
            latest = (used, window, metric)
    finally:
        if stream is not sys.stdin:
            stream.close()
    if latest is None:
        raise ValueError("no usable Codex token_count event with last_token_usage metrics")
    return latest


def classify(pct, checkpoint_at, compact_at, urgent_at):
    if pct >= urgent_at:
        return "urgent", "Refresh ACTIVE_STATE and use host-native compact before substantial new exploration."
    if pct >= compact_at:
        return "compact_recommended", "Refresh ACTIVE_STATE, then consider the host-native compact."
    if pct >= checkpoint_at:
        return "checkpoint", "Refresh ACTIVE_STATE before starting more substantial work."
    return "normal", "Continue normally; update ACTIVE_STATE at natural task boundaries."


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--used-context-tokens", type=int,
                       help="Active-context tokens explicitly reported by the host")
    group.add_argument("--input-tokens", type=int,
                       help="Legacy latest-request input tokens; proxy, NOT active context occupancy")
    group.add_argument("--codex-trace",
                       help="Explicit Codex session JSONL file or - for stdin; never auto-discovered")
    parser.add_argument("--context-window", type=int,
                        help="Exact host-reported active model context capacity (required unless in Codex trace)")
    parser.add_argument("--checkpoint-at", type=float, default=70)
    parser.add_argument("--compact-at", type=float, default=80)
    parser.add_argument("--urgent-at", type=float, default=90)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        if not (0 < args.checkpoint_at < args.compact_at < args.urgent_at <= 100):
            raise ValueError("thresholds must satisfy 0 < checkpoint-at < compact-at < urgent-at <= 100")
        if args.codex_trace is not None:
            used, host_window, metric = from_codex_trace(args.codex_trace)
            source = "codex_trace"
        elif args.used_context_tokens is not None:
            used = token_count("used-context-tokens", args.used_context_tokens)
            host_window, metric, source = None, "active_context_tokens", "explicit"
        else:
            used = token_count("input-tokens", args.input_tokens)
            host_window, metric, source = None, "request_input_proxy", "explicit"

        explicit_window = (token_count("context-window", args.context_window)
                           if args.context_window is not None else None)
        if host_window is not None and explicit_window is not None and host_window != explicit_window:
            raise ValueError("explicit context window disagrees with the latest trace event")
        window = host_window if host_window is not None else explicit_window
        if window is None or window == 0:
            raise ValueError("context-window is required when the host does not report it")

        pct = used * 100.0 / window
        status, action = classify(pct, args.checkpoint_at, args.compact_at, args.urgent_at)
        result = {
            "status": status, "source": source, "metric": metric,
            "used_tokens": used, "context_window_tokens": window,
            "pressure_pct": round(pct, 2),
            "thresholds_pct": {
                "checkpoint": args.checkpoint_at,
                "compact_recommended": args.compact_at,
                "urgent": args.urgent_at,
            },
            "auto_compact": False, "action": action,
            "note": ("Host-reported active context is an observation, not a guarantee of remaining usable space."
                     if metric == "active_context_tokens"
                     else "Request input is a rough proxy, not an active-context reading."),
        }
        if used > window:
            result["warning"] = "observed tokens exceed reported capacity; verify model and trace"
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"{status.upper()}: {used}/{window} {metric} ({pct:.2f}%)")
            print("Action: " + action)
            print(result["note"])
            if "warning" in result:
                print("Warning: " + result["warning"])
            print("Advisory only: no host compact command was invoked.")
        return 0
    except (OSError, ValueError) as exc:
        print("ERROR: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
