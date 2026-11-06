#!/usr/bin/env python3
"""Rank task-relevant, source-backed memory facts under a UTF-8 response budget."""
import argparse
import json
import re
from pathlib import Path
import sys

from memory_common import (COMMIT, batch_source_statuses, budgets, fact_lines,
                           fact_record, git, local_file, topic_files)


STOP = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how",
    "in", "into", "is", "of", "on", "or", "the", "to", "what", "where", "with",
    "si", "sau", "din", "la", "cu", "pe", "pentru", "care", "este",
}
MAX_TOPIC_BYTES = 1024 * 1024
MAX_SCAN_BYTES = 16 * 1024 * 1024
MAX_VERIFY_CANDIDATES = 200


def terms(value):
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", value)
    return set(word for word in re.findall(r"[^\W_]+", value.casefold())
               if len(word) > 1 and word not in STOP)


def rank(query, fact, sources, topic):
    words = terms(query)
    if not words:
        return 0, 0
    text_words = terms(fact)
    source_words = terms(" ".join(sources))
    topic_words = terms(topic)
    matches = words & (text_words | source_words | topic_words)
    if not matches:
        return 0, 0
    score = 10 * len(matches) + 4 * len(words & text_words)
    score += 2 * len(words & source_words) + len(words & topic_words)
    if query.casefold().strip() in fact.casefold():
        score += 6
    return score, len(matches)


def load_candidates(root, query):
    candidates = []
    scanned_bytes = 0
    invalid_facts = 0
    scan_incomplete = False
    for path in topic_files(root):
        size = path.stat().st_size
        if size > MAX_TOPIC_BYTES or scanned_bytes + size > MAX_SCAN_BYTES:
            scan_incomplete = True
            continue
        raw = path.read_bytes()
        scanned_bytes += len(raw)
        text = raw.decode("utf-8")  # reject malformed memory rather than silently ignoring it
        relative = path.relative_to(root).as_posix()
        for number, line in fact_lines(text):
            try:
                fact, metadata, sources = fact_record(line)
            except ValueError:
                invalid_facts += 1
                continue
            score, coverage = rank(query, fact, sources, relative)
            if score:
                candidates.append({
                    "location": f"{relative}:{number}",
                    "fact": fact.strip(),
                    "sources": sources,
                    "verified_commit": metadata["verified"].strip(chr(96)),
                    "state": metadata.get("state", "confirmed"),
                    "score": score,
                    "matched_terms": coverage,
                })
    candidates.sort(key=lambda r: (-r["score"], -r["matched_terms"], r["location"]))
    return candidates, invalid_facts, scan_incomplete


def validate_candidates(root, candidates):
    git_available = git(root, "rev-parse", "--is-inside-work-tree").returncode == 0
    verified_commits = {}
    pending = set()
    for row in candidates:
        revision = row["verified_commit"]
        if revision not in verified_commits:
            verified_commits[revision] = (
                git_available and bool(COMMIT.fullmatch(revision)) and
                git(root, "rev-parse", "--verify", revision + "^{commit}").returncode == 0)
        if not verified_commits[revision]:
            row["freshness"] = "unavailable-commit"
            continue
        for source in row["sources"]:
            dest = local_file(root, source)
            if dest is None or not dest.is_file():
                row["freshness"] = "unsafe-or-missing-source"
                break
        else:
            pending.update((revision, source) for source in row["sources"])
    checked = batch_source_statuses(root, pending) if pending else {}
    for row in candidates:
        if "freshness" in row:
            continue
        revision = row["verified_commit"]
        reasons = [checked[(revision, source)] for source in row["sources"]]
        row["freshness"] = next((reason for reason in reasons if reason), "source-unchanged")
    for row in candidates:
        row["review_required"] = (
            row["state"] != "confirmed" or row["freshness"] != "source-unchanged")


def encode_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"


def render_json(query, candidates, stats, limit, max_bytes):
    result = {
        "query": query, "status": "complete", "results": [],
        "stats": stats,
        "note": "Source-unchanged means Git evidence matches; it is not semantic proof.",
    }
    selected = 0
    for row in candidates:
        if selected >= limit:
            break
        result["results"].append(dict(row))
        if len(encode_json(result).encode("utf-8")) > max_bytes - 60:
            result["results"].pop()
            break
        selected += 1
    stats["returned"] = selected
    stats["output_truncated"] = len(candidates) > selected
    if stats["scan_incomplete"] or stats["verification_limited"]:
        result["status"] = "incomplete"
    output = encode_json(result)
    if len(output.encode("utf-8")) > max_bytes:
        raise ValueError("query or metadata too long for output budget")
    sys.stdout.write(output)


def render_text(query, candidates, stats, limit, max_bytes):
    header = f"MEMORY SEARCH: {query!r}; Git evidence checked, not semantic proof\n"
    selected = []
    size = len(header.encode("utf-8"))
    room = max_bytes - 240
    if size > room:
        raise ValueError("query too long for output budget")
    for row in candidates:
        if len(selected) >= limit:
            break
        state = "confirmed" if not row["review_required"] else "REVIEW"
        evidence = ", ".join(chr(96) + source + chr(96) for source in row["sources"])
        line = (f"- [{state}; {row['freshness']}; rank={row['score']}] "
                f"{row['location']} {row['fact']} | source: {evidence}"
                f" | verified: {chr(96)}{row['verified_commit']}{chr(96)}\n")
        if size + len(line.encode("utf-8")) > room:
            break
        selected.append(line)
        size += len(line.encode("utf-8"))
    stats["returned"] = len(selected)
    stats["output_truncated"] = len(selected) < len(candidates)
    footer = (f"[RETURNED {stats['returned']}; MATCHES {stats['matched']}; "
              f"SKIPPED untrusted={stats['skipped_untrusted']}, invalid={stats['invalid_facts']}; "
              f"scan_incomplete={stats['scan_incomplete']}; "
              f"verification_limited={stats['verification_limited']}; "
              f"output_truncated={stats['output_truncated']}]\n")
    if size + len(footer.encode("utf-8")) > max_bytes:
        raise ValueError("query or metadata too long for output budget")
    sys.stdout.write(header + "".join(selected) + footer)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_dir", nargs="?", default=".")
    parser.add_argument("--query", required=True, help="Task/topic description; lexical matching")
    parser.add_argument("--limit", type=int, default=5, help="Maximum returned facts (1-20)")
    parser.add_argument("--max-bytes", type=int, help="UTF-8 output cap, limited by project recall budget")
    parser.add_argument("--include-review", action="store_true",
                        help="Include review-needed candidates, clearly labeled; never auto-promoted")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        root = Path(args.project_dir).resolve()
        if not root.is_dir():
            raise ValueError("project directory does not exist")
        if not (1 <= args.limit <= 20):
            raise ValueError("limit must be between 1 and 20")
        if not terms(args.query) or len(args.query.encode("utf-8")) > 256:
            raise ValueError("query must contain useful terms and at most 256 UTF-8 bytes")
        max_bytes = budgets(root)["load_bytes"]
        if args.max_bytes is not None:
            if args.max_bytes < 512:
                raise ValueError("max-bytes must be at least 512")
            max_bytes = min(max_bytes, args.max_bytes)
        matches, invalid_facts, scan_incomplete = load_candidates(root, args.query)
        limited = len(matches) > MAX_VERIFY_CANDIDATES
        candidates = matches[:MAX_VERIFY_CANDIDATES]
        validate_candidates(root, candidates)
        ready = [row for row in candidates if not row["review_required"]]
        skipped_untrusted = len(candidates) - len(ready)
        selected = candidates if args.include_review else ready
        stats = {
            "matched": len(matches), "invalid_facts": invalid_facts,
            "skipped_untrusted": skipped_untrusted,
            "scan_incomplete": scan_incomplete, "verification_limited": limited,
            "returned": 0, "output_truncated": False,
        }
        if args.json:
            render_json(args.query, selected, stats, args.limit, max_bytes)
        else:
            render_text(args.query, selected, stats, args.limit, max_bytes)
        return 0
    except (OSError, UnicodeError, ValueError) as exc:
        print("ERROR: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
