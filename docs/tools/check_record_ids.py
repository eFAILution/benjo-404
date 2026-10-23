"""Check that a pull request's new ADRs and assumptions are keyed on its issue number (ADR-0000).

Reads the paths the pull request adds or renames, one per line, on stdin, and takes the branch name with --branch.
The branch is `<prefix>/<issue>-<description>`. A new ADR must be `docs/decisions/<issue, 4 digits>-<title>.md`
and a new assumption `docs/assumptions/A-<issue>.<n>.md`. Every ADR number in docs/decisions/ must also be
unique, which catches two branches that reused the same number.

    git diff --name-only --diff-filter=AR origin/main...HEAD | python3 docs/tools/check_record_ids.py --branch "$BRANCH"

A branch with no issue number gets a warning even when it adds no records. Without --branch, only the duplicate
check runs (pushes to main have no head branch).
"""

import argparse
import collections
import pathlib
import re
import sys

# `feat/105-title`, `claude/105-title`, `Copilot/issue-105-title`. The issue number comes right after the prefix.
BRANCH_ISSUE = re.compile(r"^[^/]+/(?:issue-?)?(\d+)(?=[-_./]|$)", re.IGNORECASE)
NEW_ADR = re.compile(r"^docs/decisions/(\d{4})-[a-z0-9-]+\.md$")
NEW_ASSUMPTION = re.compile(r"^docs/assumptions/A-(\d+)\.(\d+)\.md$")
ADR_FILE = re.compile(r"^(\d{4})-[a-z0-9-]+\.md$")
BRANCH_FORMAT = "<prefix>/<issue>-<description>"
# Renaming a pull request's head branch on GitHub closes the pull request, so the fix is a new branch and a new PR.
HOW_TO_MOVE = (
    "open a GitHub issue if there is none, rename the branch locally, push it with -u, "
    "and open a new PR that links this one"
)
HOW_TO_FIX = f"{HOW_TO_MOVE}; name the record after the issue"


def branch_issue(branch):
    match = BRANCH_ISSUE.match(branch or "")
    return int(match.group(1)) if match else None


def added_record_errors(added, issue, branch):
    errors = []
    for path in added:
        is_adr = path.startswith("docs/decisions/") and path != "docs/decisions/README.md"
        is_assumption = path.startswith("docs/assumptions/") and path.endswith(".md")
        if not (is_adr or is_assumption):
            continue
        if issue is None:
            errors.append(f"{path}: the branch must be {BRANCH_FORMAT} (got '{branch}'); {HOW_TO_FIX}")
            continue
        adr, assumption = NEW_ADR.match(path), NEW_ASSUMPTION.match(path)
        if is_adr and not (adr and int(adr.group(1)) == issue):
            errors.append(f"{path}: a new ADR for issue #{issue} is docs/decisions/{issue:04d}-<title>.md")
        if is_assumption and not (assumption and int(assumption.group(1)) == issue):
            errors.append(f"{path}: a new assumption for issue #{issue} is docs/assumptions/A-{issue}.<n>.md")
    return errors


def duplicate_adr_errors(decisions_dir):
    numbers = collections.defaultdict(list)
    for path in sorted(decisions_dir.glob("*.md")):
        match = ADR_FILE.match(path.name)
        if match:
            numbers[match.group(1)].append(path.name)
    return [
        f"ADR {number} is used by {', '.join(names)}; one of them must be renamed to its own issue number"
        for number, names in numbers.items()
        if len(names) > 1
    ]


def main(argv, stdin):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--branch", default="", help="head branch; omit to run only the duplicate check")
    parser.add_argument("--docs-dir", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1])
    args = parser.parse_args(argv)
    errors = []
    if args.branch:
        added = [line.strip() for line in stdin if line.strip()]
        issue = branch_issue(args.branch)
        errors += added_record_errors(added, issue, args.branch)
        # A warning, not a failure: bot branches (Dependabot) must still merge.
        if issue is None and not errors:
            print(f"::warning::branch '{args.branch}' has no issue number; it should be {BRANCH_FORMAT} ({HOW_TO_MOVE})")
    errors += duplicate_adr_errors(args.docs_dir / "decisions")
    for error in errors:
        print(f"::error::{error}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:], sys.stdin))
