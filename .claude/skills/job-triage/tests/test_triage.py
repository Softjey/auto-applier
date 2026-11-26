import contextlib
import io
import json
import os
import tempfile
import unittest
from types import SimpleNamespace

import triage


class NormaliseOnetapTest(unittest.TestCase):
    def test_maps_the_fields_a_judge_reads(self):
        payload = {"vacancies": [{
            "id": "abc",
            "title": "Backend Engineer",
            "companyName": "Acme",
            "cities": [{"name": "Berlin"}, {"name": "Munich"}],
            "workplaceType": ["REMOTE"],
            "salary": {"min": 5000, "max": 7000, "currency": "eur", "period": "MONTH", "id": "x"},
            "descriptionText": "Build services.",
            "link": "https://onetap.work/job/abc/",
            "source": {"sitemapJobPostingIndexingSourceData": {"name": "Indeed"}},
        }]}
        [rec] = triage.normalise_onetap(payload)
        self.assertEqual(rec["ref"], "onetap:abc")
        self.assertEqual(rec["source"], "onetap")
        self.assertEqual(rec["company"], "Acme")
        self.assertEqual(rec["location"], "Berlin, Munich")
        self.assertEqual(rec["salary"], {"min": 5000, "max": 7000, "currency": "eur", "period": "MONTH"})
        self.assertEqual(rec["board"], "Indeed")

    def test_accepts_a_bare_list_and_missing_optionals(self):
        [rec] = triage.normalise_onetap([{"id": "z"}])
        self.assertEqual(rec["ref"], "onetap:z")
        self.assertIsNone(rec["location"])
        self.assertIsNone(rec["salary"])
        self.assertEqual(rec["keywords"], [])


class NormaliseLinkedinTest(unittest.TestCase):
    def test_readable_posting_carries_hints_not_tags_as_facts(self):
        payload = {"jobs": [{
            "ok": True, "job_id": "111", "title": "Dev", "company": "Acme",
            "location": "Berlin", "description": "text", "link": "https://www.linkedin.com/jobs/view/111",
            "salary_hints": ["EUR 5000 - 6000 per month"], "seniority": "Associate",
        }]}
        [rec] = triage.normalise_linkedin(payload)
        self.assertEqual(rec["ref"], "linkedin:111")
        self.assertIsNone(rec["workplace"])
        self.assertIsNone(rec["salary"])
        self.assertEqual(rec["salary_hints"], ["EUR 5000 - 6000 per month"])
        self.assertEqual(rec["seniority_tag"], "Associate")
        self.assertNotIn("unreadable", rec)

    def test_unreadable_posting_stays_visible(self):
        [rec] = triage.normalise_linkedin([{"ok": False, "job_id": "222", "error": "gone"}])
        self.assertEqual(rec["ref"], "linkedin:222")
        self.assertEqual(rec["unreadable"], "gone")
        self.assertIsNone(rec["description"])


class FoldAndQuotesTest(unittest.TestCase):
    def test_fold_drops_case_diacritics_and_the_polish_l(self):
        self.assertEqual(triage.fold("  Źdźbło  Zażółć\n GĘŚLĄ "), "zdzblo zazolc gesla")

    def test_fold_unifies_curly_quotes(self):
        self.assertEqual(triage.fold("“x” ‘y’ ’z"), "\"x\" 'y' 'z")

    def test_quotes_in_finds_quoted_fragments(self):
        reason = "Gate 1 - Framework X is the frontend: 'Framework X is the frontend'."
        self.assertEqual(triage.quotes_in(reason), ["framework x is the frontend"])

    def test_quotes_in_splits_on_ellipsis_and_drops_short_fragments(self):
        reason = 'Gate 3 - "must work on site ... five days a week" and "ok"'
        self.assertEqual(triage.quotes_in(reason), ["must work on site", "five days a week"])

    def test_quotes_in_ignores_apostrophes_inside_words(self):
        self.assertEqual(triage.quotes_in("The company's stack isn't a fit"), [])


class MergeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = self.tmp.name
        self.batch = os.path.join(self.dir, "batch.json")
        self.out = os.path.join(self.dir, "verdicts.json")
        items = [
            {"ref": "onetap:1", "title": "Dev", "location": "Berlin",
             "description": "The team works in Framework X for the whole frontend."},
            {"ref": "onetap:2", "title": "Dev", "location": "Berlin", "description": "Plain text."},
        ]
        with open(self.batch, "w") as f:
            json.dump({"items": items}, f)

    def write_verdicts(self, name, verdicts):
        with open(os.path.join(self.dir, name), "w") as f:
            json.dump(verdicts, f)

    def run_merge(self):
        args = SimpleNamespace(batch=self.batch, dir=self.dir, out=self.out)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            triage.cmd_merge(args)
        return json.loads(buf.getvalue())

    def test_clean_merge_writes_the_verdicts(self):
        self.write_verdicts("v_000.json", [
            {"ref": "onetap:1", "verdict": "NOT_INTERESTED",
             "reason": "Gate 1 - Framework X: 'works in Framework X for the whole frontend'."},
            {"ref": "onetap:2", "verdict": "SAVED", "reason": "Fits."},
        ])
        report = self.run_merge()
        self.assertEqual(report["problems"], [])
        self.assertEqual(report["recheck"], [])
        self.assertEqual(report["counts"]["SAVED"], 1)
        with open(self.out) as f:
            self.assertEqual(len(json.load(f)), 2)

    def test_a_posting_without_a_verdict_stops_the_merge(self):
        self.write_verdicts("v_000.json", [{"ref": "onetap:2", "verdict": "SAVED", "reason": "Fits."}])
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit):
            self.run_merge()
        self.assertFalse(os.path.exists(self.out))

    def test_a_posting_judged_twice_stops_the_merge(self):
        verdict = {"ref": "onetap:1", "verdict": "SAVED", "reason": "Fits."}
        self.write_verdicts("v_000.json", [verdict, {"ref": "onetap:2", "verdict": "SAVED", "reason": "Fits."}])
        self.write_verdicts("v_001.json", [verdict])
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit):
            self.run_merge()

    def test_undecided_needs_a_question_and_rejection_needs_a_reason(self):
        self.write_verdicts("v_000.json", [
            {"ref": "onetap:1", "verdict": "UNDECIDED"},
            {"ref": "onetap:2", "verdict": "NOT_INTERESTED"},
        ])
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit):
            self.run_merge()

    def test_a_quote_missing_from_the_posting_goes_to_recheck(self):
        self.write_verdicts("v_000.json", [
            {"ref": "onetap:1", "verdict": "NOT_INTERESTED",
             "reason": "Gate 1 - 'requires ten years of Cobol experience'."},
            {"ref": "onetap:2", "verdict": "NOT_INTERESTED", "reason": "Gate 2 - not a fit"},
        ])
        report = self.run_merge()
        why = {r["ref"]: r["why"] for r in report["recheck"]}
        self.assertEqual(why["onetap:1"], "quote not in the posting")
        self.assertEqual(why["onetap:2"], "no quote")

    def test_quote_matching_ignores_case_and_diacritics(self):
        self.write_verdicts("v_000.json", [
            {"ref": "onetap:1", "verdict": "NOT_INTERESTED",
             "reason": "Gate 1 - 'WORKS IN FRAMEWORK X FOR THE WHOLE FRONTEND'."},
            {"ref": "onetap:2", "verdict": "SAVED", "reason": "Fits."},
        ])
        self.assertEqual(self.run_merge()["recheck"], [])


class SourcesTest(unittest.TestCase):
    def test_every_source_has_a_normaliser(self):
        self.assertEqual(set(triage.SOURCES), {"linkedin", "onetap"})


if __name__ == "__main__":
    unittest.main()
