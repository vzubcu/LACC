"""Availability guard for tests of the retained POSIX Bash compatibility layer.

The Node CLI has its own native regression suites. An unavailable/denied Bash
may skip *only* legacy shell tests; it must not turn them into PASS.
"""
import functools
import os
import subprocess
import unittest


@functools.lru_cache(maxsize=1)
def legacy_bash_available():
    try:
        result = subprocess.run(
            ["bash", "-c", "printf LACC_BASH_OK"],
            capture_output=True, timeout=5,
            env=dict(os.environ, GIT_TERMINAL_PROMPT="0"),
        )
        return result.returncode == 0 and result.stdout == b"LACC_BASH_OK"
    except (OSError, subprocess.TimeoutExpired):
        return False


def require_legacy_bash(case):
    if not legacy_bash_available():
        case.skipTest("Legacy Bash execution unavailable; native Node tests are mandatory; "
                      "POSIX shell parity must run separately on Linux/macOS")
