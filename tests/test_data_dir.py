import os
import tempfile
import unittest
from unittest import mock

import data_dir


class FindDataDirTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.env_dir = os.path.join(self.tmp.name, "env")
        self.pointer_dir = os.path.join(self.tmp.name, "pointer")
        self.default_dir = os.path.join(self.tmp.name, "default")
        self.pointer_file = os.path.join(self.tmp.name, "data-dir-pointer")
        for patcher in (
            mock.patch.object(data_dir, "POINTER", self.pointer_file),
            mock.patch.object(data_dir, "DEFAULT", self.default_dir),
            mock.patch.dict(os.environ, {}, clear=False),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        os.environ.pop(data_dir.ENV_VAR, None)

    def write_pointer(self, target):
        with open(self.pointer_file, "w") as f:
            f.write(target + "\n")

    def test_none_when_nothing_exists(self):
        self.assertIsNone(data_dir.find_data_dir())

    def test_default_sibling_is_used(self):
        os.makedirs(self.default_dir)
        self.assertEqual(data_dir.find_data_dir(), self.default_dir)

    def test_pointer_file_beats_default(self):
        os.makedirs(self.default_dir)
        os.makedirs(self.pointer_dir)
        self.write_pointer(self.pointer_dir)
        self.assertEqual(data_dir.find_data_dir(), self.pointer_dir)

    def test_env_var_beats_pointer_and_default(self):
        for d in (self.default_dir, self.pointer_dir, self.env_dir):
            os.makedirs(d)
        self.write_pointer(self.pointer_dir)
        os.environ[data_dir.ENV_VAR] = self.env_dir
        self.assertEqual(data_dir.find_data_dir(), self.env_dir)

    def test_missing_env_target_falls_through(self):
        os.makedirs(self.default_dir)
        os.environ[data_dir.ENV_VAR] = self.env_dir
        self.assertEqual(data_dir.find_data_dir(), self.default_dir)

    def test_require_names_every_place_it_looked(self):
        os.environ[data_dir.ENV_VAR] = self.env_dir
        with self.assertRaises(SystemExit) as ctx:
            data_dir.require_data_dir()
        message = str(ctx.exception)
        self.assertIn(self.env_dir, message)
        self.assertIn(self.default_dir, message)
        self.assertIn("setup-job-triage", message)

    def test_data_path_joins_inside_the_found_dir(self):
        os.makedirs(self.default_dir)
        self.assertEqual(
            data_dir.data_path("linkedin", "ledger.json"),
            os.path.join(self.default_dir, "linkedin", "ledger.json"),
        )

    def test_resolve_falls_back_to_default_without_a_dir(self):
        self.assertEqual(
            data_dir.resolve("criteria.md"),
            os.path.join(self.default_dir, "criteria.md"),
        )


class DocumentedNamesTest(unittest.TestCase):
    def test_env_var_name_is_the_documented_one(self):
        self.assertEqual(data_dir.ENV_VAR, "JOB_TRIAGE_DATA_DIR")

    def test_pointer_file_name_is_the_documented_one(self):
        self.assertEqual(os.path.basename(data_dir.POINTER), ".data-dir")


class DefaultLocationTest(unittest.TestCase):
    def test_default_is_a_sibling_named_after_the_repo_folder(self):
        self.assertEqual(
            data_dir.DEFAULT,
            os.path.join(os.path.dirname(data_dir.REPO_ROOT), os.path.basename(data_dir.REPO_ROOT) + "-data"),
        )


if __name__ == "__main__":
    unittest.main()
