import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
INPUTS = os.path.join(ROOT, "fixtures", "persona", "inputs")
EVALS = os.path.join(ROOT, "evals")

MOCKS = {
    os.path.join("mocks", "onetap", "get_my_applications.md"): "onetap-applications.json",
    os.path.join("job-triage-onetap-borderline", "mocks", "onetap", "search_vacancies.md"): "onetap-feed-borderline.json",
    os.path.join("job-triage-onetap-duplicates", "mocks", "onetap", "search_vacancies.md"): "onetap-feed-duplicates.json",
    os.path.join("job-triage-onetap-rules-a", "mocks", "onetap", "search_vacancies.md"): "onetap-feed-rules-a.json",
    os.path.join("job-triage-onetap-rules-b", "mocks", "onetap", "search_vacancies.md"): "onetap-feed-rules-b.json",
}


def render(fixture_name):
    with open(os.path.join(INPUTS, fixture_name), encoding="utf-8") as f:
        data = json.load(f)
    return "---\n---\n" + json.dumps(data, ensure_ascii=False) + "\n"


def stale():
    out = []
    for mock, fixture in MOCKS.items():
        path = os.path.join(EVALS, mock)
        try:
            with open(path, encoding="utf-8") as f:
                current = f.read()
        except FileNotFoundError:
            current = None
        if current != render(fixture):
            out.append(mock)
    return out


def build():
    for mock, fixture in MOCKS.items():
        path = os.path.join(EVALS, mock)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(render(fixture))


def main(argv):
    if argv[1:] == ["--check"]:
        bad = stale()
        for mock in bad:
            print(f"stale: evals/{mock}", file=sys.stderr)
        return 1 if bad else 0
    if argv[1:]:
        print("usage: build_mocks.py [--check]", file=sys.stderr)
        return 2
    build()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
