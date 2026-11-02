#!/usr/bin/env python3
"""Read-only checks for bounded Markdown project memory; no semantic eviction."""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys


DEFAULTS = {"topic_bytes": 4096, "topics_total_bytes": 16384}
COMMIT = re.compile(r"[0-9a-fA-F]{7,40}\Z")


def git(root, *args):
    return subprocess.run(["git", "--literal-pathspecs", "-C", str(root), *args], capture_output=True)


def local_file(root, name):
    path = Path(name)
    if path.is_absolute() or ".." in path.parts or any(ord(c) < 32 for c in name):
        return None
    dest = root / path
    if not dest.resolve().is_relative_to(root):
        return None
    if any(p.is_symlink() for p in [dest, *dest.parents] if p != root and p.is_relative_to(root)):
        return None
    return dest


def budgets(root):
    path = root / "memory/.memory-budget.json"
    if not path.exists() and not path.is_symlink():
        return DEFAULTS.copy()
    if local_file(root, "memory/.memory-budget.json") is None:
        raise ValueError("config must be a regular local file")
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ValueError(f"invalid config: {exc}") from exc
    if not isinstance(config, dict) or set(config) - DEFAULTS.keys():
        raise ValueError("config allows only topic_bytes and topics_total_bytes")
    if any(type(value) is not int or value < 1 for value in config.values()):
        raise ValueError("config budgets must be positive integer bytes")
    return DEFAULTS | config


def check(root):
    limits = budgets(root)
    findings = []
    seen = {}
    commit_cache = {}
    source_cache = {}
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

    for name, max_lines, max_bytes in [("MEMORY_INDEX.md", 60, None), ("ACTIVE_STATE.md", 30, 2048)]:
        result = read("memory/" + name)
        if result is not None:
            raw, text = result
            prefix = "index" if name == "MEMORY_INDEX.md" else "state"
            if len(text.splitlines()) > max_lines:
                report(prefix + "-lines", f"{name}: {len(text.splitlines())}/{max_lines}")
            if max_bytes and len(raw) > max_bytes:
                report(prefix + "-bytes", f"{name}: {len(raw)}/{max_bytes}")

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
        if len(raw) > limits["topic_bytes"]:
            report("topic-budget", f"{name}: {len(raw)}/{limits['topic_bytes']} bytes")
        for number, line in enumerate(text.splitlines(), 1):
            match = re.match(r"^\s*-\s+(.+)", line)
            if not match:
                if line.strip() and not line.lstrip().startswith(("#", ">")):
                    report("invalid-fact-format", f"{name}:{number}")
                continue
            parts = match[1].split(" | ")
            fact = parts[0].strip()
            loc = f"{name}:{number}"
            if fact in seen:
                report("duplicate-fact", f"{loc} duplicates {seen[fact]}")
            else:
                seen[fact] = loc
            metadata = {}
            invalid = False
            for part in parts[1:]:
                key, sep, value = part.partition(":")
                if not sep or key.strip() in metadata or key.strip() not in {"source", "verified", "state"}:
                    invalid = True
                else:
                    metadata[key.strip()] = value.strip()
            if invalid:
                report("invalid-provenance", loc)
                continue
            sources = re.findall(r"`([^`]+)`", metadata.get("source", ""))
            verified = metadata.get("verified", "").strip("`")
            if not sources or not COMMIT.fullmatch(verified):
                report("missing-provenance", loc)
                continue
            if not re.fullmatch(r"`[^`]+`(?:\s*,\s*`[^`]+`)*", metadata["source"]):
                report("invalid-provenance", loc)
                continue
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
                key = (verified, source)
                if key not in source_cache:
                    if git(root, "ls-files", "--error-unmatch", "--", source).returncode:
                        code = "untracked-source"
                    else:
                        worktree = git(root, "diff", "--quiet", verified, "--", source)
                        index = git(root, "diff", "--cached", "--quiet", verified, "--", source)
                        statuses = (worktree.returncode, index.returncode)
                        code = "git-check-failed" if any(status > 1 for status in statuses) else ("changed-source" if any(statuses) else None)
                    source_cache[key] = code
                if source_cache[key]:
                    report(source_cache[key], loc + " " + source)
    if total > limits["topics_total_bytes"]:
        report("topics-total-budget", f"{total}/{limits['topics_total_bytes']} bytes")
    return findings, len(topic_paths), total


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_dir", nargs="?", default=".")
    args = parser.parse_args()
    root = Path(args.project_dir).resolve()
    if not root.is_dir():
        parser.error("project directory does not exist")
    try:
        findings, count, size = check(root)
    except (OSError, ValueError) as exc:
        print(f"ERROR: config/check failed: {exc}", file=sys.stderr)
        return 2
    print(f"{'REVIEW' if findings else 'HEALTHY'}: {len(findings)} findings; {count} topics, {size} UTF-8 bytes (not tokens)")
    for code, location in findings[:18]:
        print(f"- {code}: {location}")
    if len(findings) > 18:
        print(f"... {len(findings) - 18} findings omitted; narrow the topic or fix these and rerun")
    return int(bool(findings))


if __name__ == "__main__":
    sys.exit(main())
