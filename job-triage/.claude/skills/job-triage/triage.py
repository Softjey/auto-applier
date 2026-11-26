#!/usr/bin/env python3
"""Gather vacancies from every source into one batch, and route the verdicts back.

The judgement lives in criteria.md and is the same whatever the source. What
differs is the shape the vacancies arrive in and the call that records the
verdict. This script absorbs both differences so a triage run is always:

    collect -> batch -> read and judge -> check applications -> route -> write

Sources
  onetap    a search_vacancies response, saved to a file by the agent
  linkedin  the output of sources/linkedin.py fetch

Subcommands
  batch   normalise every source into one list of records to judge
  route   split a verdicts file into the calls each source needs
  chunk   split a batch into files for parallel judges
  merge   merge the judges' verdict files and check them

Duplicates are NOT resolved here. A posting that arrives from two sources is
judged twice and caught afterwards by the applications-check skill, which asks
onetap whether the job is already in the pipeline. That check sees the whole
application history, not just the postings in front of it, so it also catches
a vacancy re-listed weeks after it was first judged.

A LinkedIn verdict lands in three places, not one: the job is saved or
dismissed on LinkedIn itself, a save additionally becomes an onetap custom
vacancy, and either way the ledger records it so the next run skips it.

Adding a source means teaching `normalise_*` one more input shape and `route`
one more destination. Nothing else changes.
"""

import argparse
import glob
import json
import os
import re
import subprocess
import sys
import unicodedata
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import data_dir

LINKEDIN = os.path.join(HERE, "sources", "linkedin.py")
LINKEDIN_ACTIONS = os.path.join(HERE, "sources", "linkedin_actions.py")

# Every source a ref can name. `route` dispatches on the prefix of each ref.
SOURCES = ("linkedin", "onetap")


# --------------------------------------------------------------------------
# normalising
# --------------------------------------------------------------------------

def normalise_onetap(payload):
    """A search_vacancies response -> unified records."""
    rows = payload.get("vacancies", payload) if isinstance(payload, dict) else payload
    out = []
    for v in rows:
        sal = v.get("salary") or None
        out.append({
            "ref": f"onetap:{v['id']}",
            "source": "onetap",
            "source_id": v["id"],
            "title": v.get("title"),
            "company": v.get("companyName"),
            "location": ", ".join(c["name"] for c in v.get("cities") or []) or None,
            "workplace": v.get("workplaceType") or None,
            "experience": v.get("experienceLevels") or None,
            "employment": v.get("employmentTypes") or None,
            "published_at": v.get("publishedAt"),
            "salary": {k: sal.get(k) for k in ("min", "max", "currency", "period")} if sal else None,
            "salary_hints": [],
            "keywords": v.get("keywords") or [],
            "description": v.get("descriptionText"),
            # The onetap page, per the link policy — this is what the user is shown.
            "link": v.get("link"),
            "status": v.get("status"),
            "board": ((v.get("source") or {}).get("sitemapJobPostingIndexingSourceData") or {}).get("name"),
        })
    return out


def normalise_linkedin(payload):
    """A sources/linkedin.py fetch response -> unified records."""
    rows = payload.get("jobs", payload) if isinstance(payload, dict) else payload
    out = []
    for j in rows:
        if not j.get("ok"):
            # Keep it visible rather than dropping it silently — an unreadable
            # posting still needs a verdict so it stops coming back.
            out.append({
                "ref": f"linkedin:{j['job_id']}", "source": "linkedin",
                "source_id": j["job_id"], "title": j.get("title"),
                "company": j.get("company"), "link": j.get("link"),
                "unreadable": j.get("error", "could not be read"),
                "description": None, "status": None, "salary": None,
                "salary_hints": [], "keywords": [], "location": None,
                "workplace": None, "experience": None, "employment": None,
                "published_at": None, "board": "LinkedIn",
            })
            continue
        out.append({
            "ref": f"linkedin:{j['job_id']}",
            "source": "linkedin",
            "source_id": j["job_id"],
            "title": j.get("title"),
            "company": j.get("company"),
            "location": j.get("location"),
            # LinkedIn tags workplace and seniority unreliably, so they are
            # carried as raw hints and the description decides. See SKILL.md.
            "workplace": None,
            # Which onetap workplace group the query was aiming at. Declared
            # intent, not something LinkedIn confirmed — the guest backend
            # ignores its own workplace filter entirely.
            "expected_workplace": j.get("expected_workplace"),
            "location_group": j.get("location_group"),
            "found_by": j.get("queries"),
            "experience": None,
            "employment": None,
            "seniority_tag": j.get("seniority"),
            "employment_tag": j.get("employment_type"),
            "published_at": j.get("posted_at") or j.get("posted_text"),
            "salary": None,
            "salary_hints": j.get("salary_hints") or [],
            "keywords": [],
            "description": j.get("description"),
            "link": j.get("link"),
            "status": None,
            "board": "LinkedIn",
        })
    return out


# --------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------

def cmd_batch(args):
    """Normalise every source into one list of records to judge.

    Every record that came back is kept, including postings that look like each
    other. Collapsing them here would mean guessing from a company and a title
    which two cards are one job, and a wrong guess hides a vacancy for good —
    the judge never sees it. The applications-check skill answers the same
    question afterwards from onetap's own pipeline, where it is a fact rather
    than a guess, and at that point one extra read is all a duplicate has cost.
    """
    records = []
    if args.onetap:
        with open(args.onetap) as f:
            records += normalise_onetap(json.load(f))
    if args.linkedin:
        with open(args.linkedin) as f:
            records += normalise_linkedin(json.load(f))
    if not records:
        sys.exit("nothing to batch — pass --onetap and/or --linkedin")

    by_source = {}
    for r in records:
        by_source[r["source"]] = by_source.get(r["source"], 0) + 1

    batch = {
        "batched_at": datetime.now(timezone.utc).isoformat(),
        "to_judge": len(records),
        "by_source": by_source,
        "unreadable": [r["ref"] for r in records if r.get("unreadable")],
        "items": records,
    }
    out = json.dumps(batch, indent=2, ensure_ascii=False)
    if args.out:
        open(args.out, "w").write(out + "\n")
        sys.stderr.write(f"{len(records)} to judge "
                         f"({', '.join(f'{k}: {v}' for k, v in sorted(by_source.items()))}) "
                         f"-> {args.out}\n")
    else:
        print(out)


def cmd_collect(args):
    """Run a source's own fetch end to end, so a single-source run is one call.

    For LinkedIn that is `linkedin.py collect`: interruptible, checkpointed and
    resumable — see its docstring. Running this again with the same flags
    carries on where a stopped run left off.

    Only sources with a local fetcher can be collected this way. onetap comes
    through MCP tools the agent calls itself, so it has nothing to run here —
    save the search_vacancies response to a file and pass it to `batch`.
    """
    if args.source != "linkedin":
        sys.exit(f"'{args.source}' has no local fetcher — see `batch --help`")

    cmd = [sys.executable, LINKEDIN, "collect", "-o", args.out,
           "--workers", str(args.workers)]
    if args.max_age_days:
        cmd += ["--max-age-days", str(args.max_age_days)]
    if args.since_days:
        cmd += ["--since-days", str(args.since_days)]
    if args.max_pages:
        cmd += ["--max-pages", str(args.max_pages)]
    if args.fresh:
        cmd += ["--fresh"]
    for q in args.query or []:
        cmd += ["--query", q]
    for l in args.location or []:
        cmd += ["--location", l]
    for k in args.keyword or []:
        cmd += ["--keyword", k]

    # exec, not a subprocess: the run is linkedin.py's own, so Ctrl-C and
    # SIGTERM reach it directly and it can checkpoint before it exits.
    sys.stdout.flush()
    os.execv(sys.executable, cmd)


def cmd_sources(args):
    """What sources exist, how they are collected, and where their state lives."""
    ledger_path = data_dir.resolve("linkedin", "ledger.json")
    judged = 0
    if os.path.exists(ledger_path):
        judged = len(json.load(open(ledger_path)).get("jobs", {}))
    has_session = (bool(os.environ.get("LINKEDIN_COOKIE"))
                   or os.path.exists(data_dir.resolve("linkedin", "session.json")))
    print(json.dumps({
        "onetap": {
            "collect": "MCP search_vacancies (agent calls it, saves the response)",
            "already_judged": "server-side application status (applicationStatus=NONE)",
            "write": "bulk_update_applications",
            "filters": "saved server-side; useSavedFilters=true",
        },
        "linkedin": {
            "collect": "triage.py collect --source linkedin — interruptible, "
                       "resumable; the same command again carries on",
            "already_judged": f"linkedin/ledger.json ({judged} recorded)",
            "write": "save/dismiss on LinkedIn (route --apply-linkedin) "
                     "+ create_custom_vacancy for keepers + ledger",
            "session": ("present" if has_session else
                        "MISSING — reads work, --apply-linkedin will not; "
                        "see linkedin_actions.py check"),
            "filters": "linkedin/filters.json (no saved search exists on "
                       "LinkedIn's guest API — this file is the equivalent)",
        },
    }, indent=2))


def cmd_route(args):
    """Turn one verdicts file into the calls each source needs."""
    with open(args.verdicts) as f:
        verdicts = json.load(f)
    if isinstance(verdicts, dict):
        verdicts = verdicts.get("verdicts", [])

    batch = {}
    if args.batch:
        with open(args.batch) as f:
            b = json.load(f)
        # `duplicates` too: a collapsed copy still gets a verdict of its own,
        # and its ledger record needs the title and company like any other.
        batch = {i["ref"]: i for i in b.get("items", []) + b.get("duplicates", [])}

    onetap_items, linkedin_creates, ledger, undecided = [], [], [], []
    linkedin_actions = []
    skipped = 0

    for v in verdicts:
        ref = v["ref"]
        if args.only and not ref.startswith(args.only + ":"):
            skipped += 1
            continue
        verdict = v["verdict"]
        reason = (v.get("reason") or "").strip()
        item = batch.get(ref, {})

        if verdict == "UNDECIDED":
            # Deliberately not written anywhere, so it resurfaces next run.
            undecided.append({"ref": ref, "question": v.get("question") or reason})
            continue

        source, sid = ref.split(":", 1)

        if source == "onetap":
            onetap_items.append({
                "vacancyId": sid,
                "status": verdict,
                "notes": reason[:1000],
            })
        elif source == "linkedin":
            if verdict == "SAVED":
                payload = {
                    "title": (item.get("title") or v.get("title") or "")[:100],
                    "companyName": (item.get("company") or v.get("company") or "")[:50],
                    "link": item.get("link") or f"https://www.linkedin.com/jobs/view/{sid}",
                    "description": (item.get("description") or "")[:20000],
                    "status": "SAVED",
                    "notes": f"Source: LinkedIn {sid}. {reason}"[:1000],
                }
                for k in ("keywords", "workplaceType", "experienceLevels",
                          "employmentTypes", "salary", "publishedAt",
                          "cityIds", "countryIds", "categoryIds"):
                    if v.get(k) is not None:
                        payload[k] = v[k]
                linkedin_creates.append(payload)
            # SAVED bookmarks the job on LinkedIn, NOT_INTERESTED dismisses it
            # so the card stops coming back in search. UNREADABLE is neither:
            # the posting is already gone.
            if verdict in ("SAVED", "NOT_INTERESTED"):
                linkedin_actions.append({
                    "job_id": sid,
                    "verdict": verdict,
                    "action": "save" if verdict == "SAVED" else "dismiss",
                })
            ledger.append({
                "job_id": sid,
                "title": item.get("title") or v.get("title"),
                "company": item.get("company") or v.get("company"),
                "verdict": verdict,
                "reason": reason,
                "onetap_vacancy_id": v.get("onetap_vacancy_id"),
            })
        else:
            sys.exit(f"unknown source in ref {ref!r}")

    result = {
        "onetap_bulk_update_applications": {"items": onetap_items},
        "linkedin_create_custom_vacancy": linkedin_creates,
        "linkedin_actions": linkedin_actions,
        "undecided": undecided,
        "counts": {
            "onetap_updates": len(onetap_items),
            "linkedin_creates": len(linkedin_creates),
            "linkedin_saves": sum(1 for a in linkedin_actions if a["action"] == "save"),
            "linkedin_dismissals": sum(1 for a in linkedin_actions if a["action"] == "dismiss"),
            "linkedin_ledger": len(ledger),
            "undecided": len(undecided),
        },
    }
    if args.only:
        result["counts"]["skipped_other_sources"] = skipped

    # Dismissals are opt-in. One sweep rejects thousands of postings, and every
    # dismissal is a write on the candidate's real account, sent one at a time
    # with its pause — hours of writes for the largest group in the batch. So
    # --apply-linkedin bookmarks the keepers and leaves the rejections alone;
    # the ledger is already their record, and it is what stops this script
    # re-reading them. Ask the candidate before passing --dismiss-rejections.
    to_send = [a for a in linkedin_actions
               if a["action"] == "save" or args.dismiss_rejections]
    withheld = len(linkedin_actions) - len(to_send)
    result["counts"]["linkedin_dismissals_withheld"] = withheld

    if to_send and args.apply_linkedin:
        cmd = [sys.executable, LINKEDIN_ACTIONS]
        if args.dry_run:
            cmd.append("--dry-run")
        p = subprocess.run(cmd + ["apply", "-"],
                           input=json.dumps(to_send), text=True,
                           capture_output=True)
        sys.stderr.write(p.stderr)
        try:
            applied = json.loads(p.stdout)
        except json.JSONDecodeError:
            sys.exit(f"linkedin actions failed:\n{p.stdout}\n{p.stderr}")
        result["linkedin_applied"] = applied
        # Only the calls LinkedIn actually accepted go on the ledger record, so
        # a failed dismiss is visible instead of being papered over.
        done = {r["job_id"]: r["action"] for r in applied.get("results", []) if r.get("ok")}
        for rec in ledger:
            if rec["job_id"] in done:
                rec["linkedin_action"] = done[rec["job_id"]]
        if p.returncode != 0:
            sys.stderr.write("NOTE: some LinkedIn actions failed — see linkedin_applied\n")
    elif to_send:
        sys.stderr.write(f"NOTE: {len(to_send)} LinkedIn calls NOT sent "
                         f"(pass --apply-linkedin)\n")

    if withheld:
        sys.stderr.write(f"NOTE: {withheld} dismissals withheld. Rejections stay in the "
                         f"ledger and are left alone on LinkedIn — ask the candidate "
                         f"before passing --dismiss-rejections\n")

    if ledger and args.write_ledger:
        p = subprocess.run([sys.executable, LINKEDIN, "record"],
                           input=json.dumps(ledger), text=True, capture_output=True)
        if p.returncode != 0:
            sys.exit(f"ledger write failed:\n{p.stderr}")
        sys.stderr.write(p.stderr)
        result["ledger_written"] = True
    elif ledger:
        result["ledger_pending"] = ledger
        sys.stderr.write(f"NOTE: {len(ledger)} LinkedIn verdicts NOT written to the "
                         f"ledger (pass --write-ledger once the onetap calls "
                         f"have gone through)\n")

    print(json.dumps(result, indent=2, ensure_ascii=False))


# --------------------------------------------------------------------------
# parallel judging
# --------------------------------------------------------------------------

VERDICTS = ("SAVED", "NOT_INTERESTED", "UNDECIDED", "UNREADABLE")


def load_items(path):
    with open(path) as f:
        data = json.load(f)
    return data["items"] if isinstance(data, dict) else data


def render_item(n, it):
    """One posting the way a judge should read it. The aggregator's keywords
    are left out on purpose - Gate 0: the description decides."""
    lines = ["=" * 100,
             f"[{n}] {it['ref']} | {it.get('company')} | {it.get('title')}",
             f"loc={it.get('location')} wp={it.get('workplace')} "
             f"exp_wp={it.get('expected_workplace')} "
             f"seniority_tag={it.get('seniority_tag')} posted={it.get('published_at')}"]
    if it.get("salary"):
        lines.append("SALARY: " + json.dumps(it["salary"], ensure_ascii=False))
    if it.get("salary_hints"):
        lines.append("SALARY_HINTS: " + " | ".join(it["salary_hints"]))
    if it.get("duplicates_disagree_on"):
        lines.append("DUPLICATES_DISAGREE_ON: "
                     + json.dumps(it["duplicates_disagree_on"], ensure_ascii=False))
    lines.append("-" * 40 + " DESCRIPTION " + "-" * 40)
    lines.append(it.get("description") or "(no description - verdict UNREADABLE)")
    return "\n".join(lines) + "\n"


def cmd_chunk(args):
    """Split a batch into files for parallel judges, balanced across agents."""
    items = load_items(args.batch)
    os.makedirs(args.out_dir, exist_ok=True)
    chunks = []
    for c, start in enumerate(range(0, len(items), args.size)):
        part = items[start:start + args.size]
        text = "".join(render_item(start + i + 1, it) for i, it in enumerate(part))
        name = f"chunk_{c:03d}.txt"
        with open(os.path.join(args.out_dir, name), "w") as f:
            f.write(text)
        chunks.append({"file": name, "verdicts": f"v_{c:03d}.json",
                       "refs": [it["ref"] for it in part], "chars": len(text)})

    # Biggest files first, each to the least-loaded agent, so the agents finish
    # together instead of one of them carrying all the long postings.
    agents = [{"chunks": [], "chars": 0} for _ in range(max(1, args.agents))]
    for ch in sorted(chunks, key=lambda c: -c["chars"]):
        a = min(agents, key=lambda a: a["chars"])
        a["chunks"].append(ch["file"])
        a["chars"] += ch["chars"]
    for a in agents:
        a["chunks"].sort()

    with open(os.path.join(args.out_dir, "manifest.json"), "w") as f:
        json.dump({"batch": os.path.abspath(args.batch), "items": len(items),
                   "chunks": chunks, "agents": agents}, f, indent=2, ensure_ascii=False)
    print(json.dumps({"items": len(items), "chunks": len(chunks), "agents": agents,
                      "out_dir": os.path.abspath(args.out_dir)}, indent=2))


# Reasons are typed on one line, often in ASCII ('znajomosc'), over a posting
# written in Polish with bullets, labels and odd spacing. Both sides are folded
# and then squashed to letters and digits before comparing - measured on the
# 2026-09-10 batch, spacing and bullets alone made 4 of 8 real quotes look
# invented.
_FOLD = str.maketrans({"ł": "l", "Ł": "L", "’": "'", "‘": "'",
                       "“": '"', "”": '"', "„": '"'})
QUOTE_RX = re.compile(r"""(?<!\w)['"‘“„](.+?)['"’”](?!\w)""")
MIN_QUOTE = 8


def fold(text):
    text = unicodedata.normalize("NFKD", (text or "").translate(_FOLD))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text.lower()).strip()


def squash(text):
    return re.sub(r"[^0-9a-z]+", "", text)


def quotes_in(reason):
    """The quoted fragments of a reason, split where the quote elides."""
    out = []
    for q in QUOTE_RX.findall(reason or ""):
        for frag in re.split(r"\.\.\.|…", q):
            frag = fold(frag).strip(" .,;:")
            # Length is judged before squashing, so a short real quote such as
            # '2-5+ years' still counts as one.
            if len(frag) >= MIN_QUOTE and squash(frag):
                out.append(frag)
    return out


def cmd_merge(args):
    """Collect the judges' verdict files into one, and check them.

    A structural gap stops the merge: a posting without a verdict is written
    nowhere and quietly comes back, and one judged twice has no single answer.
    A quote that is not in the posting does not stop it - it goes to `recheck`,
    because a rejection nobody re-reads must at least cite text that exists.
    Keepers and questions are not checked here: the main agent reads all of
    them anyway."""
    items = {it["ref"]: it for it in load_items(args.batch)}
    files = sorted(glob.glob(os.path.join(args.dir, "v_*.json")))
    verdicts, seen, problems = [], {}, []
    for path in files:
        name = os.path.basename(path)
        with open(path) as f:
            for v in json.load(f):
                ref = v.get("ref")
                if ref in seen:
                    problems.append(f"{ref}: judged twice ({seen[ref]} and {name})")
                    continue
                seen[ref] = name
                if ref not in items:
                    problems.append(f"{ref}: not in the batch ({name})")
                    continue
                if v.get("verdict") not in VERDICTS:
                    problems.append(f"{ref}: unknown verdict {v.get('verdict')!r}")
                elif v["verdict"] == "UNDECIDED" and not v.get("question"):
                    problems.append(f"{ref}: UNDECIDED without a question")
                elif v["verdict"] in ("SAVED", "NOT_INTERESTED") and not v.get("reason"):
                    problems.append(f"{ref}: {v['verdict']} without a reason")
                verdicts.append(v)
    problems += [f"{ref}: no verdict" for ref in items if ref not in seen]

    recheck = []
    for v in verdicts:
        if v.get("verdict") != "NOT_INTERESTED":
            continue
        it = items[v["ref"]]
        hay = squash(fold(" ".join(str(it.get(k) or "")
                                   for k in ("title", "location", "description"))))
        quotes = quotes_in(v.get("reason"))
        missing = [q for q in quotes if squash(q) not in hay]
        if not quotes:
            recheck.append({"ref": v["ref"], "why": "no quote"})
        elif missing:
            recheck.append({"ref": v["ref"], "why": "quote not in the posting",
                            "missing": missing})

    report = {"files": len(files), "batch": len(items), "verdicts": len(verdicts),
              "counts": {k: sum(1 for v in verdicts if v.get("verdict") == k)
                         for k in VERDICTS},
              "problems": problems, "recheck": recheck}
    if problems:
        print(json.dumps(report, indent=2, ensure_ascii=False))
        sys.exit(f"{len(problems)} structural problem(s) - nothing written")
    with open(args.out, "w") as f:
        json.dump(verdicts, f, indent=1, ensure_ascii=False)
    report["out"] = args.out
    print(json.dumps(report, indent=2, ensure_ascii=False))


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("batch", help="normalise every source into one batch to judge")
    b.add_argument("--onetap", help="a saved search_vacancies response")
    b.add_argument("--linkedin", help="a sources/linkedin.py fetch response")
    b.add_argument("-o", "--out", help="write the batch here instead of stdout")
    b.set_defaults(func=cmd_batch)

    c = sub.add_parser("collect", help="run one source's fetch end to end")
    c.add_argument("--source", required=True, choices=["linkedin"])
    c.add_argument("-o", "--out", required=True, help="where to write the fetched jobs")
    c.add_argument("--max-age-days", type=int, default=None)
    c.add_argument("--since-days", type=float, default=None,
                   help="override f_TPR with this exact window instead of "
                        "filters.json's configured one — for a narrow ad-hoc ask "
                        "(e.g. 'since Saturday'), see sources/linkedin.py search --help")
    c.add_argument("--max-pages", type=int, default=None)
    c.add_argument("--query", action="append", help="run only this expanded cell (repeatable)")
    c.add_argument("--location", action="append", help="run only this location group (repeatable)")
    c.add_argument("--keyword", action="append", help="run only this keyword (repeatable)")
    c.add_argument("--fresh", action="store_true",
                   help="discard an unfinished run instead of resuming it")
    c.add_argument("--workers", type=int, default=1,
                   help="parallel description fetches (SKILL.md step 0; capped at 4)")
    c.set_defaults(func=cmd_collect)

    sub.add_parser("sources", help="list sources, their state and their filters"
                   ).set_defaults(func=cmd_sources)

    r = sub.add_parser("route", help="split verdicts into per-source calls")
    r.add_argument("verdicts")
    r.add_argument("--batch", help="the batch output, for titles and descriptions")
    r.add_argument("--only", choices=SOURCES,
                   help="route only this source's verdicts, ignoring the rest")
    r.add_argument("--apply-linkedin", action="store_true",
                   help="bookmark the keepers on LinkedIn itself (needs a session). "
                        "Rejections are NOT dismissed unless --dismiss-rejections")
    r.add_argument("--dismiss-rejections", action="store_true",
                   help="with --apply-linkedin, also dismiss every NOT_INTERESTED job "
                        "on LinkedIn. Off by default — ask the candidate first")
    r.add_argument("--dry-run", action="store_true",
                   help="with --apply-linkedin, print the LinkedIn calls without sending them")
    r.add_argument("--write-ledger", action="store_true",
                   help="commit the LinkedIn verdicts to the ledger")
    r.set_defaults(func=cmd_route)

    k = sub.add_parser("chunk", help="split a batch into files for parallel judges")
    k.add_argument("--batch", required=True, help="the clustered batch")
    k.add_argument("-o", "--out-dir", required=True, help="where to write the files")
    k.add_argument("--size", type=int, default=15, help="postings per file (default 15)")
    k.add_argument("--agents", type=int, default=1,
                   help="how many judges to balance the files across")
    k.set_defaults(func=cmd_chunk)

    m = sub.add_parser("merge", help="merge the judges' verdict files and check them")
    m.add_argument("--batch", required=True, help="the clustered batch the files came from")
    m.add_argument("--dir", required=True, help="the chunk directory holding v_*.json")
    m.add_argument("-o", "--out", required=True, help="where to write the merged verdicts")
    m.set_defaults(func=cmd_merge)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
