# Maintaining the skill catalog

Keep each distributable skill under `skills/<unique-name>/`. Its SKILL.md frontmatter
must contain the matching `name` and a clear `description`. Keep runtime scripts,
templates and documentation used by the skill inside that directory, using relative
paths. Do not depend on files elsewhere in this repository at runtime.

Keep tests and contributor/design documentation outside distributable directories.
Do not add a root SKILL.md: installers may stop discovery at that file and hide the catalog.
Add each new skill to the root README catalog and provide installation/behavior tests
appropriate to its requirements. Do not copy existing skill resources into another directory
just to create a second installation format.

Run from the repository root:

```bash
python3 -m unittest discover -s tests -v
python3 tests/install_smoke.py
```

The smoke test needs Node.js 22.20+, npm, Git, Bash and Python 3.9+, and network access
to fetch `skills@1.7.4` if uncached. It installs the local catalog into disposable project
directories, never into your global agent directories. It checks both symlink and copy
installs for Codex, Claude Code, Gemini CLI and Roo, compares all shipped files, and
initializes project memory through the installed helpers. It does not run those agent clients.

To upgrade the installer, change its pin in README.md and tests/install_smoke.py together,
run the checks, and review any CLI behavior changes. Keep provider versions, measurements
and token-saving claims separate from installer compatibility.

The skill's runtime remains Bash and Python; npm is only an installation convenience.
A manual fallback is to copy the entire `skills/<name>/` directory into the agent's skills directory.

Before releasing a path migration, document old and new paths and rerun initialization
against an existing fixture to check that user memory and unrelated instructions survive.
