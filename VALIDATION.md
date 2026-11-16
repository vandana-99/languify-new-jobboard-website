# Validation — 27 October 2026

Prepared as an independent project; no existing Vercel, Apify, GitHub remote, domain or navbar settings were changed.

| Check | Result |
| --- | --- |
| Public feed collection | All 15 configured employer feeds returned successfully |
| Matching snapshot | 31 India roles, collected at 2026-10-27 06:28 UTC |
| Categories | Product 6; Consulting 1; Growth 1; Marketing 8; Business 14; Design 1 |
| Node data tests | 13 passed, 0 failed |
| Clean dependency installation | Passed using the included lockfile |
| Production build | Passed; Next.js static export generated `out/` |
| Desktop preview | Header, search, job cards, direct source link destinations and details drawer checked |
| Search | Product Manager search returned the 3 matching titles |
| Saved jobs | Save/remove worked; bookmark survived a page reload |
| Narrow layout | Checked in a 390 × 844 iframe; mobile filter panel opened and Product filter returned 6 roles |
| Existing local project | Clean at commit `842b44e22a8f2ffb797c744774f5f09360b3bcb6` |

Data tests cover category/location matching, sales exclusions, publication-date handling, stable first-seen dates, complete versus failed feeds, 72-hour expiry, malformed responses, partial outages, deduplication, per-source limits, pagination, date filtering and unsafe links/markup.

The initial snapshot contains no explicit internship or entry-level titles. The collector supports them when employers publish matching roles. Experience levels are title-based approximations; descriptions can contain additional requirements.

Not yet verified: a deployed Cloudflare project, a GitHub Actions run in your account, the deploy hook, the account-side schedule, main-platform integration, physical mobile devices or every external job destination. Those require the separate setup in START_HERE.md. The browser preview used the exported static files. Source links are preserved from the employer feeds; a listing’s continued availability is determined by its employer.

The screenshot in `docs/preview.jpg` shows this separate build, not your existing Vercel production site.
