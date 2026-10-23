# .ai/ — shared context for humans and coding agents

This directory gives every developer and every coding agent (Claude Code, Codex, Cursor, Copilot, and others) the same starting point: how the team works, and what this repo is.

## Layout

| Path | Contents | How it changes |
|------|----------|----------------|
| `standards/` | Team standards: branching, commits, agent rules, review, data handling, definition of done. The same for every repo the team owns. | By PR only, reviewed by the code owners. Project-specific exceptions go in `project/`, not here. |
| `project/` | Context for this repo only: purpose, architecture, commands, environments, decisions, assumptions. | Normal PRs in this repo. |

If a project must deviate from a standard, record the deviation and the reason in `project/`. Do not edit the standard in place. A conflict that is not recorded as a deviation is a bug: raise it.

## Reading order

Humans and agents read the same files in the same order:

1. `standards/agentic-development.md`: rules every coding agent follows. Humans should skim it so they know what to expect from agents and what to enforce.
2. `standards/branching-and-merging.md` and `standards/commits.md`: how changes reach `main`, and why history is never rewritten.
3. `standards/pull-request-review.md`: human-in-the-loop and adversarial review.
4. `standards/data-handling-and-secrets.md`: synthetic data only, and no secrets in git.
5. `standards/definition-of-done.md`: the checklist to complete before you request review.
6. `project/`: start with its README and follow its links.

## Tool entrypoints

Tool-specific instruction files point here. They do not copy content, because copied rules drift apart.

| Tool | Entrypoint |
|------|------------|
| Codex and other tools that read `AGENTS.md` | `AGENTS.md` |
| Claude Code | `CLAUDE.md` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Cursor | `.cursor/rules/` (a single always-applied rule) |

Each entrypoint should contain little more than:

```markdown
Before doing anything else, read `.ai/README.md` and follow it.
The standards in `.ai/standards/` are mandatory. Project context is in `.ai/project/`.
```

- If the tool supports file imports (for example `@.ai/README.md` in `CLAUDE.md`), use an import instead of restating rules.
- Put tool-specific *configuration* (permissions, hooks, model settings) in the tool's own files. Put rules and prose in `.ai/`.
- When a rule changes, change it here. Do not patch it into an entrypoint.
