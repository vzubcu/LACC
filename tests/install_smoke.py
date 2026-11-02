"""Real installer integration; isolated project installs, no global agent changes."""
from pathlib import Path
import os
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "skills/lean-context-memory"
CLI = ["npx", "--yes", "skills@1.7.4"]
AGENTS = {"codex": ".agents", "claude-code": ".claude", "gemini-cli": ".agents", "roo": ".roo"}


def run(args, cwd):
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=True,
                            timeout=180, env=dict(os.environ, DISABLE_TELEMETRY="1", PYTHONDONTWRITEBYTECODE="1"))
    if result.returncode:
        raise RuntimeError(f"{args}:\n{result.stdout}\n{result.stderr}")
    return result.stdout


def main():
    for copy in (False, True):
        with tempfile.TemporaryDirectory(prefix="skill install ") as directory:
            project = Path(directory)
            run(CLI + ["add", str(ROOT), "--skill", "lean-context-memory", "--agent",
                       *AGENTS, "-y", *(["--copy"] if copy else [])], project)
            for agent, folder in AGENTS.items():
                installed = project / folder / "skills/lean-context-memory"
                expected = {p.relative_to(SOURCE) for p in SOURCE.rglob("*")
                            if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc"}
                actual = {p.relative_to(installed) for p in installed.rglob("*") if p.is_file()}
                assert expected == actual, (agent, expected - actual, actual - expected)
                for relative in expected:
                    assert (SOURCE / relative).read_bytes() == (installed / relative).read_bytes(), relative
                assert not (installed / "tests").exists()
                for script in (installed / "scripts").glob("*.sh"):
                    run(["bash", "-n", str(script)], project)
                with tempfile.TemporaryDirectory(prefix="memory init ") as target:
                    target = Path(target)
                    run(["bash", str(installed / "scripts/init-memory.sh"), str(target), "--agent", "all"], project)
                    assert (target / "memory/topics/architecture.md").is_file()
                    assert "UNSYNCED" in (target / "memory/ACTIVE_STATE.md").read_text()
                    for bridge in ("AGENTS.md", "CLAUDE.md", "GEMINI.md", ".roo/rules/lean-context-memory.md"):
                        assert (target / bridge).is_file(), bridge
                    state = target / "memory/ACTIVE_STATE.md"
                    state.write_text(state.read_text() + "\nUser handoff: preserve me.\n")
                    run(["bash", str(installed / "scripts/init-memory.sh"), str(target), "--agent", "all"], project)
                    assert "User handoff: preserve me." in state.read_text()
                    run(["python3", str(installed / "scripts/usage-report.py"), "--help"], project)
                print(f"PASS {agent}: {'copy' if copy else 'symlink'} resources and initialization", flush=True)


if __name__ == "__main__":
    main()
