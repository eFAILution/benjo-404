"""Unit tests for the record index and the record ID check (`make records-test`). Standard library only."""

import contextlib
import io
import pathlib
import tempfile
import unittest

import check_record_ids
import record_index

ASSUMPTION = """# {ident}

**Assumption.** {text}

**Reason.** No requirement says otherwise.

**Effect if incorrect.** Rework.

**Validation or mitigation.** Ask the owner.

**Decision owner.** Product owner

**Status.** open
"""


def write_assumption(directory, ident, text="Something holds."):
    (directory / f"{ident}.md").write_text(ASSUMPTION.format(ident=ident, text=text), encoding="utf-8")


def write_adr(directory, number, title, status="Accepted"):
    slug = title.lower().replace(" ", "-")
    (directory / f"{number}-{slug}.md").write_text(f"# {number}. {title}\n\n- Status: {status}\n", encoding="utf-8")


class RecordIndexTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.docs = pathlib.Path(self.tmp.name)
        (self.docs / "assumptions").mkdir()
        (self.docs / "decisions").mkdir()
        (self.docs / "assumptions-log.md").write_text(
            "# Log\n\n<!-- BEGIN assumptions index -->\nplaceholder\n<!-- END assumptions index -->\n")
        (self.docs / "decisions" / "README.md").write_text(
            "# ADRs\n\n<!-- BEGIN decisions index -->\nplaceholder\n<!-- END decisions index -->\n\nTemplate\n")

    def tearDown(self):
        self.tmp.cleanup()

    def test_assumptions_are_ordered_by_issue_then_sequence(self):
        for ident in ("A-105.2", "A-12.1", "A-105.1"):
            write_assumption(self.docs / "assumptions", ident)

        table = record_index.assumptions_table(self.docs / "assumptions", "assumptions/")

        ids = [line.split("]")[0].split("[")[1] for line in table.splitlines()[2:]]
        self.assertEqual(ids, ["A-12.1", "A-105.1", "A-105.2"])

    def test_assumption_row_escapes_pipes_and_joins_wrapped_lines(self):
        write_assumption(self.docs / "assumptions", "A-1.1", "a | b\nwrapped")

        row = record_index.assumptions_table(self.docs / "assumptions", "assumptions/").splitlines()[2]

        self.assertIn(r"a \| b wrapped", row)

    def test_assumption_missing_a_field_is_an_error(self):
        path = self.docs / "assumptions" / "A-1.1.md"
        path.write_text("# A-1.1\n\n**Assumption.** x\n")

        with self.assertRaisesRegex(record_index.RecordError, "missing Reason"):
            record_index.parse_assumption(path)

    def test_assumption_heading_must_match_file_name(self):
        write_assumption(self.docs / "assumptions", "A-1.1")
        (self.docs / "assumptions" / "A-1.1.md").rename(self.docs / "assumptions" / "A-1.2.md")

        with self.assertRaisesRegex(record_index.RecordError, "first heading must be '# A-1.2'"):
            record_index.parse_assumption(self.docs / "assumptions" / "A-1.2.md")

    def test_sequential_assumption_ids_are_rejected(self):
        write_assumption(self.docs / "assumptions", "A-001")

        with self.assertRaisesRegex(record_index.RecordError, "A-001.md must be named A-<issue>.<n>.md"):
            record_index.assumptions_table(self.docs / "assumptions", "assumptions/")

    def test_adr_table_lists_records_in_number_order(self):
        write_adr(self.docs / "decisions", "0105", "Later")
        write_adr(self.docs / "decisions", "0000", "Record decisions")

        lines = record_index.adr_table(self.docs / "decisions").splitlines()

        self.assertEqual(lines[2], "| [0000](0000-record-decisions.md) | Record decisions | Accepted |")
        self.assertEqual(lines[3], "| [0105](0105-later.md) | Later | Accepted |")

    def test_adr_without_a_status_line_is_an_error(self):
        (self.docs / "decisions" / "0007-no-status.md").write_text("# 0007. No status\n")

        with self.assertRaisesRegex(record_index.RecordError, "Status"):
            record_index.adr_table(self.docs / "decisions")

    def test_fill_replaces_only_the_marked_region(self):
        markdown = (self.docs / "decisions" / "README.md").read_text()

        filled = record_index.fill(markdown, "decisions", "TABLE")

        self.assertIn("<!-- BEGIN decisions index -->\n\nTABLE\n\n<!-- END decisions index -->", filled)
        self.assertNotIn("placeholder", filled)
        self.assertTrue(filled.endswith("Template\n"))

    def test_check_fails_on_a_bad_record_and_leaves_files_alone(self):
        (self.docs / "assumptions" / "A-1.1.md").write_text("# A-1.1\n\n**Assumption.** x\n")
        before = (self.docs / "assumptions-log.md").read_text()

        with contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(record_index.main(["--check"], self.docs), 1)

        self.assertIn("::error::", output.getvalue())
        self.assertEqual((self.docs / "assumptions-log.md").read_text(), before)

    def test_write_fills_both_index_files(self):
        write_assumption(self.docs / "assumptions", "A-3.1")
        write_adr(self.docs / "decisions", "0003", "Pick a database")

        self.assertEqual(record_index.main(["--write"], self.docs), 0)

        self.assertIn("[A-3.1](assumptions/A-3.1.md)", (self.docs / "assumptions-log.md").read_text())
        self.assertIn("Pick a database", (self.docs / "decisions" / "README.md").read_text())


class CheckRecordIdsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.docs = pathlib.Path(self.tmp.name)
        (self.docs / "decisions").mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def run_check(self, branch, added):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            code = check_record_ids.main(["--branch", branch, "--docs-dir", str(self.docs)], io.StringIO("\n".join(added)))
        return code, output.getvalue()

    def test_records_keyed_on_the_branch_issue_pass(self):
        added = ["docs/decisions/0105-keyed.md", "docs/assumptions/A-105.1.md", "src/app.py"]

        self.assertEqual(self.run_check("docs/105-keyed-records", added), (0, ""))

    def test_record_keyed_on_another_number_fails(self):
        self.assertEqual(self.run_check("feat/62-case-list", ["docs/decisions/0036-server-side-query.md"])[0], 1)
        self.assertEqual(self.run_check("feat/62-case-list", ["docs/assumptions/A-70.1.md"])[0], 1)
        self.assertEqual(self.run_check("feat/62-case-list", ["docs/assumptions/A-062.md"])[0], 1)

    def test_record_on_a_branch_without_an_issue_fails_with_the_error_only(self):
        code, output = self.run_check("claude/login-form", ["docs/assumptions/A-1.1.md"])

        self.assertEqual(code, 1)
        self.assertIn("the branch must be <prefix>/<issue>-<description>", output)
        self.assertNotIn("::warning::", output)

    def test_branch_without_an_issue_gets_a_warning_but_passes(self):
        code, output = self.run_check("my-branch", ["src/app.py", "docs/decisions/README.md"])

        self.assertEqual(code, 0)
        self.assertIn("::warning::branch 'my-branch' has no issue number", output)

    def test_issue_is_read_from_agent_and_mixed_case_branch_names(self):
        for branch in ("Copilot/105-keyed", "claude/issue-105-keyed", "codex/issue105", "feat/105_keyed"):
            self.assertEqual(check_record_ids.branch_issue(branch), 105, branch)
        for branch in ("feat/keyed-105", "dependabot/npm_and_yarn/react-18.3.1", "main", ""):
            self.assertIsNone(check_record_ids.branch_issue(branch), branch)

    def test_without_a_branch_only_the_duplicate_check_runs(self):
        stdin = io.StringIO("docs/assumptions/A-1.1.md")

        self.assertEqual(check_record_ids.main(["--docs-dir", str(self.docs)], stdin), 0)

    def test_duplicate_adr_numbers_fail(self):
        (self.docs / "decisions" / "0036-evidence-bundle.md").write_text("")
        (self.docs / "decisions" / "0036-server-side-query.md").write_text("")

        self.assertEqual(check_record_ids.duplicate_adr_errors(self.docs / "decisions"), [
            "ADR 0036 is used by 0036-evidence-bundle.md, 0036-server-side-query.md; "
            "one of them must be renamed to its own issue number"
        ])


if __name__ == "__main__":
    unittest.main()
