import unittest

import linkedin

CARD = """
<li><div class="base-card relative" data-entity-urn="urn:li:jobPosting:{id}">
  <h3 class="base-search-card__title">{title}</h3>
  <h4 class="base-search-card__subtitle"><a href="/c/acme">{company}</a></h4>
  <span class="job-search-card__location">{location}</span>
  <time datetime="2026-10-01">1 day ago</time>
</div></li>
"""


class ParseCardsTest(unittest.TestCase):
    def test_reads_every_card_on_a_page(self):
        page = CARD.format(id=111, title="Dev", company="Acme", location="Berlin") + \
            CARD.format(id=222, title="Ops", company="Apex", location="Munich")
        cards = linkedin.parse_cards(page)
        self.assertEqual([c["job_id"] for c in cards], ["111", "222"])
        self.assertEqual(cards[0]["title"], "Dev")
        self.assertEqual(cards[0]["company"], "Acme")
        self.assertEqual(cards[0]["location"], "Berlin")
        self.assertEqual(cards[0]["posted_at"], "2026-10-01")

    def test_link_is_the_canonical_form_without_tracking(self):
        [card] = linkedin.parse_cards(CARD.format(id=333, title="Dev", company="Acme", location="Berlin"))
        self.assertEqual(card["link"], "https://www.linkedin.com/jobs/view/333")
        self.assertEqual(linkedin.canonical_link("333"), card["link"])

    def test_an_empty_page_has_no_cards(self):
        self.assertEqual(linkedin.parse_cards("<html></html>"), [])


class ExpandQueriesTest(unittest.TestCase):
    def filters(self, **over):
        base = {
            "backend": "guest",
            "defaults": {"timePosted": ["r86400"], "sortBy": "DD"},
            "keywords": ["React", "Node.js"],
            "locations": [
                {"name": "remote", "workplace": ["REMOTE"], "geoId": "1"},
                {"name": "berlin", "workplace": ["ONSITE"], "location": "Berlin, Germany"},
            ],
        }
        base.update(over)
        return base

    def test_is_the_cross_of_keywords_and_locations(self):
        queries, collapsed = linkedin.expand_queries(self.filters())
        self.assertEqual(len(queries), 4)
        self.assertEqual(collapsed, 0)
        self.assertEqual({q["params"]["f_TPR"] for q in queries}, {"r86400"})

    def test_geo_id_beats_a_location_string(self):
        queries, _ = linkedin.expand_queries(self.filters())
        remote = next(q for q in queries if q["location_group"] == "remote")
        self.assertEqual(remote["params"]["geoId"], "1")
        self.assertNotIn("location", remote["params"])

    def test_groups_differing_only_by_workplace_collapse_into_one_request(self):
        locations = [
            {"name": "a", "workplace": ["REMOTE"], "geoId": "1"},
            {"name": "b", "workplace": ["HYBRID"], "geoId": "1"},
        ]
        queries, collapsed = linkedin.expand_queries(self.filters(locations=locations))
        self.assertEqual(len(queries), 2)
        self.assertEqual(collapsed, 2)
        self.assertEqual(queries[0]["expected_workplace"], ["HYBRID", "REMOTE"])

    def test_a_location_with_no_target_is_an_error(self):
        with self.assertRaises(SystemExit):
            linkedin.expand_queries(self.filters(locations=[{"name": "nowhere", "workplace": []}]))

    def test_workplace_is_never_sent_to_the_guest_backend(self):
        queries, _ = linkedin.expand_queries(self.filters())
        self.assertTrue(all("f_WT" not in q["params"] for q in queries))


class SalaryHintsTest(unittest.TestCase):
    def test_picks_lines_that_look_like_pay(self):
        text = "We are great.\nSalary: 20 000 - 25 000 PLN per month\nEUR 5000-6000 net\nBenefits: fruit"
        self.assertEqual(
            linkedin.salary_hints(text),
            ["Salary: 20 000 - 25 000 PLN per month", "EUR 5000-6000 net"],
        )

    def test_hourly_rates_in_other_currencies(self):
        self.assertEqual(linkedin.salary_hints("Rate: 150 zł/h"), ["Rate: 150 zł/h"])

    def test_no_description_no_hints(self):
        self.assertEqual(linkedin.salary_hints(None), [])

    def test_respects_the_limit_and_skips_repeats(self):
        text = "\n".join(["EUR 5000 per month"] * 3 + [f"USD {n}000 per year" for n in range(10, 20)])
        hints = linkedin.salary_hints(text, limit=3)
        self.assertEqual(len(hints), 3)
        self.assertEqual(len(set(hints)), 3)


class LedgerTest(unittest.TestCase):
    def test_reading_the_ledger_without_a_data_dir_is_an_error(self):
        from unittest import mock
        with mock.patch.object(linkedin.data_dir, "find_data_dir", return_value=None), \
                mock.patch.object(linkedin.data_dir, "candidates", return_value=["/nowhere"]):
            with self.assertRaises(SystemExit):
                linkedin.load_ledger()


if __name__ == "__main__":
    unittest.main()
