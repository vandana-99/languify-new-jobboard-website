"""Bounded public searches. No account cookies, paid proxy or AI API is used.

One sequential search stream per platform; stop that platform on a block.
Failures are data, so the Node merger can preserve recent last-known records.
"""
from __future__ import annotations

import concurrent.futures
import datetime as dt
import json
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIELDS = ["site", "title", "company", "location", "job_url", "date_posted",
          "description", "job_type", "is_remote", "work_from_home_type",
          "min_amount", "max_amount", "currency", "interval", "skills", "company_logo"]
NAMES = {"linkedin": "LinkedIn", "naukri": "Naukri"}


def timestamp():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def validate_config(config):
    if not isinstance(config, dict) or type(config.get("resultsPerSearch")) is not int or not 1 <= config["resultsPerSearch"] <= 100:
        raise ValueError("resultsPerSearch must be between 1 and 100")
    if type(config.get("hoursOld")) is not int or not 1 <= config["hoursOld"] <= 2160:
        raise ValueError("hoursOld must be between 1 and 2160")
    sources, searches = config.get("sources"), config.get("searches")
    if not isinstance(sources, list) or not 1 <= len(sources) <= 2 or not isinstance(searches, list) or not 1 <= len(searches) <= 16:
        raise ValueError("Use 1–2 platforms and 1–16 searches")
    seen = set()
    for source in sources:
        if not isinstance(source, dict) or source.get("provider") not in NAMES or source["provider"] in seen or not isinstance(source.get("location"), str) or len(source["location"]) > 120:
            raise ValueError("Invalid platform configuration")
        seen.add(source["provider"])
    seen = set()
    for search in searches:
        if not isinstance(search, dict) or not isinstance(search.get("id"), str) or not re.fullmatch(r"[a-z0-9-]{1,80}", search["id"]) or search["id"] in seen or not isinstance(search.get("term"), str) or not 1 <= len(search["term"].strip()) <= 120:
            raise ValueError("Invalid search configuration")
        seen.add(search["id"])
    return config


def summarize_failure(errors):
    # Do not publish raw response bodies, URLs, headers or package advice about proxies.
    text = json.dumps(errors, default=str).lower()
    blocked = any(word in text for word in ["403", "406", "429", "captcha", "blocked", "rate limit", "access denied"])
    return blocked, ("Platform blocked or rate-limited this collection. Remaining searches are paused until the next run."
                     if blocked else "Platform search failed or returned incomplete data. Recent previous results are retained.")


def query_once(payload):
    from jobspy import scrape_jobs
    try:
        frame = scrape_jobs(
            site_name=[payload["provider"]], search_term=payload["term"],
            location=payload["location"] or None, results_wanted=payload["limit"],
            hours_old=payload["hoursOld"], fetch_description=False, description_format="plain", verbose=0,
            user_agent="LanguifyJobBoard/1.0 (+https://languify-new-jobboard-website.pages.dev/)",
        )
    except Exception as error:
        blocked, message = summarize_failure(str(error))
        return {"status": "error", "error": message, "blocked": blocked, "rows": []}
    errors = frame.attrs.get("errors", {})
    if errors:
        blocked, message = summarize_failure(errors)
        return {"status": "error", "error": message, "blocked": blocked, "rows": []}
    # The library logs malformed/skipped records as warnings. Do not label a
    # partial search complete or use it to remove previous listings.
    if frame.attrs.get("warnings"):
        return {"status": "error", "error": "Platform returned a partial or changed response. Recent previous results are retained.", "blocked": False, "rows": []}
    if not all(field in frame.columns for field in ["site", "title", "company", "job_url", "location"]):
        return {"status": "error", "error": "Platform response schema changed.", "blocked": False, "rows": []}
    rows = json.loads(frame.head(payload["limit"])[[key for key in FIELDS if key in frame.columns]].to_json(orient="records", date_format="iso"))
    return {"status": "ok", "error": None, "blocked": False, "rows": rows, "truncated": len(frame) >= payload["limit"]}


def collect_platform(source, config, deadline):
    results = []
    stopped = None
    for search in config["searches"]:
        entry = {"id": f'{source["provider"]}:{search["id"]}', "provider": source["provider"], "term": search["term"]}
        remaining = deadline - time.monotonic()
        if stopped or remaining < 5:
            response = {"status": "error", "error": stopped or "Collection time limit reached; search deferred to the next run.", "rows": [], "blocked": bool(stopped)}
        else:
            payload = {**source, **search, "limit": config["resultsPerSearch"], "hoursOld": config["hoursOld"]}
            try:
                child = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--query"],
                                       input=json.dumps(payload), text=True, capture_output=True,
                                       timeout=min(70, remaining), check=True)
                response = json.loads(child.stdout)
                if not isinstance(response, dict) or response.get("status") not in ["ok", "error"] or not isinstance(response.get("rows"), list):
                    raise ValueError("Invalid collector response")
                if response.get("blocked"):
                    stopped = response["error"]
            except subprocess.TimeoutExpired:
                response = {"status": "error", "error": "Platform search timed out. Recent previous results are retained.", "rows": [], "blocked": False}
            except Exception:
                response = {"status": "error", "error": "Collector could not complete the platform search.", "rows": [], "blocked": False}
        results.append({**entry, **response, "checkedAt": timestamp()})
        print(f'{NAMES[source["provider"]]} / {search["term"]}: {response["status"]}, {len(response["rows"])} returned', flush=True)
        if not stopped and remaining > 5:
            time.sleep(2)
    return results


def main():
    if sys.argv[1:] == ["--query"]:
        print(json.dumps(query_once(json.load(sys.stdin)), allow_nan=False))
        return
    if sys.argv[1:]:
        raise ValueError("No arguments are needed for scheduled collection")
    config = validate_config(json.loads((ROOT / "config/job-boards.json").read_text()))
    deadline = time.monotonic() + 480
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(collect_platform, source, config, deadline) for source in config["sources"]]
        results = [entry for future in futures for entry in future.result()]
    output = ROOT / ".job-board-results.json"
    temporary = output.with_suffix(".tmp")
    temporary.write_text(json.dumps({"schemaVersion": 1, "collectedAt": timestamp(), "results": results}, ensure_ascii=False, allow_nan=False) + "\n")
    temporary.replace(output)


if __name__ == "__main__":
    main()
