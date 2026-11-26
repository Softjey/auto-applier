import contextlib
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import data_dir
import init_data_repo


class InitDataRepoTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.target = os.path.join(self.tmp.name, "my-data")
        self.link = os.path.join(self.tmp.name, "repo-data")
        self.settings = os.path.join(self.tmp.name, "settings.local.json")
        identity = {
            "GIT_AUTHOR_NAME": "test", "GIT_AUTHOR_EMAIL": "test@example.com",
            "GIT_COMMITTER_NAME": "test", "GIT_COMMITTER_EMAIL": "test@example.com",
        }
        for patcher in (
            mock.patch.object(data_dir, "DEFAULT", self.link),
            mock.patch.object(init_data_repo, "SETTINGS", self.settings),
            mock.patch.dict(os.environ, identity),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def run_main(self, *argv):
        out = io.StringIO()
        with mock.patch.object(sys, "argv", ["init_data_repo.py", *argv]), contextlib.redirect_stdout(out):
            init_data_repo.main()
        return out.getvalue().strip()

    def test_creates_the_skeleton_and_one_commit(self):
        self.assertEqual(self.run_main("--dir", self.target), self.target)
        for name in ("criteria.md", "README.md", ".gitignore",
                     os.path.join("linkedin", "filters.json"), os.path.join("linkedin", "ledger.json"),
                     os.path.join("triage", ".gitkeep")):
            self.assertTrue(os.path.exists(os.path.join(self.target, name)), name)
        log = subprocess.run(["git", "-C", self.target, "log", "--oneline"],
                             capture_output=True, text=True, check=True).stdout.strip().splitlines()
        self.assertEqual(len(log), 1)
        status = subprocess.run(["git", "-C", self.target, "status", "--short"],
                                capture_output=True, text=True, check=True).stdout
        self.assertEqual(status, "")

    def test_default_creates_the_repo_as_data(self):
        self.assertEqual(self.run_main(), self.link)
        self.assertTrue(os.path.isdir(os.path.join(self.link, ".git")))
        self.assertFalse(os.path.islink(self.link))
        self.assertFalse(os.path.exists(self.settings))

    def test_elsewhere_links_data_and_allows_the_directory(self):
        self.run_main("--dir", self.target)
        self.assertTrue(os.path.islink(self.link))
        self.assertEqual(os.path.realpath(self.link), os.path.realpath(self.target))
        with open(self.settings) as f:
            self.assertIn(self.target, json.load(f)["permissions"]["additionalDirectories"])

    def test_no_claude_md_in_the_data_repo(self):
        self.run_main("--dir", self.target)
        self.assertFalse(os.path.exists(os.path.join(self.target, "CLAUDE.md")))

    def test_session_cookies_are_git_ignored(self):
        self.run_main("--dir", self.target)
        with open(os.path.join(self.target, ".gitignore")) as f:
            self.assertIn("linkedin/session.json", f.read())

    def test_refuses_to_overwrite_an_existing_repo(self):
        self.run_main("--dir", self.target)
        with self.assertRaises(SystemExit) as ctx:
            self.run_main("--dir", self.target)
        self.assertIn("criteria.md", str(ctx.exception))

    def test_refuses_a_directory_inside_the_code_repo(self):
        inside = os.path.join(data_dir.REPO_ROOT, "would-be-data")
        with self.assertRaises(SystemExit):
            self.run_main("--dir", inside)
        self.assertFalse(os.path.exists(inside))

    def test_the_template_carries_no_personal_content(self):
        self.run_main("--dir", self.target)
        with open(os.path.join(self.target, "linkedin", "filters.json")) as f:
            body = f.read()
        self.assertIn('"keywords": []', body)
        with open(os.path.join(self.target, "linkedin", "ledger.json")) as f:
            self.assertIn('"jobs": {}', f.read())


if __name__ == "__main__":
    unittest.main()
