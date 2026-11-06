#!/usr/bin/env python3
"""Read-only checks for bounded Markdown project memory; no semantic eviction."""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys


from memory_common import (INDEX_MAX_BYTES, INDEX_MAX_LINES, STATE_MAX_BYTES, STATE_MAX_LINES,
                           batch_source_statuses, budgets, conflict_keys, fact_record, git, local_file, topic_content_lines)


def check(root):
    limits = budgets(root)
    findings = []
    seen = {}
    key_records = []
    commit_cache = {}
    pending_sources = {}
    in_git = git(root, "rev-parse", "--is-inside-work-tree").returncode == 0

    def report(code, location):
        findings.append((code, location))

    def read(name):
        path = local_file(root, name)
        if path is None:
            report("unreadable-memory", name + " (symlink or unsafe path)")
            return None
        try:
            raw = path.read_bytes()
            return raw, raw.decode("utf-8")
        except (OSError, UnicodeError):
            report("unreadable-memory", name)
            return None

    for name, max_lines, max_bytes in [("MEMORY_INDEX.md", INDEX_MAX_LINES, INDEX_MAX_BYTES),
                                       ("ACTIVE_STATE.md", STATE_MAX_LINES, STATE_MAX_BYTES)]:
        result = read("memory/" + name)
        if result is not None:
            raw, text = result
            prefix = "index" if name == "MEMORY_INDEX.md" else "state"
            if len(text.splitlines()) > max_lines:
                report(prefix + "-lines", f"{name}: {len(text.splitlines())}/{max_lines}")
            if max_bytes and len(raw) > max_bytes:
                report(prefix + "-bytes", f"{name}: {len(raw)}/{max_bytes}")
            if name == "MEMORY_INDEX.md":
                for pointer in re.findall(r"`(topics/[^`]+\.md)`", text):
                    target = local_file(root, "memory/" + pointer)
                    if target is None or not target.is_file():
                        report("missing-topic-pointer", pointer)

    topic_dir = local_file(root, "memory/topics")
    if topic_dir is None or not topic_dir.is_dir():
        report("missing-topics", "memory/topics")
        topic_paths = []
    else:
        topic_paths = []
        def walk_error(exc):
            report("unreadable-memory", str(exc.filename))
        for directory, folders, files in os.walk(topic_dir, followlinks=False, onerror=walk_error):
            for folder in folders[:]:
                child = Path(directory) / folder
                if child.is_symlink():
                    report("unsafe-topic-directory", child.relative_to(root).as_posix())
                    folders.remove(folder)
            topic_paths.extend(Path(directory) / name for name in files if name.endswith(".md"))
        topic_paths.sort()
    total = 0
    for path in topic_paths:
        name = path.relative_to(root).as_posix()
        result = read(name)
        if result is None:
            continue
        raw, text = result
        total += len(raw)
        if limits['topic_bytes'] is not None and len(raw) > limits["topic_bytes"]:
            report("topic-budget", f"{name}: {len(raw)}/{limits['topic_bytes']} bytes")
        for number, line in topic_content_lines(text):
            if not re.match(r'^\s*-\s+\S', line):
                if line.strip() and not line.lstrip().startswith(("#", ">")):
                    report("invalid-fact-format", f"{name}:{number}")
                continue
            loc = f"{name}:{number}"
            try:
                fact, metadata, sources = fact_record(line)
            except ValueError as exc:
                reason = str(exc)
                if reason.startswith("invalid fact key"):
                    code = "invalid-key"
                elif reason.startswith("invalid fact state"):
                    code = "invalid-state"
                elif reason.startswith("fact requires"):
                    code = ("invalid-provenance" if "source:" in line and "verified:" in line
                            else "missing-provenance")
                else:
                    code = "invalid-provenance"
                report(code, loc + ": " + reason)
                continue
            fact = fact.strip()
            if metadata.get("key"):
                key_records.append((metadata["key"], fact, loc))
            if fact in seen:
                report("duplicate-fact", f"{loc} duplicates {seen[fact]}")
            else:
                seen[fact] = loc
            verified = metadata["verified"].strip("\x60")
            state = metadata.get("state", "confirmed")
            if state != "confirmed":
                report("pending-review" if state == "review" else "invalid-state", loc)
            if not in_git:
                report("unverified-non-git", loc)
            else:
                if verified not in commit_cache:
                    commit_cache[verified] = git(root, "rev-parse", "--verify", verified + "^{commit}").returncode == 0
                if not commit_cache[verified]:
                    report("unavailable-commit", loc + " " + verified)
            for source in sources:
                dest = local_file(root, source)
                if dest is None:
                    report("unsafe-source", loc + " " + source)
                    continue
                if not dest.is_file():
                    report("missing-source", loc + " " + source)
                    continue
                if not in_git or not commit_cache.get(verified):
                    continue
                pending_sources.setdefault((verified, source), []).append(loc)
    for identity, locations in sorted(conflict_keys(key_records).items()):
        report("potential-conflict", "key=" + identity + "; " + ", ".join(locations))
    if pending_sources:
        statuses = batch_source_statuses(root, pending_sources)
        for key, locations in pending_sources.items():
            code = statuses[key]
            if code:
                for location in locations:
                    report(code, location + " " + key[1])
    if limits['topics_total_bytes'] is not None and total > limits["topics_total_bytes"]:
        report("topics-total-budget", f"{total}/{limits['topics_total_bytes']} bytes")
    return findings, len(topic_paths), total


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_dir", nargs="?", default=".")
    parser.add_argument("--json", action="store_true", help="Machine-readable results; preserves exit codes")
    args = parser.parse_args()
    root = Path(args.project_dir).resolve()
    if not root.is_dir():
        parser.error("project directory does not exist")
    try:
        findings, count, size = check(root)
    except (OSError, ValueError) as exc:
        if args.json:
            print(json.dumps({"status": "error", "error": str(exc)}, ensure_ascii=False))
        else:
            print(f"ERROR: config/check failed: {exc}", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps({
            "status": "review" if findings else "healthy",
            "findings_total": len(findings),
            "topics": count,
            "topic_bytes": size,
            "findings": [{"code": code, "location": location}
                         for code, location in findings],
        }, ensure_ascii=False, indent=2))
    else:
        print(f"{'REVIEW' if findings else 'HEALTHY'}: {len(findings)} findings; {count} topics, {size} UTF-8 bytes (not tokens)")
        for code, location in findings[:18]:
            print(f"- {code}: {location}")
        if len(findings) > 18:
            print(f"... {len(findings) - 18} findings omitted; narrow the topic or fix these and rerun")
    return int(bool(findings))


if __name__ == "__main__":
    sys.exit(main())
