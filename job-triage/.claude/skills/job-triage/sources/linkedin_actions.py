#!/usr/bin/env python3
"""Act on LinkedIn jobs as the logged-in candidate: dismiss, save, and undo.

This is the *write* half of the LinkedIn source, and unlike `linkedin.py` it
needs a real session — the guest endpoints can read postings but cannot change
anything on the account. Three endpoints, all captured from the live web app:

  POST voyagerJobsDashJobPostingRelevanceFeedback?action=dismiss      -> 201
  POST voyagerJobsDashJobPostingRelevanceFeedback?action=undoDismiss  -> 200
  POST voyagerFeedDashSaveStates/urn:li:fsd_saveState:(SAVE,<urn>)    -> 204

Dismiss is what the "X / Not interested" button on a job card does; the job
stops coming back in search. Save is the bookmark, and its unsave is the same
call with `saved: false` — there is no separate endpoint.

Session
  The cookies of a logged-in browser, supplied either as
    - $LINKEDIN_COOKIE, a whole `Cookie:` header, or
    - linkedin/session.json, {"cookie": "..."} or {"li_at": ..., "jsessionid": ...}
  `csrf-token` is not a separate secret: it is the JSESSIONID value with its
  quotes stripped, so nothing beyond the cookies has to be captured.

Subcommands
  check           confirm the session still works, without touching any job
  dismiss         hide jobs from search ("not interested")
  undo-dismiss    bring them back
  save            bookmark jobs
  unsave          remove the bookmark
  apply           run a verdicts file: SAVED -> save, NOT_INTERESTED -> dismiss

Everything is stdlib. Run with python3, no install step.
"""

import argparse
import base64
import gzip
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
import data_dir

SESSION_PATH = data_dir.resolve("linkedin", "session.json")

API = "https://www.linkedin.com/voyager/api"
FEEDBACK_URL = API + "/voyagerJobsDashJobPostingRelevanceFeedback?action={action}"
SAVE_URL = API + "/voyagerFeedDashSaveStates/urn:li:fsd_saveState:(SAVE,urn:li:fsd_jobPosting:{job_id})"
ME_URL = API + "/me"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36")

# Tracking headers. Voyager rejects requests without x-restli-protocol-version;
# the rest is what the web app sends and is cheaper to mirror than to test.
CLIENT_VERSION = "1.13.46516"


def local_timezone():
    try:
        target = os.path.realpath("/etc/localtime")
    except OSError:
        return "UTC"
    return target.split("zoneinfo/", 1)[1] if "zoneinfo/" in target else "UTC"


TRACK = json.dumps({
    "clientVersion": CLIENT_VERSION,
    "mpVersion": CLIENT_VERSION,
    "osName": "web",
    "timezoneOffset": time.localtime().tm_gmtoff // 3600,
    "timezone": local_timezone(),
    "deviceFormFactor": "DESKTOP",
    "mpName": "voyager-web",
}, separators=(",", ":"))

# The dismiss endpoint records which surface the click came from. The triage
# run is the search results page, which is what JOB_SEARCH means.
CHANNEL = "JOB_SEARCH"


# --------------------------------------------------------------------------
# session
# --------------------------------------------------------------------------

def load_cookie():
    """Return the Cookie header, from the environment or the session file."""
    raw = os.environ.get("LINKEDIN_COOKIE", "").strip()
    if raw:
        return raw, "$LINKEDIN_COOKIE"

    if not os.path.exists(SESSION_PATH):
        sys.exit(
            "no LinkedIn session.\n"
            f"  Write one to {SESSION_PATH}:\n"
            '    {"li_at": "<li_at cookie>", "jsessionid": "ajax:<digits>"}\n'
            "  or paste a whole Cookie header as {\"cookie\": \"...\"},\n"
            "  or export it as $LINKEDIN_COOKIE.\n"
            "  Both come from DevTools > Application > Cookies on linkedin.com\n"
            "  while logged in. The file is gitignored."
        )
    with open(SESSION_PATH) as f:
        s = json.load(f)
    if s.get("cookie"):
        return s["cookie"].strip(), SESSION_PATH
    li_at = (s.get("li_at") or "").strip()
    jsid = (s.get("jsessionid") or s.get("JSESSIONID") or "").strip()
    if not li_at or not jsid:
        sys.exit(f"{SESSION_PATH} needs either 'cookie', or both 'li_at' and 'jsessionid'")
    return f'li_at={li_at}; JSESSIONID="{jsid.strip(chr(34))}"', SESSION_PATH


def csrf_from(cookie):
    """LinkedIn's csrf-token is the JSESSIONID value with the quotes stripped."""
    for part in cookie.split(";"):
        name, _, value = part.strip().partition("=")
        if name == "JSESSIONID":
            token = value.strip().strip('"')
            if not token.startswith("ajax:"):
                sys.exit(f"JSESSIONID looks wrong ({token[:12]!r}); expected it to start with 'ajax:'")
            return token
    sys.exit("no JSESSIONID in the cookie — that cookie carries the csrf token, "
             "so it has to be copied along with li_at")


def page_instance():
    """A fresh tracking id per run. Voyager logs it; nothing depends on it."""
    blob = base64.b64encode(os.urandom(16)).decode()
    return f"urn:li:page:d_flagship3_search_srp_jobs;{blob}"


# --------------------------------------------------------------------------
# http
# --------------------------------------------------------------------------

class Session:
    def __init__(self, cookie, origin, dry_run=False):
        self.cookie = cookie
        self.origin = origin
        self.csrf = csrf_from(cookie)
        self.page = page_instance()
        self.dry_run = dry_run

    def headers(self, pem=None):
        h = {
            "accept": "application/vnd.linkedin.normalized+json+2.1",
            "accept-language": "en-US,en;q=0.9",
            "accept-encoding": "gzip",
            "content-type": "application/json; charset=UTF-8",
            "cookie": self.cookie,
            "csrf-token": self.csrf,
            "origin": "https://www.linkedin.com",
            "referer": "https://www.linkedin.com/jobs/search-results/",
            "user-agent": UA,
            "x-li-lang": "en_US",
            "x-li-page-instance": self.page,
            "x-li-track": TRACK,
            "x-restli-protocol-version": "2.0.0",
        }
        if pem:
            h["x-li-pem-metadata"] = pem
        return h

    def call(self, url, body=None, pem=None, method="POST", tries=3, timeout=30):
        """One Voyager call. Returns (status, parsed body or None)."""
        data = json.dumps(body).encode() if body is not None else None
        delay = 3.0
        for attempt in range(tries):
            req = urllib.request.Request(url, data=data, method=method,
                                         headers=self.headers(pem))
            try:
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    raw = r.read()
                    if r.headers.get("Content-Encoding") == "gzip":
                        raw = gzip.decompress(raw)
                    text = raw.decode("utf-8", "replace")
                    return r.status, (json.loads(text) if text.strip() else None)
            except urllib.error.HTTPError as e:
                # An expired or mistyped session is not worth retrying, and the
                # 999 is LinkedIn's "we think you are a bot" answer.
                if e.code in (401, 403, 999):
                    sys.exit(
                        f"LinkedIn refused the session (HTTP {e.code}) on {url}\n"
                        f"  cookies came from {self.origin}\n"
                        "  li_at expires and JSESSIONID rotates on logout — re-copy both."
                    )
                if e.code in (429, 500, 502, 503, 504) and attempt < tries - 1:
                    sys.stderr.write(f"  http {e.code}, retrying in {delay:.0f}s\n")
                    time.sleep(delay)
                    delay *= 2
                    continue
                detail = e.read()[:400].decode("utf-8", "replace")
                raise SystemExit(f"HTTP {e.code} on {url}\n  {detail}")
            except (urllib.error.URLError, TimeoutError) as e:
                if attempt < tries - 1:
                    sys.stderr.write(f"  {e}, retrying in {delay:.0f}s\n")
                    time.sleep(delay)
                    delay *= 2
                    continue
                raise
        return None, None


def polite(lo=1.2, hi=2.6):
    """These are writes on a real account. Do not machine-gun them."""
    time.sleep(random.uniform(lo, hi))


# --------------------------------------------------------------------------
# the three actions
# --------------------------------------------------------------------------

def feedback(sess, job_id, action):
    """dismiss / undoDismiss. Both take the same body and differ only in ?action."""
    pem = ("Voyager - Careers - Job Card=job-card-action-dismiss"
           if action == "dismiss" else
           "Voyager - Careers - Job Card=job-card-action-undo-dismiss")
    url = FEEDBACK_URL.format(action=action)
    payload = {
        "jobPostingRelevanceFeedbackUrn":
            f"urn:li:fsd_jobPostingRelevanceFeedback:urn:li:fsd_jobPosting:{job_id}",
        "channel": CHANNEL,
    }
    if sess.dry_run:
        return {"job_id": job_id, "action": action, "dry_run": True,
                "url": url, "body": payload}
    status, body = sess.call(url, payload, pem=pem)

    # The response echoes the resulting state, so the outcome is checkable
    # rather than assumed from the status code.
    dismissed = None
    for inc in (body or {}).get("included", []):
        if "dismissed" in inc:
            dismissed = inc["dismissed"]
    expected = action == "dismiss"
    ok = status in (200, 201) and (dismissed is None or dismissed is expected)
    return {"job_id": job_id, "action": action, "status": status,
            "dismissed": dismissed, "ok": ok}


def save_state(sess, job_id, saved):
    """Bookmark or un-bookmark. One endpoint, a patch that flips `saved`."""
    url = SAVE_URL.format(job_id=job_id)
    payload = {"patch": {"$set": {"saved": bool(saved)}}}
    action = "save" if saved else "unsave"
    if sess.dry_run:
        return {"job_id": job_id, "action": action, "dry_run": True,
                "url": url, "body": payload}
    status, _ = sess.call(
        url, payload,
        pem="Voyager - Careers - Job Details=job-details-save-job,"
            "Voyager - Careers - Critical - careers-api=job-details-save-job",
    )
    # A successful patch answers 204 with an empty body.
    return {"job_id": job_id, "action": action, "status": status,
            "saved": bool(saved), "ok": status in (200, 204)}


def run_batch(sess, jobs, fn, label, pause=polite):
    """Apply one action across job ids, one at a time, and report each."""
    results = []
    for i, jid in enumerate(jobs):
        if i:
            pause()
        r = fn(sess, str(jid))
        results.append(r)
        mark = "dry" if r.get("dry_run") else ("ok" if r.get("ok") else "FAILED")
        sys.stderr.write(f"  [{i+1}/{len(jobs)}] {label} {jid}: {mark}\n")
    return results


def report(results):
    failed = [r for r in results if not r.get("dry_run") and not r.get("ok")]
    print(json.dumps({"results": results,
                      "done": len(results) - len(failed),
                      "failed": len(failed)}, indent=2))
    if failed:
        sys.exit(1)


# --------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------

def session_from(args):
    cookie, origin = load_cookie()
    return Session(cookie, origin, dry_run=getattr(args, "dry_run", False))


def cmd_check(args):
    """Prove the session works without changing anything on the account."""
    sess = session_from(args)
    status, body = sess.call(ME_URL, method="GET")
    who = None
    for inc in (body or {}).get("included", []):
        if inc.get("firstName"):
            who = f"{inc.get('firstName')} {inc.get('lastName', '')}".strip()
            break
    print(json.dumps({"status": status, "ok": status == 200,
                      "identity": who, "cookie_from": sess.origin}, indent=2))
    if status != 200:
        sys.exit(1)


def cmd_dismiss(args):
    sess = session_from(args)
    report(run_batch(sess, args.job_ids,
                     lambda s, j: feedback(s, j, "dismiss"), "dismiss"))


def cmd_undo_dismiss(args):
    sess = session_from(args)
    report(run_batch(sess, args.job_ids,
                     lambda s, j: feedback(s, j, "undoDismiss"), "undo-dismiss"))


def cmd_save(args):
    sess = session_from(args)
    report(run_batch(sess, args.job_ids,
                     lambda s, j: save_state(s, j, True), "save",
                     pause=lambda: polite(2.0, 5.0)))


def cmd_unsave(args):
    sess = session_from(args)
    report(run_batch(sess, args.job_ids,
                     lambda s, j: save_state(s, j, False), "unsave"))


def cmd_apply(args):
    """Turn verdicts into LinkedIn actions: SAVED saves, NOT_INTERESTED dismisses.

    Input is either triage.py's `linkedin_actions` block or a bare list of
    {job_id|ref, verdict}. UNDECIDED and UNREADABLE are left alone — the first
    has to resurface next run, and the second is already gone from LinkedIn.
    """
    src = args.json_file
    payload = json.load(open(src)) if src and src != "-" else json.loads(sys.stdin.read())
    if isinstance(payload, dict):
        payload = payload.get("linkedin_actions") or payload.get("verdicts") or []

    to_save, to_dismiss, skipped = [], [], []
    for e in payload:
        jid = str(e.get("job_id") or e.get("ref", "").split(":", 1)[-1])
        if not jid:
            continue
        verdict = e.get("verdict")
        if verdict == "SAVED":
            to_save.append(jid)
        elif verdict == "NOT_INTERESTED":
            to_dismiss.append(jid)
        else:
            skipped.append({"job_id": jid, "verdict": verdict})

    sys.stderr.write(f"linkedin: {len(to_save)} to save, {len(to_dismiss)} to dismiss, "
                     f"{len(skipped)} left alone\n")
    sess = session_from(args)
    results = []
    results += run_batch(sess, to_save, lambda s, j: save_state(s, j, True), "save",
                         pause=lambda: polite(2.0, 5.0))
    if to_save and to_dismiss:
        polite(2.0, 5.0)
    results += run_batch(sess, to_dismiss,
                         lambda s, j: feedback(s, j, "dismiss"), "dismiss")

    failed = [r for r in results if not r.get("dry_run") and not r.get("ok")]
    print(json.dumps({"results": results, "skipped": skipped,
                      "saved": len(to_save), "dismissed": len(to_dismiss),
                      "failed": len(failed)}, indent=2))
    if failed:
        sys.exit(1)


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dry-run", action="store_true",
                   help="print the calls without sending them")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("check", help="verify the session").set_defaults(func=cmd_check)

    for name, fn, helptext in (
        ("dismiss", cmd_dismiss, "hide jobs from search"),
        ("undo-dismiss", cmd_undo_dismiss, "bring dismissed jobs back"),
        ("save", cmd_save, "bookmark jobs"),
        ("unsave", cmd_unsave, "remove the bookmark"),
    ):
        s = sub.add_parser(name, help=helptext)
        s.add_argument("job_ids", nargs="+", help="LinkedIn numeric job ids")
        s.set_defaults(func=fn)

    a = sub.add_parser("apply", help="run a verdicts file against LinkedIn")
    a.add_argument("json_file", nargs="?", help="verdicts file (default: stdin)")
    a.set_defaults(func=cmd_apply)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
