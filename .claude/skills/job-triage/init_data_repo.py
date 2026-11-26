#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import subprocess
import sys

import data_dir

TEMPLATE = os.path.join(data_dir.REPO_ROOT, "templates", "data-repo")
SETTINGS = os.path.join(data_dir.REPO_ROOT, ".claude", "settings.local.json")


def inside(path, parent):
    return os.path.commonpath([path, parent]) == parent


def allow_directory(path):
    settings = {}
    if os.path.exists(SETTINGS):
        with open(SETTINGS) as f:
            settings = json.load(f)
    dirs = settings.setdefault("permissions", {}).setdefault("additionalDirectories", [])
    if path not in dirs:
        dirs.append(path)
    os.makedirs(os.path.dirname(SETTINGS), exist_ok=True)
    with open(SETTINGS, "w") as f:
        json.dump(settings, f, indent=2)
        f.write("\n")


def main():
    ap = argparse.ArgumentParser(description="Create the private data repo from the template, as data/ at the repo root.")
    ap.add_argument("--dir", help="create it here instead and make data/ a symlink to it")
    args = ap.parse_args()

    link = data_dir.DEFAULT
    target = os.path.abspath(os.path.expanduser(args.dir)) if args.dir else link

    if target != link and inside(target, data_dir.REPO_ROOT):
        sys.exit(f"{target} is inside the code repo; use the default data/ or a folder outside the repo")
    if os.path.exists(os.path.join(target, "criteria.md")):
        sys.exit(f"{target} already has a criteria.md; refusing to overwrite")
    if target != link and (os.path.lexists(link) and os.path.realpath(link) != target):
        sys.exit(f"{link} already exists and points elsewhere; refusing to replace it")

    shutil.copytree(TEMPLATE, target, dirs_exist_ok=True)
    os.makedirs(os.path.join(target, "triage"), exist_ok=True)
    open(os.path.join(target, "triage", ".gitkeep"), "a").close()

    if not os.path.isdir(os.path.join(target, ".git")):
        subprocess.run(["git", "-C", target, "init", "-q"], check=True)
    subprocess.run(["git", "-C", target, "add", "-A"], check=True)
    subprocess.run(["git", "-C", target, "commit", "-q", "-m", "chore: initial data repo"], check=True)

    if target != link:
        if not os.path.lexists(link):
            os.symlink(target, link)
        allow_directory(target)

    print(target)


if __name__ == "__main__":
    main()
