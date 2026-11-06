"""Real installer integration; isolated project installs, no global agent changes."""
from pathlib import Path
import argparse
import os
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
CLI = ['npx', '--yes', 'skills@1.7.4']
AGENTS = {'codex': '.agents', 'claude-code': '.claude', 'gemini-cli': '.agents', 'roo': '.roo'}


def run(args, cwd):
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=True, timeout=180,
                            env=dict(os.environ, DISABLE_TELEMETRY='1', PYTHONDONTWRITEBYTECODE='1'))
    if result.returncode:
        raise RuntimeError(f'{args}:\n{result.stdout}\n{result.stderr}')
    return result.stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', default=str(ROOT), help='Local catalog or remote repository/tree URL')
    args = parser.parse_args()
    sources = sorted(path for path in (ROOT/'skills').iterdir() if (path/'SKILL.md').is_file())
    for copy in (False, True):
        with tempfile.TemporaryDirectory(prefix='skill install ') as directory:
            project = Path(directory)
            run(CLI + ['add', args.source, '--skill', '*', '--agent', *AGENTS, '-y',
                       *(['--copy'] if copy else [])], project)
            for agent, folder in AGENTS.items():
                for source in sources:
                    installed = project/folder/'skills'/source.name
                    expected = {p.relative_to(source) for p in source.rglob('*')
                                if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc'}
                    actual = {p.relative_to(installed) for p in installed.rglob('*') if p.is_file()}
                    assert expected == actual, (agent, source.name, expected-actual, actual-expected)
                    for name in expected:
                        assert (source/name).read_bytes() == (installed/name).read_bytes(), name
                    for script in (installed/'scripts').glob('*.sh'):
                        run(['bash', '-n', str(script)], project)
                    if source.name == 'lean-context-memory':
                        with tempfile.TemporaryDirectory(prefix='memory init ') as target:
                            target = Path(target)
                            run(['bash', str(installed/'scripts/init-memory.sh'), str(target), '--agent', 'all'], project)
                            state = target/'memory/ACTIVE_STATE.md'
                            assert 'UNSYNCED' in state.read_text()
                            state.write_text(state.read_text() + '\nUser handoff: preserve me.\n')
                            run(['bash', str(installed/'scripts/init-memory.sh'), str(target), '--agent', 'all'], project)
                            assert 'User handoff: preserve me.' in state.read_text()
                            run(['python3', str(installed/'scripts/memory-read.py'), str(target)], project)
                            run(['python3', str(installed/'scripts/memory-health.py'), str(target)], project)
                        run(['python3', str(installed/'scripts/memory-search.py'), '--help'], project)
                        run(['python3', str(installed/'scripts/context-pressure.py'), '--help'], project)
                        run(['python3', str(installed/'scripts/session-totals.py'), '--help'], project)
                        run(['python3', str(installed/'scripts/usage-report.py'), '--help'], project)
                        run(['python3', str(installed/'scripts/usage-report.py'), 'capture-codex-exec', '--help'], project)
                    print(f'PASS {source.name}: {agent}, {"copy" if copy else "symlink"}', flush=True)


if __name__ == '__main__':
    main()
