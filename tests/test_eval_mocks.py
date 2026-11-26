import importlib.util
import os
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_spec = importlib.util.spec_from_file_location("build_mocks", os.path.join(ROOT, "evals", "build_mocks.py"))
build_mocks = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(build_mocks)


class EvalMocksTest(unittest.TestCase):
    def test_mocks_match_fixtures(self):
        self.assertEqual(
            build_mocks.stale(),
            [],
            "eval mocks differ from fixtures/persona/inputs; run python3 evals/build_mocks.py",
        )

    def test_every_fixture_feeds_a_mock(self):
        used = set(build_mocks.MOCKS.values())
        onetap = {n for n in os.listdir(build_mocks.INPUTS) if n.startswith("onetap-")}
        self.assertEqual(onetap - used, set())


if __name__ == "__main__":
    unittest.main()
