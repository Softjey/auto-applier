import os

ENV_VAR = "JOB_TRIAGE_DATA_DIR"

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
DEFAULT = os.path.join(REPO_ROOT, "data")


def location():
    override = os.environ.get(ENV_VAR)
    return os.path.abspath(os.path.expanduser(override)) if override else DEFAULT


def find_data_dir():
    path = location()
    return path if os.path.isdir(path) else None


def require_data_dir():
    found = find_data_dir()
    if found:
        return found
    raise SystemExit(
        f"No data repo found at {location()}.\n"
        "Create one with the setup-data-repo or setup-job-triage skill: data/ at the repo root is a clone of "
        "your private data repo or a symlink to it."
    )


def data_path(*parts):
    return os.path.join(require_data_dir(), *parts)


def resolve(*parts):
    return os.path.join(location(), *parts)
