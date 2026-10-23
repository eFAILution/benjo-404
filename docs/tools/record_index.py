"""Build the assumptions table and the ADR index from one file per record (ADR-0000).

Each assumption lives in docs/assumptions/A-<issue>.<n>.md and each ADR in docs/decisions/<issue, 4 digits>-<title>.md.
Pull requests add files and never edit a shared table, so they do not conflict with each other.

    python3 docs/tools/record_index.py           # print both tables (`make records`)
    python3 docs/tools/record_index.py --check   # fail if any record file is misnamed or incomplete (CI)
    python3 docs/tools/record_index.py --write   # write both tables into the committed index files

Use --write only for a snapshot, such as a release or hand-off commit. A pull request that writes the tables
conflicts with every other open pull request, which is the problem these files exist to avoid.
"""

import pathlib
import re
import sys

ASSUMPTION_FIELDS = (
    "Assumption",
    "Reason",
    "Effect if incorrect",
    "Validation or mitigation",
    "Decision owner",
    "Status",
)
# A-105.1 is the first assumption recorded for issue #105.
ASSUMPTION_ID = re.compile(r"^A-(\d+)\.(\d+)$")
ASSUMPTION_TITLE = re.compile(r"^# (A-[0-9.]+)\s*$", re.MULTILINE)
LABELLED_PARAGRAPH = re.compile(r"^\*\*(.+?)\.\*\* (.+)$", re.DOTALL)
ADR_FILE = re.compile(r"^(\d{4})-[a-z0-9-]+\.md$")
ADR_TITLE = re.compile(r"^# (\d{4})\. (.+)$", re.MULTILINE)
ADR_STATUS = re.compile(r"^- Status: (.+)$", re.MULTILINE)
DOCS_DIR = pathlib.Path(__file__).resolve().parents[1]


class RecordError(ValueError):
    """A record file that cannot be indexed. The message names the file and what is wrong."""


def region(name):
    return f"<!-- BEGIN {name} index -->", f"<!-- END {name} index -->"


def cell(text):
    return text.replace("|", r"\|")


def parse_assumption(path):
    text = path.read_text(encoding="utf-8")
    title = ASSUMPTION_TITLE.search(text)
    if not title or title.group(1) != path.stem:
        raise RecordError(f"{path}: the first heading must be '# {path.stem}'")
    fields, current = {}, None
    for paragraph in text[title.end() :].split("\n\n"):
        if not paragraph.strip():
            continue
        match = LABELLED_PARAGRAPH.match(paragraph.strip())
        if match:
            current = match.group(1)
            fields[current] = " ".join(match.group(2).split())
        elif current:  # a second paragraph or a list under a field stays with that field
            fields[current] += " " + " ".join(paragraph.split())
        else:
            raise RecordError(f"{path}: text before the first '**Assumption.**' field")
    missing = [field for field in ASSUMPTION_FIELDS if not fields.get(field)]
    if missing:
        raise RecordError(f"{path}: missing {', '.join(missing)}")
    return {"id": path.stem, **fields}


def assumption_order(ident):
    issue, sequence = ASSUMPTION_ID.match(ident).groups()
    return int(issue), int(sequence)


def assumptions_table(assumptions_dir, link_prefix):
    paths = sorted(assumptions_dir.glob("*.md"))
    misnamed = [path.name for path in paths if not ASSUMPTION_ID.match(path.stem)]
    if misnamed:
        raise RecordError(f"{assumptions_dir}: {', '.join(misnamed)} must be named A-<issue>.<n>.md")
    records = sorted((parse_assumption(path) for path in paths), key=lambda record: assumption_order(record["id"]))
    header = ("ID",) + ASSUMPTION_FIELDS
    lines = ["| " + " | ".join(header) + " |", "|" + "----|" * len(header)]
    for record in records:
        cells = [f"[{record['id']}]({link_prefix}{record['id']}.md)"]
        cells += [cell(record[field]) for field in ASSUMPTION_FIELDS]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def parse_adr(path):
    text = path.read_text(encoding="utf-8")
    title, status = ADR_TITLE.search(text), ADR_STATUS.search(text)
    if not title or title.group(1) != path.name[:4]:
        raise RecordError(f"{path}: the first heading must be '# {path.name[:4]}. Title'")
    if not status:
        raise RecordError(f"{path}: missing the '- Status: ...' line")
    return {"number": title.group(1), "title": title.group(2).strip(), "status": status.group(1).strip(), "file": path.name}


def adr_table(decisions_dir):
    paths = [path for path in sorted(decisions_dir.glob("*.md")) if path.name != "README.md"]
    misnamed = [path.name for path in paths if not ADR_FILE.match(path.name)]
    if misnamed:
        raise RecordError(f"{decisions_dir}: {', '.join(misnamed)} must be named NNNN-lower-case-title.md")
    records = sorted((parse_adr(path) for path in paths), key=lambda record: record["number"])
    lines = ["| ADR | Title | Status |", "|-----|-------|--------|"]
    lines += [f"| [{r['number']}]({r['file']}) | {cell(r['title'])} | {cell(r['status'])} |" for r in records]
    return "\n".join(lines)


def fill(markdown, name, table):
    begin, end = region(name)
    start, stop = markdown.find(begin), markdown.find(end)
    if start == -1 or stop < start:
        raise RecordError(f"missing the '{begin}' and '{end}' markers")
    return f"{markdown[: start + len(begin)]}\n\n{table}\n\n{markdown[stop:]}"


def indexes(docs_dir):
    """Each index page, relative to docs/, with its region name and a function that builds its table."""
    return {
        "assumptions-log.md": ("assumptions", lambda: assumptions_table(docs_dir / "assumptions", "assumptions/")),
        "decisions/README.md": ("decisions", lambda: adr_table(docs_dir / "decisions")),
    }


def main(argv, docs_dir=DOCS_DIR):
    mode = argv[0] if argv else "--print"
    if argv[1:] or mode not in ("--print", "--check", "--write"):
        print("usage: record_index.py [--print | --check | --write]", file=sys.stderr)
        return 2
    try:
        for page, (name, build) in indexes(docs_dir).items():
            table = build()
            path = docs_dir / page
            filled = fill(path.read_text(encoding="utf-8"), name, table)
            if mode == "--print":
                print(f"{page}\n\n{table}\n")
            elif mode == "--write":
                path.write_text(filled, encoding="utf-8")
    except RecordError as error:
        print(f"::error::{error}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
