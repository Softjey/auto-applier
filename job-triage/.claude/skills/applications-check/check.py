#!/usr/bin/env python3
"""Answer, for every vacancy in a triage run, whether this job is already known.

Known has two meanings and this script covers both:

  in the batch     the aggregators hand back the same job several times. One
                   posting arrives from Just Join IT, Indeed and the employer
                   feed, and none of the three is in the pipeline yet, so
                   nothing downstream would catch them.
  in the pipeline  the candidate already saved, applied to, or rejected this
                   job on an earlier run, or from the other source.

    batch -> cluster -> judge the primaries -> queries
          -> get_my_applications (MCP) -> match -> route

    cluster   collapse the duplicates inside one batch, keeping the copy that
              carries the most information and enriching it from the rest
    queries   what to ask onetap, one call per company holding a keeper
    match     expand each cluster verdict back onto its duplicates, then flip
              keepers that are already in the pipeline to NOT_INTERESTED

Both halves obey the same rule: a wrong collapse costs a vacancy, because the
candidate never learns it existed, while a missed one costs a single extra
read. So clustering merges only what the evidence settles, everything doubtful
is reported instead of merged, and no duplicate is ever dropped in silence —
it inherits its primary's verdict and is written back to its own source.

There are 6000+ applications on the account, so the pipeline half never dumps
them: get_my_applications takes a free-text `query` over title, company AND
notes, so one call per company covers every keeper from that company. It
over-returns; the matching below is what makes it precise.
"""

import argparse
import html
import json
import os
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone


# --------------------------------------------------------------------------
# keys
# --------------------------------------------------------------------------

# Noise that differs between boards for the same posting: gender markers,
# contract notes, work-model tags, the trailing "(TypeScript/React)" gloss.
#
# Seniority words are deliberately NOT stripped. They read like noise, but
# "Junior Frontend Developer" and "Senior Frontend Developer" at the same
# company are different postings, and treating them as one drops the keeper.
TITLE_NOISE = re.compile(
    r"\b(m\s*/\s*f|f\s*/\s*m|f/m/x|m/f/d|w/m/d|remote|hybrid|onsite|"
    r"b2b|uop|full[- ]?time|part[- ]?time|contract)\b", re.I)

# Company suffixes vary by board: "Company E Ltd" vs "Company E".
COMPANY_NOISE = re.compile(
    r"\b(sp z o o|s a|poland|polska|group|inc|ltd|llc|gmbh)\b")


def clean(s):
    s = (s or "").lower()
    s = re.sub(r"\(.*?\)", " ", s)              # parenthetical stack glosses
    s = TITLE_NOISE.sub(" ", s)
    s = re.sub(r"[^a-z0-9Ѐ-ӿĀ-ſ ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def clean_keep_parens(s):
    """Like clean(), but keeps parenthetical content.

    clean() strips "(...)" as a board-specific stack gloss, which is right
    when a description is also being compared — the parenthetical is noise
    next to the real signal. But when a posting has NO description (see the
    "unreadable" branch of compare()), the title is the only signal left, and
    a company's own postings routinely differ only in that parenthetical:
    "Senior Software Engineer (React Native)" vs "(Typescript and AI)" at
    Company G Technology, or "(Angular.js/React.js)" vs "(React.js+Next.js)" at
    Company F are two different openings, not two copies of one. Stripping the
    parens before comparing collapsed both pairs on 2026-09-13's pipeline
    sweep. So the no-description fallback compares titles with parens intact.
    """
    s = (s or "").lower()
    s = TITLE_NOISE.sub(" ", s)
    s = re.sub(r"[^a-z0-9Ѐ-ӿĀ-ſ() ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def company_key(name):
    return re.sub(r"\s+", " ", COMPANY_NOISE.sub(" ", clean(name))).strip()


def acronym(name):
    """The initials of a multi-word company name, or "" for a single word.

    Taken from clean() rather than company_key(), because company_key strips
    the very words the abbreviation keeps: "Acme Consulting Group" loses its
    "group" to the suffix noise, and the acronym on the boards is ACG.
    """
    parts = clean(name).split()
    return "".join(p[0] for p in parts) if len(parts) > 1 else ""


def company_aliases(items):
    """Resolve an agency's abbreviation onto its full name, within one batch.

    "ACG" and "Acme Consulting Group" are one agency, and the pipeline
    carried the same posting under both spellings — 0.990 containment on an
    identical title, applied to twice a day apart. Nothing in the key
    normalisation catches that, so the pair read as two agencies advertising
    one end client's role and was reported instead of merged.

    Only initials are resolved, only against a full name present in the same
    batch, and only when exactly one full name claims them. An acronym that two
    companies could answer to is left alone: a wrong merge costs a vacancy,
    a missed one costs a line in the report.
    """
    keys, full = set(), {}
    for i in items:
        name = i.get("company")
        if not name:
            continue
        keys.add(company_key(name))
        a = acronym(name)
        if a:
            full.setdefault(a, set()).add(company_key(name))
    return {k: next(iter(names)) for k, names in full.items()
            if k in keys and len(names) == 1 and next(iter(names)) != k}


def job_key(company, title):
    return company_key(company), clean(title)


def link_key(url):
    """Normalise a URL enough that two spellings of one page compare equal."""
    u = (url or "").strip().lower()
    u = re.sub(r"^https?://", "", u)
    u = re.sub(r"^www\.", "", u)
    u = u.split("?")[0].split("#")[0]
    return u.rstrip("/")


# --------------------------------------------------------------------------
# similarity
# --------------------------------------------------------------------------

# Thresholds measured on 50 live onetap records, 2026-09-10. Word 3-shingles,
# containment (the intersection over the SMALLER description, so a board that
# publishes a truncated teaser of the same posting still scores high).
#
#   TRUE duplicates, one job on several boards
#     Company A / Company A Ltd, Senior Frontend Engineer      1.000
#     Company B, Software Engineering Manager GCE (Indeed|feed)  0.990
#     Company Q, Angular Developer (Indeed|Just Join IT)     0.929
#
#   DIFFERENT jobs at one company — the boilerplate floor
#     Company C, Senior Full-stack (PostgreSQL) vs (Python)        0.578
#     Company C, Lead Java vs Senior Full Stack Angular            0.376
#     Company B, Senior SWE App Hub vs SWE Manager GCE           0.516
#     P&P Solutions, Full Stack vs Senior Fullstack           0.003
#
# Two things follow, and both are the opposite of the obvious rule:
#
#   A shared title does not make one job. Company C posted "Senior Full Stack
#   Developer (Angular & Node.js)" twice on one day with the descriptions
#   rewritten — 0.595. Same title, and it may well be two openings.
#
#   A high score does not make one job either, below a point. Company C's
#   boilerplate alone carries two genuinely different roles to 0.578.
#
# So AUTO_MERGE sits at 0.85, clear of every observed different-job pair by a
# wide margin, and the 0.50-0.85 band is reported as suspected rather than
# merged. Re-measure before moving either number.
AUTO_MERGE = 0.85
SUSPECT = 0.50
SHINGLE = 3

# Across DIFFERENT companies the same 50 records give 1196 pairs whose
# containment tops out at 0.060, median 0.000 — companies do not share
# boilerplate the way one company's own postings do. So a cross-company pair
# scoring above AGENCY is extraordinary, and it has one usual explanation:
# two agencies advertising one end client's role under their own names.
#
# That is never merged automatically. Which agency to go through is the
# candidate's call — and applying to one end client through two of them can
# sink both applications — so the pair is raised as a question instead.
AGENCY = 0.35

# Against the pipeline a keeper is compared with every tracked record of its
# company, and a re-listed job is often rewritten, not copied. Company J's
# "Frontend/Games Developer", applied to in August, came back from LinkedIn as
# "Frontend Game Developer" with the text paraphrased — 0.49 — and iTeamly
# re-posted an applied role word for word under a new title (1.00). Both were
# saved again on 2026-09-15/16 because `match` compared exact titles only.
#
# SUSPECT (0.50) cannot catch the paraphrase and is useless here anyway: on the
# 2026-09-13 LinkedIn batch, 26% of 1679 different-job pairs inside one company
# score above it on boilerplate alone (p90 0.57, p99 0.71). The title is what
# separates them. Requiring title similarity >= ASK_TITLE AND description
# >= ASK_DESC left 16 of those 1679 pairs (1%), most of them near-copies worth
# the question, and holds both real misses. Such a keeper is not flipped: it
# becomes UNDECIDED with a question, so it is written nowhere until answered.
ASK_TITLE = 0.70
ASK_DESC = 0.30

# A seniority difference is never cosmetic: "Junior" and "Senior" at one
# company are two jobs whatever the descriptions share.
SENIORITY = {"intern": 0, "junior": 1, "mid": 2, "middle": 2, "regular": 2,
             "senior": 3, "lead": 4, "principal": 5, "staff": 5, "head": 6,
             "director": 6}


def shingles(text, n=SHINGLE):
    words = [w for w in re.split(r"[^a-z0-9ąćęłńóśźż]+", (text or "").lower()) if len(w) > 2]
    return {tuple(words[i:i + n]) for i in range(len(words) - n + 1)}


def containment(a, b):
    """Intersection over the smaller set — a truncated copy still scores high."""
    if not a or not b:
        return 0.0
    return len(a & b) / min(len(a), len(b))


def seniority_of(title):
    found = {SENIORITY[w] for w in clean(title).split() if w in SENIORITY}
    return found


def seniority_conflict(a, b):
    sa, sb = seniority_of(a), seniority_of(b)
    return bool(sa and sb and not (sa & sb))


def title_words(title):
    # Plural folded, so "Games Developer" and "Game Developer" are one title.
    return {w[:-1] if len(w) > 3 and w.endswith("s") else w for w in clean(title).split()}


def title_similarity(a, b):
    wa, wb = title_words(a), title_words(b)
    return len(wa & wb) / len(wa | wb) if wa | wb else 0.0


def compare(x, y, sx=None, sy=None, cx=None, cy=None):
    """How two records in one batch relate: 'same', 'suspect', or None.

    `cx`/`cy` are the companies already resolved through company_aliases; they
    default to the plain key, so a caller with a single pair need not build the
    alias map.
    """
    cx = company_key(x.get("company")) if cx is None else cx
    cy = company_key(y.get("company")) if cy is None else cy
    if cx != cy:
        return None, 0.0
    if seniority_conflict(x.get("title"), y.get("title")):
        return None, 0.0

    same_title = clean(x.get("title")) == clean(y.get("title")) and clean(x.get("title"))

    lx, ly = link_key(x.get("link")), link_key(y.get("link"))
    if lx and lx == ly:
        return "same", 1.0

    sx = shingles(x.get("description")) if sx is None else sx
    sy = shingles(y.get("description")) if sy is None else sy
    score = containment(sx, sy)

    # An unreadable posting has no description to compare. Its title and
    # company are all there is, and it carries nothing the other copy lacks.
    # Compared with parens kept (see clean_keep_parens): with no description
    # to corroborate, a title match is the only evidence, and the noise
    # clean() strips for the scored path is often the one thing that tells
    # two same-company postings apart here.
    if not (x.get("description") and y.get("description")):
        same_title_strict = (clean_keep_parens(x.get("title")) == clean_keep_parens(y.get("title"))
                              and clean_keep_parens(x.get("title")))
        if same_title_strict:
            return "same", score
        # Titles match once parentheticals are stripped but not with them kept:
        # the very case that produced the Company F/Company G false merges. There
        # is no description to settle it either way, so it is reported rather
        # than silently dropped — "never drop anything in silence" applies to
        # the unreadable path too.
        return ("suspect", score) if same_title else (None, score)

    if score >= AUTO_MERGE:
        return "same", score
    if same_title or score >= SUSPECT:
        return "suspect", score
    return None, score


# --------------------------------------------------------------------------
# clustering
# --------------------------------------------------------------------------

# What each field is worth when choosing which copy of a job to keep. Salary
# dominates because Gate 4 is decided on it and most postings omit it: a copy
# that states the band is worth more than a longer copy that does not.
WEIGHTS = {"salary": 40, "location": 8, "workplace": 8, "experience": 8,
           "employment": 5, "published_at": 4}
# Filled in on the primary when it is missing them.
ENRICH = ("salary", "location", "workplace", "experience", "employment",
          "employment_tag", "published_at", "seniority_tag", "board")
# Pooled across the whole cluster instead: more tags are strictly more to go on.
UNION = ("keywords", "salary_hints")
# Where two copies of one job disagree, the judge is told rather than handed
# one version silently. Gate 3 turns on the location and Gate 4 on the money.
WATCH = ("salary", "location", "workplace", "experience")


def has(rec, field):
    v = rec.get(field)
    if field == "salary":
        return bool(v and (v.get("max") or v.get("min")))
    return bool(v)


def info_score(rec):
    """How much this copy of a job actually tells the judge."""
    score = sum(w for f, w in WEIGHTS.items() if has(rec, f))
    score += min(len(rec.get("description") or "") // 100, 30)
    score += min(len(rec.get("keywords") or []), 8)
    # Tiebreak only: an onetap record carries the application status and the
    # onetap link, which is the only URL the candidate may be given.
    if rec.get("source") == "onetap":
        score += 3
    if rec.get("unreadable"):
        score -= 50
    return score


def build_clusters(items):
    """Group the batch into clusters of one job. Union-find over compare().

    Returns the clusters, the same-company pairs too close to ignore but not
    close enough to merge, and the cross-company pairs that look like one role
    advertised by two agencies.
    """
    parent = {i: i for i in range(len(items))}
    shingle_cache = {i: shingles(rec.get("description")) for i, rec in enumerate(items)}

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        a, b = find(i), find(j)
        if a != b:
            parent[b] = a

    # Only same-company pairs can be related, so compare inside those buckets
    # instead of across the whole batch.
    alias = company_aliases(items)
    company = [alias.get(company_key(r.get("company")), company_key(r.get("company")))
               for r in items]

    buckets = {}
    for i in range(len(items)):
        buckets.setdefault(company[i], []).append(i)

    suspects = []
    for key, idxs in buckets.items():
        if not key or len(idxs) < 2:
            continue
        for a in range(len(idxs)):
            for b in range(a + 1, len(idxs)):
                i, j = idxs[a], idxs[b]
                verdict, score = compare(items[i], items[j],
                                         shingle_cache[i], shingle_cache[j],
                                         company[i], company[j])
                if verdict == "same":
                    union(i, j)
                elif verdict == "suspect":
                    suspects.append((i, j, round(score, 3)))

    # Different companies, near-identical text: an agency reposting another
    # company's role. Detected across the whole batch, since there is no
    # company bucket to compare inside.
    agencies = []
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if company[i] == company[j]:
                continue
            if not (shingle_cache[i] and shingle_cache[j]):
                continue
            # Same guard as a merge: one agency's senior role and another's
            # junior one are two jobs, however alike the text reads.
            if seniority_conflict(items[i].get("title"), items[j].get("title")):
                continue
            score = containment(shingle_cache[i], shingle_cache[j])
            if score >= AGENCY:
                agencies.append((i, j, round(score, 3)))

    clusters = {}
    for i in range(len(items)):
        clusters.setdefault(find(i), []).append(i)
    return clusters, suspects, agencies


def enrich(primary, others):
    """Give the primary everything its duplicates knew, and flag what they dispute.

    The point of keeping the richest copy is the information, not the record.
    Blank fields are filled from the other copies, tag lists are pooled, and a
    field two copies fill differently is reported rather than resolved — one
    board saying Remote and another city is exactly what Gate 3 needs to see.

    Descriptions are never merged: the judge reads one posting, not a collage.
    """
    borrowed, disputed = {}, {}

    for field in ENRICH:
        if has(primary, field):
            continue
        for other in others:
            if has(other, field):
                primary[field] = other[field]
                borrowed[field] = other["ref"]
                break

    for field in UNION:
        pool = list(primary.get(field) or [])
        for other in others:
            for v in other.get(field) or []:
                if v not in pool:
                    pool.append(v)
                    borrowed.setdefault(field, other["ref"])
        if pool:
            primary[field] = pool

    for field in WATCH:
        values = {}
        for rec in [primary] + others:
            if has(rec, field):
                values[json.dumps(rec[field], sort_keys=True, ensure_ascii=False)] = rec["ref"]
        if len(values) > 1:
            disputed[field] = [{"value": json.loads(k), "ref": r} for k, r in values.items()]

    if disputed:
        primary["duplicates_disagree_on"] = disputed
    return borrowed, disputed


# --------------------------------------------------------------------------
# inputs
# --------------------------------------------------------------------------

def load_verdicts(path):
    with open(path) as f:
        v = json.load(f)
    return v.get("verdicts", v) if isinstance(v, dict) else v


def load_batch(path):
    """Every record the batch holds, primaries and collapsed duplicates alike."""
    if not path:
        return {}
    with open(path) as f:
        b = json.load(f)
    return {i["ref"]: i for i in b.get("items", []) + b.get("duplicates", [])}


def load_duplicates(path):
    if not path:
        return []
    with open(path) as f:
        return json.load(f).get("duplicates", [])


def load_batch_groups(path):
    """The suspected/cross-company groups cluster() found, or empty for a
    batch that was never clustered (or predates this field)."""
    if not path:
        return [], []
    with open(path) as f:
        b = json.load(f)
    return b.get("suspected_duplicates") or [], b.get("same_job_different_company") or []


def group_is_live(refs, verdict_by_ref):
    """Does this group still matter once every member has a verdict?

    Both suspected_duplicates and same_job_different_company are reported
    at cluster time, before any verdict exists - clustering happens before
    judging on purpose, to save the reads a real merge collapses (see
    AUTO_MERGE above). But neither band actually merges anything: every
    member is read and judged on its own regardless, so nothing is lost by
    asking the candidate about a group only after its members are judged -
    and most groups turn out to be entirely NOT_INTERESTED, at which point
    "which agency should I apply through" or "read these as a set" is a
    question about a job nobody wants.

    A ref missing a verdict counts as live rather than rejected - never drop
    a group because of a gap that should have failed `merge` earlier.
    """
    return any(verdict_by_ref.get(r) != "NOT_INTERESTED" for r in refs)


def keepers(verdicts, batch):
    """The verdicts this check applies to: the ones that survived the gates.

    A rejection is already out, and an UNDECIDED is deliberately written
    nowhere, so neither can be made worse by a duplicate.
    """
    out = []
    for v in verdicts:
        if v.get("verdict") != "SAVED":
            continue
        item = batch.get(v["ref"], {})
        source, sid = v["ref"].split(":", 1)
        out.append({
            "ref": v["ref"],
            "source": source,
            "source_id": sid,
            "company": item.get("company") or v.get("company"),
            "title": item.get("title") or v.get("title"),
            "link": item.get("link") or v.get("link"),
            "description": item.get("description"),
            "verdict": v,
        })
    return out


def flatten_candidates(payload):
    """Accept whatever shape the get_my_applications answers were saved in.

    One response, a list of responses, or a dict keyed by query string — they
    all flatten to one pool, and every keeper is matched against all of it. A
    keeper found by another keeper's query is still caught that way.
    """
    pool, truncated = [], []

    def take(resp, label=None):
        if isinstance(resp, dict) and "applications" in resp:
            apps = resp["applications"]
            total = resp.get("total")
            if isinstance(total, int) and total > len(apps):
                truncated.append({"query": label, "returned": len(apps), "total": total})
            pool.extend(apps)
        elif isinstance(resp, list):
            for r in resp:
                take(r, label)
        elif isinstance(resp, dict) and "vacancy" in resp:
            pool.append(resp)                    # a bare application record

    if isinstance(payload, dict) and "applications" not in payload:
        for label, resp in payload.items():
            take(resp, label)
    else:
        take(payload)

    by_id = {a.get("id") or id(a): a for a in pool}
    return list(by_id.values()), truncated


# --------------------------------------------------------------------------
# matching
# --------------------------------------------------------------------------

def match(keeper, candidates, company_of):
    """Find the application this keeper duplicates.

    Returns (app, matched_by) for a duplicate, or ([(app, why), ...], None)
    for records too close to wave through and not close enough to flip, or
    (None, None). `candidates` are (application, normalised record) pairs
    whose record carries a description where one could be read;
    `company_of` resolves a company name to its alias-aware key.

    The link and the LinkedIn id are facts about the record. Everything after
    them is a resemblance, decided on the descriptions whenever both exist:
    a shared title is not one job (Company C, 0.595), and a new title is not a new
    job (iTeamly, 1.00).
    """
    k_link = link_key(keeper.get("link"))
    k_company = company_of(keeper.get("company"))
    k_title = clean(keeper.get("title"))
    k_shingles = shingles(keeper.get("description"))

    same, ask = None, []
    for app, rec in candidates:
        vac = app.get("vacancy") or {}

        # The same onetap record, not a duplicate of it. Only reachable if the
        # feed handed back something already tracked; skip it either way.
        if keeper["source"] == "onetap" and app.get("vacancyId") == keeper["source_id"]:
            continue

        if k_link and link_key(vac.get("link")) == k_link:
            return app, "link"

        if keeper["source"] == "linkedin":
            sid = keeper["source_id"]
            haystack = f"{vac.get('link') or ''} {app.get('notes') or ''}"
            if sid and sid in haystack:
                return app, "linkedin job id"

        if not k_company or company_of(vac.get("companyName")) != k_company:
            continue
        if same or seniority_conflict(keeper.get("title"), vac.get("title")):
            continue

        tsim = title_similarity(keeper.get("title"), vac.get("title"))
        same_title = bool(k_title) and clean(vac.get("title")) == k_title
        if keeper.get("description") and rec.get("description"):
            score = containment(k_shingles, shingles(rec["description"]))
            if score >= AUTO_MERGE:
                same = (app, f"description ({score:.2f} containment, title "
                             f"similarity {tsim:.2f})")
            elif same_title or (tsim >= ASK_TITLE and score >= ASK_DESC):
                ask.append((app, f"title similarity {tsim:.2f}, description "
                                 f"containment {score:.2f}"))
        elif same_title:
            same = (app, "company + title (no description to compare)")
        elif tsim >= ASK_TITLE:
            ask.append((app, f"title similarity {tsim:.2f}, no description to compare"))

    if same:
        return same
    return (ask, None) if ask else (None, None)


def reason_for(keeper, app, matched_by):
    vac = app.get("vacancy") or {}
    when = (app.get("updatedAt") or app.get("createdAt") or "")[:10]
    original = (keeper["verdict"].get("reason") or "").strip()
    text = (f"Duplicate - already in the pipeline as {app.get('status')}"
            f"{' since ' + when if when else ''}: "
            f"{vac.get('companyName')} / {vac.get('title')}"
            f"{' - ' + vac.get('link') if vac.get('link') else ''}. "
            f"Matched on {matched_by}. Passed the gates on its own merits"
            f"{' (' + original + ')' if original else ''}, "
            f"so this is a duplicate rather than a rejection.")
    return text[:1000]


# --------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------

def cmd_cluster(args):
    """Collapse the duplicates inside one batch before anything is judged.

    The aggregators are the reason this is needed: one posting arrives from
    Just Join IT, from Indeed and from the employer's own feed, and none of the
    three is in the pipeline yet, so the pipeline check cannot catch them.

    Nothing is discarded. A duplicate keeps its ref, its link and its verdict —
    it simply inherits the verdict of the copy that was judged, and is written
    back to its own source so it stops being served again.
    """
    with open(args.batch) as f:
        batch = json.load(f)
    items = batch.get("items", [])
    clusters, suspects, agencies = build_clusters(items)

    primaries, duplicates, report = [], [], []
    for members in clusters.values():
        recs = sorted((items[i] for i in members),
                      key=lambda r: (-info_score(r), -len(r.get("description") or ""),
                                     r["ref"]))
        primary, others = recs[0], recs[1:]
        if others:
            borrowed, disputed = enrich(primary, others)
            primary["also_seen_as"] = [{
                "ref": o["ref"], "source": o["source"], "link": o.get("link"),
                "board": o.get("board"), "title": o.get("title"),
            } for o in others]
            if borrowed:
                primary["enriched_from"] = borrowed
            for o in others:
                o["duplicate_of"] = primary["ref"]
                duplicates.append(o)
            report.append({
                "primary": primary["ref"],
                "disagree_on": sorted(disputed) or None,
                "company": primary.get("company"),
                "title": primary.get("title"),
                "link": primary.get("link"),
                "kept_because": {"info_score": info_score(primary),
                                 "beat": {o["ref"]: info_score(o) for o in others}},
                "enriched_from": borrowed,
                "collapsed": [o["ref"] for o in others],
            })
        primaries.append(primary)

    # One line per group of lookalikes, not one per pair: Company C's five spun
    # postings are nine pairs, and nine rows say nothing the one row does not.
    dup_refs = {d["ref"] for d in duplicates}
    live = [(i, j, sc) for i, j, sc in suspects
            if items[i]["ref"] not in dup_refs and items[j]["ref"] not in dup_refs]
    groups, seen = [], {}
    for i, j, score in live:
        gi, gj = seen.get(i), seen.get(j)
        if gi is None and gj is None:
            g = {"members": {i, j}, "scores": [score]}
            groups.append(g)
            seen[i] = seen[j] = g
        elif gi is gj:
            gi["scores"].append(score)
        elif gi is None or gj is None:
            g = gi or gj
            g["members"].update({i, j})
            g["scores"].append(score)
            seen[i] = seen[j] = g
        else:
            gi["members"] |= gj["members"]
            gi["scores"] += gj["scores"] + [score]
            for m in gj["members"]:
                seen[m] = gi
            groups = [g for g in groups if g is not gj]

    suspected = [{
        "company": items[min(g["members"])].get("company"),
        "refs": [items[m]["ref"] for m in sorted(g["members"])],
        "titles": [items[m].get("title") for m in sorted(g["members"])],
        "containment": [min(g["scores"]), max(g["scores"])],
        "note": ("judged separately - too close to ignore, not close enough to "
                 "merge. Read them as a set: if the gates land differently on "
                 "two of these, say why in the notes."),
    } for g in groups]

    # Never merged, always asked. Which agency to go through is a decision
    # about the candidate's own applications, not a fact about the postings.
    cross_company = [{
        "pair": [items[i]["ref"], items[j]["ref"]],
        "containment": score,
        "companies": [items[i].get("company"), items[j].get("company")],
        "titles": [items[i].get("title"), items[j].get("title")],
        "links": [items[i].get("link"), items[j].get("link")],
        "question": (f"{items[i].get('company')} and {items[j].get('company')} are "
                     f"advertising what reads as one role ({score:.0%} of the shorter "
                     f"description is shared). Two agencies on one end client, most "
                     f"likely. Ask the candidate which to go through - applying via "
                     f"both can sink both. Judged separately until they answer."),
    } for i, j, score in agencies]

    out = dict(batch)
    out.update({
        "clustered_at": datetime.now(timezone.utc).isoformat(),
        "to_judge": len(primaries),
        "collapsed": len(duplicates),
        "clusters": report,
        "suspected_duplicates": suspected,
        "same_job_different_company": cross_company,
        "items": primaries,
        "duplicates": duplicates,
    })
    text = json.dumps(out, indent=2, ensure_ascii=False)
    if args.out:
        open(args.out, "w").write(text + "\n")
        sys.stderr.write(f"{len(items)} records -> {len(primaries)} to judge, "
                         f"{len(duplicates)} collapsed, {len(suspected)} suspected "
                         f"and {len(cross_company)} cross-company group(s) found "
                         f"pre-verdict -> {args.out}. Neither band merges anything, "
                         f"so report only what `match` says is still live once "
                         f"the primaries are judged.\n")
        summary = {k: out[k] for k in ("to_judge", "collapsed", "clusters",
                                       "suspected_duplicates",
                                       "same_job_different_company")}
        print(json.dumps(summary, indent=2, ensure_ascii=False))
    else:
        print(text)


def cmd_queries(args):
    """The get_my_applications calls to make — one per company, not per keeper."""
    ks = keepers(load_verdicts(args.verdicts), load_batch(args.batch))

    # Group on the normalised company, not the raw string: "Company E" from LinkedIn
    # and "Company E Ltd" from onetap are one company and deserve one call. The
    # shortest spelling is the one sent, because the search is a partial match
    # and the shorter string is the one both spellings contain.
    groups = {}
    for k in ks:
        raw = (k.get("company") or "").strip()
        if raw:
            key = company_key(raw)
        else:
            # No company to search on: fall back to the longest words of the
            # title, which is what the free-text search can still bite on.
            raw = " ".join([w for w in clean(k.get("title")).split() if len(w) > 4][:3])
            key = raw
        if not raw:
            continue
        g = groups.setdefault(key, {"query": raw, "for": []})
        if len(raw) < len(g["query"]):
            g["query"] = raw
        g["for"].append(k["ref"])
    by_query = {g["query"]: g["for"] for g in groups.values()}

    print(json.dumps({
        "keepers": len(ks),
        "calls": len(by_query),
        "how": "get_my_applications(query=<query>, limit=100). Save every "
               "response into one JSON object keyed by the query string, then "
               "run `check.py match --candidates <that file>`.",
        "queries": [{"query": q, "for": refs} for q, refs in sorted(by_query.items())],
    }, indent=2, ensure_ascii=False))


def expand_clusters(verdicts, duplicates):
    """Give every collapsed duplicate the verdict its primary received.

    A duplicate is always NOT_INTERESTED, even when its primary is saved: one
    job belongs in the pipeline once. Left unwritten it would simply come back
    on the next run, which is the whole reason the aggregators keep serving it.
    """
    by_ref = {v["ref"]: v for v in verdicts}
    added = []
    for dup in duplicates:
        if dup["ref"] in by_ref:
            continue
        primary = by_ref.get(dup.get("duplicate_of"))
        if not primary or primary.get("verdict") == "UNDECIDED":
            continue
        judged = primary.get("verdict")
        reason = (primary.get("reason") or "").strip()
        added.append({
            "ref": dup["ref"],
            "verdict": "NOT_INTERESTED",
            "reason": (f"Duplicate of {primary['ref']} - the same posting from "
                       f"another board, judged there as {judged}"
                       f"{': ' + reason if reason else ''}")[:1000],
            "duplicate_of": primary["ref"],
            "was": judged,
        })
    return added


def cmd_match(args):
    verdicts = load_verdicts(args.verdicts)
    batch = load_batch(args.batch)

    expanded = expand_clusters(verdicts, load_duplicates(args.batch))
    verdicts = verdicts + expanded

    ks = keepers(verdicts, batch)
    with open(args.candidates) as f:
        applications, truncated = flatten_candidates(json.load(f))

    names = [{"company": k.get("company")} for k in ks] + \
            [{"company": (a.get("vacancy") or {}).get("companyName")} for a in applications]
    alias = company_aliases(names)

    def company_of(name):
        key = company_key(name)
        return alias.get(key, key)

    # Descriptions are read only for the records that share a company with a
    # keeper — the only ones match() compares text against.
    wanted = {company_of(k.get("company")) for k in ks} - {""}
    candidates = [(a, normalise_application(a)) for a in applications
                  if a.get("vacancy", {}).get("id")]
    to_read = [rec for a, rec in candidates if company_of(rec["company"]) in wanted]
    missing = describe_candidates(to_read, args)
    if missing:
        lines = "\n".join(f"  {i}  {c} / {t}  ({w})" for i, c, t, w in missing)
        raise SystemExit(
            f"{len(missing)} tracked record(s) share a company with a keeper but "
            f"have no description to compare, so a re-listed copy under a new "
            f"title would pass unseen. Read each with get_vacancy and pass them "
            f"as --descriptions '{{\"<vacancy id>\": \"<descriptionText>\"}}' "
            f"(an empty string is accepted for a posting that has none):\n{lines}")

    hits, flipped_refs, asked, asked_refs = [], {}, [], {}
    for k in ks:
        found, matched_by = match(k, candidates, company_of)
        if found and matched_by is None:
            question = (f"Possibly a duplicate of something already in the pipeline - "
                        f"confirm before writing it: " + "; ".join(
                            f"{(a.get('vacancy') or {}).get('companyName')} / "
                            f"{(a.get('vacancy') or {}).get('title')} "
                            f"[{a.get('status')}] {(a.get('vacancy') or {}).get('link')} "
                            f"({why})" for a, why in found))[:1000]
            asked_refs[k["ref"]] = question
            asked.append({"ref": k["ref"], "company": k.get("company"),
                          "title": k.get("title"), "link": k.get("link"),
                          "question": question})
            continue
        if not found:
            continue
        app = found
        vac = app.get("vacancy") or {}
        reason = reason_for(k, app, matched_by)
        flipped_refs[k["ref"]] = reason
        hits.append({
            "ref": k["ref"],
            "title": k.get("title"),
            "company": k.get("company"),
            "link": k.get("link"),
            "matched_by": matched_by,
            "already_tracked_as": {
                "application_id": app.get("id"),
                "vacancy_id": app.get("vacancyId"),
                "status": app.get("status"),
                "title": vac.get("title"),
                "company": vac.get("companyName"),
                "link": vac.get("link"),
                "updated_at": app.get("updatedAt"),
            },
            "new_reason": reason,
        })

    out_verdicts = []
    for v in verdicts:
        if v.get("ref") in flipped_refs:
            v = dict(v, verdict="NOT_INTERESTED", reason=flipped_refs[v["ref"]],
                     was="SAVED", duplicate=True)
        elif v.get("ref") in asked_refs:
            # UNDECIDED is written nowhere, so the keeper waits for the
            # candidate's answer instead of entering the pipeline twice.
            v = dict(v, verdict="UNDECIDED", question=asked_refs[v["ref"]],
                     was="SAVED", possible_duplicate=True)
        out_verdicts.append(v)

    # Every verdict is final at this point - cluster expansion and the
    # pipeline flips above are both applied - so this is the one place that
    # can tell a suspected-duplicate group or a cross-company pair that turned
    # out to be all NOT_INTERESTED from one worth still asking about.
    verdict_by_ref = {v.get("ref"): v.get("verdict") for v in out_verdicts}
    suspected, cross_company = load_batch_groups(args.batch)
    live_suspected = [g for g in suspected if group_is_live(g["refs"], verdict_by_ref)]
    live_cross_company = [g for g in cross_company
                          if group_is_live(g["pair"], verdict_by_ref)]

    result = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "cluster_duplicates_expanded": len(expanded),
        "keepers_checked": len(ks),
        "applications_searched": len(applications),
        "duplicates_found": len(hits),
        "possible_duplicates": len(asked),
        "still_keepers": len(ks) - len(hits) - len(asked),
        "hits": hits,
        "ask_candidate": asked,
        "suspected_duplicates_total": len(suspected),
        "suspected_duplicates_live": live_suspected,
        "same_job_different_company_total": len(cross_company),
        "same_job_different_company_live": live_cross_company,
        "truncated_queries": truncated,
        "verdicts": out_verdicts,
    }
    if args.out:
        open(args.out, "w").write(json.dumps(out_verdicts, indent=2, ensure_ascii=False) + "\n")
        result["verdicts"] = f"written to {args.out}"
        sys.stderr.write(f"{len(hits)} of {len(ks)} keepers were already in the "
                         f"pipeline -> {args.out}\n")
    if asked:
        sys.stderr.write(f"{len(asked)} keeper(s) look like something already tracked "
                         f"and were set UNDECIDED - ask the candidate (ask_candidate):\n")
        for a in asked:
            sys.stderr.write(f"  {a['ref']}  {a['company']} / {a['title']}\n")
    if truncated:
        sys.stderr.write(f"WARNING: {len(truncated)} query(s) returned only part of "
                         f"their matches — narrow them and re-run before trusting "
                         f"a clean result\n")
    if suspected or cross_company:
        sys.stderr.write(f"{len(suspected)} suspected-duplicate group(s) -> "
                         f"{len(live_suspected)} still live once NOT_INTERESTED-only "
                         f"groups drop out; {len(cross_company)} cross-company "
                         f"pair(s) -> {len(live_cross_company)} still live. Report "
                         f"only the live ones — the rest are jobs nobody wants either "
                         f"way.\n")
    print(json.dumps(result, indent=2, ensure_ascii=False))


# --------------------------------------------------------------------------
# the pipeline as a batch
# --------------------------------------------------------------------------

# get_my_applications returns a vacancy *summary* — no description — and
# clustering is decided on descriptions. Re-reading 85 of them through
# get_vacancy would spend the context the free-text query was designed to save,
# so they are read off the public onetap page instead, where every indexed
# posting carries a schema.org JobPosting block.
LD_JSON = re.compile(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', re.S)
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " \
     "(KHTML, like Gecko) Chrome/122.0 Safari/537.36"


def untag(s):
    s = re.sub(r"<(br|/p|/li|/h[1-6]|/div)[^>]*>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"[ \t]+", " ", html.unescape(s)).strip()


def normalise_application(app):
    """One get_my_applications record -> the batch shape cluster() reads."""
    v = app.get("vacancy") or {}
    sal = v.get("salary") or None
    return {
        "ref": f"onetap:{v['id']}",
        "source": "onetap",
        "source_id": v["id"],
        "title": v.get("title"),
        "company": v.get("companyName"),
        "location": None,
        "workplace": None,
        "experience": None,
        "employment": None,
        "published_at": None,
        "salary": {k: sal.get(k) for k in ("min", "max", "currency", "period")}
                  if sal else None,
        "salary_hints": [],
        "keywords": [],
        "description": None,
        "link": v.get("link"),
        # What the pipeline half of this skill exists to protect: the record's
        # own status, and the note that says why it holds it.
        "status": app.get("status"),
        "application_id": app.get("id"),
        "notes": app.get("notes") or None,
        "applied_at": (app.get("updatedAt") or "")[:10] or None,
        "board": ((v.get("source") or {}).get("sitemapJobPostingIndexingSourceData")
                  or {}).get("name"),
    }


def page_description(rec, cache):
    """Fill in a record's description from its onetap page. Cached on disk."""
    path = os.path.join(cache, rec["source_id"] + ".html")
    if not (os.path.exists(path) and os.path.getsize(path) > 2000):
        if not rec.get("link"):
            return "no link"
        try:
            req = urllib.request.Request(rec["link"], headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                body = r.read()
        except Exception as e:                       # noqa: BLE001 — reported, not raised
            return f"fetch failed: {e}"
        with open(path, "wb") as f:
            f.write(body)
    page = open(path, encoding="utf-8", errors="replace").read()
    for raw in LD_JSON.findall(page):
        try:
            d = json.loads(raw)
        except ValueError:
            continue
        if d.get("@type") != "JobPosting":
            continue
        rec["description"] = untag(d.get("description") or "") or None
        rec["published_at"] = rec["published_at"] or d.get("datePosted")
        et = d.get("employmentType")
        rec["employment"] = rec["employment"] or ([et] if isinstance(et, str) else et)
        loc = d.get("jobLocation") or {}
        if isinstance(loc, list):
            loc = loc[0] if loc else {}
        addr = loc.get("address") or {} if isinstance(loc, dict) else {}
        rec["location"] = rec["location"] or addr.get("addressLocality") \
                          or addr.get("addressRegion")
        return None if rec["description"] else "empty description"
    # A vacancy the candidate created themselves (create_custom_vacancy) has no
    # public page to index, so it has no JobPosting block. Its description has
    # to come from get_vacancy, through --descriptions.
    return "no JobPosting block (custom vacancy?)"


LINKEDIN_ID = re.compile(r"(?:LinkedIn\D{0,12}|linkedin\.com/jobs/view/(?:[^/\s]*-)?)(\d{9,11})", re.I)


def linkedin_id_of(rec, ledger_ids):
    m = LINKEDIN_ID.search(f"{rec.get('link') or ''} {rec.get('notes') or ''}")
    return m.group(1) if m else ledger_ids.get(rec["source_id"])


def describe_candidates(recs, args):
    """Give every record a description, or name the ones that could not get one.

    A custom vacancy (every LinkedIn keeper is written as one) has no public
    page, so it is read back from LinkedIn's guest endpoint by the job id in its
    notes or in the ledger — no login, one polite call at a time. Whatever is
    still blank must come through --descriptions from get_vacancy.
    """
    supplied = {}
    if args.descriptions:
        with open(args.descriptions) as f:
            supplied = json.load(f)
    todo = []
    for rec in recs:
        if rec["source_id"] in supplied:
            rec["description"] = supplied[rec["source_id"]] or None
            rec["description_supplied"] = True
        else:
            todo.append(rec)
    if args.no_fetch:
        return [(r["source_id"], r["company"], r["title"], "not fetched") for r in todo]

    cache = args.cache or os.path.join(
        os.path.dirname(os.path.abspath(args.out or ".")), "pages")
    os.makedirs(cache, exist_ok=True)
    why = {}
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        for rec, w in zip(todo, ex.map(lambda r: page_description(r, cache), todo)):
            if w:
                why[rec["source_id"]] = w

    blank = [r for r in todo if not r["description"]]
    if blank:
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                        "..", "job-triage", "sources"))
        import linkedin as li
        ledger_ids = {j.get("onetap_vacancy_id"): jid
                      for jid, j in li.load_ledger().get("jobs", {}).items()
                      if j.get("onetap_vacancy_id")}
        for rec in blank:
            jid = linkedin_id_of(rec, ledger_ids)
            if not jid:
                continue
            path = os.path.join(cache, f"linkedin-{jid}.txt")
            if os.path.exists(path):
                rec["description"] = open(path, encoding="utf-8").read() or None
            else:
                job = li.fetch_posting(jid)
                li.polite()
                if job.get("ok"):
                    open(path, "w", encoding="utf-8").write(job["description"])
                    rec["description"] = job["description"]
                else:
                    why[rec["source_id"]] = f"LinkedIn {jid}: {job.get('error')}"

    return [(r["source_id"], r["company"], r["title"], why.get(r["source_id"], "no description"))
            for r in todo if not r["description"]]


def cmd_pipeline(args):
    """Turn the candidate's own applications into a batch, and cluster that.

    The same question as part 1, asked of a different pile. `cluster` finds one
    job served twice by two boards; this finds one job sitting twice in the
    pipeline — saved again a month after it was applied to, or applied to twice
    through two spellings of one agency. Both are answered by the same code:
    this command only supplies the batch.

    Nothing is written back. Flipping a status the candidate set themselves is
    their call, not this script's, so the output is a report to act on.
    """
    items, seen = [], set()
    for path in args.applications:
        with open(path) as f:
            payload = json.load(f)
        rows = payload.get("applications", payload) if isinstance(payload, dict) else payload
        if isinstance(payload, dict) and "total" in payload and payload["total"] != len(rows):
            raise SystemExit(
                f"{path}: get_my_applications reported total={payload['total']} but "
                f"this file only holds {len(rows)} records — it looks like a single "
                f"page (limit=100) was saved instead of the full result set. Fetch "
                f"every page (increase `limit` and/or page through with `page`) and "
                f"merge them into one file before running `pipeline`, or a duplicate "
                f"sitting past the first page will be missed silently.")
        for app in rows:
            rec = normalise_application(app)
            if rec["ref"] in seen:      # the same record under two status queries
                continue
            seen.add(rec["ref"])
            items.append(rec)

    supplied = {}
    if args.descriptions:
        with open(args.descriptions) as f:
            supplied = json.load(f)
    for rec in items:
        text = supplied.get(rec["source_id"])
        if text:
            rec["description"] = text

    why_missing = {}
    if not args.no_fetch:
        cache = args.cache or os.path.join(os.path.dirname(os.path.abspath(args.out or ".")),
                                           "pages")
        os.makedirs(cache, exist_ok=True)
        todo = [r for r in items if not r["description"]]
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            for rec, why in zip(todo, ex.map(lambda r: page_description(r, cache), todo)):
                if why:
                    why_missing[rec["source_id"]] = why

    # Counted off the records themselves, not off the fetch: --no-fetch does no
    # work and so reports no failures, and a run that silently called every
    # description present would be exactly the wrong thing to trust.
    missing = [(r["source_id"], r["company"], r["title"],
                why_missing.get(r["source_id"], "not fetched"))
               for r in items if not r["description"]]

    batch = {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "source": "pipeline",
        "count": len(items),
        "without_description": [
            {"id": i, "company": c, "title": t, "why": w} for i, c, t, w in missing
        ],
        "items": items,
    }
    text = json.dumps(batch, indent=2, ensure_ascii=False)
    if args.out:
        open(args.out, "w").write(text + "\n")
        sys.stderr.write(f"{len(items)} applications -> {args.out}, "
                         f"{len(items) - len(missing)} with a description\n")
    else:
        print(text)
    if missing:
        # Never judged on title alone: a record with no description merges only
        # on an identical title, which is exactly the Company C case that is wrong.
        sys.stderr.write("\nno description — read these with get_vacancy and pass "
                         "them back as --descriptions '{\"<vacancy id>\": \"...\"}':\n")
        for i, c, t, w in missing:
            sys.stderr.write(f"  {i}  {c} / {t}  ({w})\n")


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    pl = sub.add_parser("pipeline",
                        help="build a batch out of the candidate's own applications")
    pl.add_argument("--applications", required=True, nargs="+",
                    help="saved get_my_applications answers, one file per status")
    pl.add_argument("--descriptions",
                    help='{"<vacancy id>": "description"} for postings with no '
                         "public page — custom vacancies, read with get_vacancy")
    pl.add_argument("--cache", help="where to keep the fetched pages "
                                    "(default: pages/ beside --out)")
    pl.add_argument("--workers", type=int, default=6)
    pl.add_argument("--no-fetch", action="store_true",
                    help="use only what --descriptions supplies")
    pl.add_argument("-o", "--out", help="write the batch here")
    pl.set_defaults(func=cmd_pipeline)

    c = sub.add_parser("cluster", help="collapse duplicates inside one batch")
    c.add_argument("--batch", required=True, help="a triage.py batch")
    c.add_argument("-o", "--out", help="write the clustered batch here")
    c.set_defaults(func=cmd_cluster)

    q = sub.add_parser("queries", help="what to ask onetap for this verdicts file")
    q.add_argument("--verdicts", required=True)
    q.add_argument("--batch", help="the triage.py batch, for company and title")
    q.set_defaults(func=cmd_queries)

    m = sub.add_parser("match", help="flip keepers that are already in the pipeline")
    m.add_argument("--verdicts", required=True)
    m.add_argument("--candidates", required=True,
                   help="the saved get_my_applications answers")
    m.add_argument("--batch", help="the triage.py batch, for company, title and description")
    m.add_argument("--descriptions",
                   help='{"<vacancy id>": "description"} for tracked records with no '
                        "readable page, read with get_vacancy")
    m.add_argument("--cache", help="where to keep fetched pages (default: pages/ beside --out)")
    m.add_argument("--workers", type=int, default=6)
    m.add_argument("--no-fetch", action="store_true",
                   help="use only what --descriptions supplies")
    m.add_argument("-o", "--out", help="write the patched verdicts here")
    m.set_defaults(func=cmd_match)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
