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

To upgrade the CI installer, change its pin in tests/install_smoke.py and this contributor guide together,
run the checks, and review any CLI behavior changes. Keep provider versions, measurements
and token-saving claims separate from installer compatibility.

The skill's runtime remains Bash and Python; npm is only an installation convenience.
A manual fallback is to copy the entire `skills/<name>/` directory into the agent's skills directory.

Before releasing a path migration, document old and new paths and rerun initialization
against an existing fixture to check that user memory and unrelated instructions survive.

## Renaming the repository

The catalog title and individual skill names are independent of the GitHub repository name.
Keep installed names such as lean-context-memory stable when changing the catalog URL.
Rename the existing repository in GitHub settings, then update installation examples and
repository references together. Do not replace working source URLs with a proposed destination
before that destination exists. Test installation from the new shorthand before promoting it.

GitHub redirects existing repository traffic and Git clone/fetch/push operations after a rename;
see [GitHub's rename guidance](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository).
Existing installer lock metadata may still name the old source. Test updates for both install
scopes; if rebinding is needed, reinstall from the new source into the same scope/agents.
Preserve customizations and project memory. Do not recreate the old repository name while
depending on its redirect, because doing so removes that redirect.
