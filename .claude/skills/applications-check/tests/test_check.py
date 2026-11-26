import unittest

import check

TEXT = (
    "we are building a scalable platform using python and typescript with strong ownership "
    "across the whole stack and close collaboration with product teams every single week"
)


def rec(company, title, description=TEXT, **extra):
    return {"company": company, "title": title, "description": description, **extra}


class NamesTest(unittest.TestCase):
    def test_company_suffix_noise_is_ignored(self):
        self.assertEqual(check.company_key("Acme Poland"), check.company_key("Acme"))
        self.assertEqual(check.company_key("Acme Ltd"), check.company_key("ACME"))

    def test_different_companies_stay_different(self):
        self.assertNotEqual(check.company_key("Acme"), check.company_key("Apex"))

    def test_title_noise_and_parentheticals_are_stripped(self):
        self.assertEqual(check.clean("Senior Dev (React) - Remote"), "senior dev")

    def test_parentheticals_survive_in_the_strict_form(self):
        self.assertIn("(react)", check.clean_keep_parens("Senior Dev (React)"))

    def test_acronym_needs_several_words(self):
        self.assertEqual(check.acronym("Acme Consulting Group"), "acg")
        self.assertEqual(check.acronym("Acme"), "")

    def test_alias_resolves_an_abbreviation_to_its_full_name(self):
        items = [{"company": "ACG"}, {"company": "Acme Consulting Group"}]
        self.assertEqual(check.company_aliases(items), {"acg": "acme consulting"})

    def test_alias_needs_the_full_name_in_the_same_batch(self):
        self.assertEqual(check.company_aliases([{"company": "ACG"}]), {})

    def test_ambiguous_acronym_is_left_alone(self):
        items = [{"company": "ACG"}, {"company": "Acme Consulting Group"}, {"company": "Apex Capital Group"}]
        self.assertEqual(check.company_aliases(items), {})


class SeniorityTest(unittest.TestCase):
    def test_conflict_between_junior_and_senior(self):
        self.assertTrue(check.seniority_conflict("Junior Developer", "Senior Developer"))

    def test_no_conflict_when_a_title_states_nothing(self):
        self.assertFalse(check.seniority_conflict("Developer", "Senior Developer"))

    def test_mid_and_middle_are_one_level(self):
        self.assertFalse(check.seniority_conflict("Mid Developer", "Middle Developer"))


class SimilarityTest(unittest.TestCase):
    def test_containment_is_over_the_smaller_set(self):
        a = check.shingles(TEXT)
        b = check.shingles(TEXT + " plus an extra sentence that only the longer copy carries here")
        self.assertEqual(check.containment(a, b), 1.0)

    def test_containment_of_nothing_is_zero(self):
        self.assertEqual(check.containment(set(), check.shingles(TEXT)), 0.0)

    def test_title_similarity_folds_plurals(self):
        self.assertEqual(check.title_similarity("Games Developer", "Game Developer"), 1.0)

    def test_link_key_ignores_scheme_www_query_and_slash(self):
        self.assertEqual(
            check.link_key("HTTPS://www.Example.com/jobs/1/?utm=x#top"),
            check.link_key("http://example.com/jobs/1"),
        )


class CompareTest(unittest.TestCase):
    def test_same_link_is_the_same_job(self):
        x = rec("Acme", "Dev", "alpha beta gamma", link="https://a.com/1?x=1")
        y = rec("Acme", "Dev", "completely different words here", link="https://a.com/1")
        self.assertEqual(check.compare(x, y)[0], "same")

    def test_identical_descriptions_merge(self):
        verdict, score = check.compare(rec("Acme", "Senior Dev"), rec("Acme Ltd", "Senior Developer"))
        self.assertEqual(verdict, "same")
        self.assertEqual(score, 1.0)

    def test_different_company_is_never_compared(self):
        self.assertEqual(check.compare(rec("Acme", "Dev"), rec("Apex", "Dev"))[0], None)

    def test_seniority_conflict_blocks_a_merge(self):
        self.assertEqual(check.compare(rec("Acme", "Junior Dev"), rec("Acme", "Senior Dev"))[0], None)

    def test_same_title_with_unrelated_text_is_only_a_suspect(self):
        other = "an entirely different body of text about warehouse logistics and forklift certification rules"
        self.assertEqual(check.compare(rec("Acme", "Dev"), rec("Acme", "Dev", other))[0], "suspect")

    def test_unreadable_copy_matches_on_strict_title(self):
        gone = {"company": "Acme", "title": "Senior Dev (React)", "description": None}
        self.assertEqual(check.compare(gone, rec("Acme", "Senior Dev (React)"))[0], "same")

    def test_unreadable_copy_with_different_parens_is_only_a_suspect(self):
        gone = {"company": "Acme", "title": "Senior Dev (React Native)", "description": None}
        self.assertEqual(check.compare(gone, rec("Acme", "Senior Dev (Typescript)"))[0], "suspect")


class InfoScoreTest(unittest.TestCase):
    def test_a_stated_salary_outweighs_a_longer_description(self):
        with_salary = rec("Acme", "Dev", "short text", salary={"max": 9000})
        longer = rec("Acme", "Dev", "word " * 600)
        self.assertGreater(check.info_score(with_salary), check.info_score(longer))

    def test_unreadable_loses(self):
        self.assertLess(check.info_score({"unreadable": "gone"}), check.info_score(rec("Acme", "Dev")))


class BuildClustersTest(unittest.TestCase):
    def test_copies_merge_and_the_rest_stay_apart(self):
        items = [
            rec("Acme", "Senior Dev"),
            rec("Acme Ltd", "Senior Dev"),
            rec("Acme", "Junior Dev"),
            rec("Apex", "Senior Dev"),
        ]
        clusters, suspects, agencies = check.build_clusters(items)
        sizes = sorted(len(c) for c in clusters.values())
        self.assertEqual(sizes, [1, 1, 2])
        merged = next(c for c in clusters.values() if len(c) == 2)
        self.assertEqual(sorted(merged), [0, 1])
        self.assertEqual(suspects, [])
        flagged = {(i, j) for i, j, _ in agencies}
        self.assertIn((0, 3), flagged)
        self.assertNotIn((2, 3), flagged)

    def test_abbreviation_and_full_name_cluster_together(self):
        items = [rec("ACG", "Senior Dev"), rec("Acme Consulting Group", "Senior Dev")]
        clusters, _, agencies = check.build_clusters(items)
        self.assertEqual([len(c) for c in clusters.values()], [2])
        self.assertEqual(agencies, [])


if __name__ == "__main__":
    unittest.main()
