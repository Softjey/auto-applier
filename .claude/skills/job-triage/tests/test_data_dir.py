import os
import tempfile
import unittest
from unittest import mock

import data_dir


class FindDataDirTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.default_dir = os.path.join(self.tmp.name, "data")
        self.env_dir = os.path.join(self.tmp.name, "env")
        for patcher in (
            mock.patch.object(data_dir, "DEFAULT", self.default_dir),
            mock.patch.dict(os.environ, {}, clear=False),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        os.environ.pop(data_dir.ENV_VAR, None)

    def test_none_when_data_is_missing(self):
        self.assertIsNone(data_dir.find_data_dir())

    def test_data_at_the_repo_root_is_used(self):
        os.makedirs(self.default_dir)
        self.assertEqual(data_dir.find_data_dir(), self.default_dir)

    def test_a_symlinked_data_is_used(self):
        real = os.path.join(self.tmp.name, "elsewhere")
        os.makedirs(real)
        os.symlink(real, self.default_dir)
        self.assertEqual(data_dir.find_data_dir(), self.default_dir)

    def test_env_var_overrides_for_tests(self):
        os.makedirs(self.default_dir)
        os.makedirs(self.env_dir)
        os.environ[data_dir.ENV_VAR] = self.env_dir
        self.assertEqual(data_dir.find_data_dir(), self.env_dir)

    def test_require_names_the_place_and_the_setup_skill(self):
        with self.assertRaises(SystemExit) as ctx:
            data_dir.require_data_dir()
        message = str(ctx.exception)
        self.assertIn(self.default_dir, message)
        self.assertIn("setup skill", message)

    def test_data_path_joins_inside_data(self):
        os.makedirs(self.default_dir)
        self.assertEqual(
            data_dir.data_path("linkedin", "ledger.json"),
            os.path.join(self.default_dir, "linkedin", "ledger.json"),
        )

    def test_resolve_does_not_need_the_dir(self):
        self.assertEqual(data_dir.resolve("criteria.md"), os.path.join(self.default_dir, "criteria.md"))


class DefaultLocationTest(unittest.TestCase):
    def test_default_is_data_at_the_repo_root(self):
        self.assertEqual(data_dir.DEFAULT, os.path.join(data_dir.REPO_ROOT, "data"))

    def test_data_is_git_ignored(self):
        with open(os.path.join(data_dir.REPO_ROOT, ".gitignore")) as f:
            self.assertIn("/data", f.read().split())


if __name__ == "__main__":
    unittest.main()
