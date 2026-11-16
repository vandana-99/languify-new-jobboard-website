# Languify Jobs — public employer feeds

A standalone, static job board for the separate free-service route. The existing Vercel/Apify project is not a dependency and has not been modified.

Start with **START_HERE.md** for GitHub upload and Cloudflare Pages setup. This package has not been deployed and no account-side schedule has been enabled by its creation.

## What is included

- Next.js static export, React, TypeScript and Tailwind; primary colour `#003E8C`.
- Job Board title in a separate white container; no repeated Languify logo, back button or case-practice promotion.
- Search, India location search, category/work arrangement/experience/job-type/date filters, sorting, pagination, grid/list display, local bookmarks and a details drawer.
- Direct HTTPS links to the original employer listing and application page. Company logos are used only when explicitly configured; otherwise the card displays initials.
- Node-only collector for Greenhouse Job Board and Lever Postings public GET APIs. No scraping browser, AI calls, API token or server runtime.
- A real initial snapshot in `public/jobs.json`, not example opportunities. Inspect its timestamps and `sources` list for the exact collection result.
- Scheduled GitHub Actions collection and an explicit Cloudflare Pages deploy-hook request, plus automated feed tests.

## Coverage and data rules

`config/sources.json` contains 15 working employer boards checked while preparing this package: Groww, CRED, Stripe, MongoDB, Rubrik, Zscaler, Databricks, GitLab, Okta, Figma, Airbnb, Coinbase, Thoughtworks, Twilio and Guidepoint. A working board may have zero matching jobs at a given time.

The collector accepts product management, consulting, business/data/strategy analyst, growth, marketing and design titles, including internships in those areas. Explicit sales/business-development/account-executive/customer-success/recruitment titles are excluded. Titles determine categories; this is a transparent rule-based filter, not a comprehensive occupational taxonomy.

India must be explicit in the feed’s country or location (including recognised Indian cities). Generic “Remote” or “APAC” does not establish eligibility to work from India. Internship or entry-level openings appear only when an employer actually supplies matching roles; there is no guaranteed number in each category.

This is **selected-employer coverage**, not LinkedIn/Naukri-wide search. It links to the employer/ATS listing, not a reconstructed LinkedIn search URL. Full-market coverage would require other authorised sources. Feeds may change or become unavailable.

Up to **40 matching jobs per employer** are published by default. Complete feeds are fetched before applying the cap, so pagination is not mistaken for job removal. Actual source publication dates determine the cap order where available. Listings with older publication dates stay visible while the employer feed still publishes them; “Any time” is the default.

Dates are handled separately:

- `postedAt`: Greenhouse `first_published`, when present and valid. `updated_at` and Lever `createdAt` are not presented as publication dates.
- `firstSeenAt`: when this collector first included the job in its published snapshot. It is preserved across consecutive updates, not advertised as the employer’s posting date.
- `verifiedAt`: when the job last appeared in a successfully fetched employer feed. It does not mean a human verified the vacancy or that the destination was checked separately.

The date filter uses only `postedAt`; undated jobs remain under Any time. “Latest found” sorts by first-seen time, then available publication date. Reappearing jobs can receive a new first-seen time if they were absent from the prior snapshot. Work arrangement/type is not guessed from an office city. Experience level is an approximation from explicit title words; required years must be read on the original listing. Salary and structured skills are currently left unspecified instead of inferred from description text.

## Update path and failures

1. GitHub Actions fetches employer feeds twice daily, with a maximum of three simultaneous requests and per-request timeouts.
2. The collector validates each response, normalises matching jobs, deduplicates listing URLs and atomically replaces `public/jobs.json`.
3. The workflow commits the snapshot to this separate repository. Cloudflare’s Git integration may also request a build from this commit.
4. It calls the secret Cloudflare deploy hook to request a build from the same branch. Cloudflare builds the static `out/` directory and publishes it.
5. Visitors load the exported page; while visible, the browser checks `/jobs.json` every minute with cache revalidation disabled by the supplied headers. A page refresh is not a collection request.

The workflow runs at 04:17/16:17 UTC, approximately 09:47/21:47 IST. Scheduling, collection and deployment can all add delay. It is scheduled freshness, not continuous streaming.

Successful complete feeds replace their earlier employer results, including removing closed/missing jobs. Failed or malformed feeds retain only their previously verified listings for up to 72 hours and record an error without advancing those listings’ verification timestamps. After 26 hours without a successful check, the frontend shows a warning; after 72 hours individual old jobs disappear even if the scheduler or deployment has stopped entirely. A partial failure is recorded in the snapshot and collection summary. A complete outage still publishes the warning snapshot where possible, then fails the workflow’s final health step.

Unknown failures are not replaced with demo jobs. All feed URLs are constructed from provider/board configuration, not arbitrary URLs. Descriptions are decoded and stripped of markup, then rendered as React text. HTTPS destination URLs are validated. No application submissions, personal applicant data or credentials are collected.

## Local development

Use Node.js 22.13 or newer (Node 22 LTS is configured). In this project directory:

```bash
npm ci
npm test
npm run collect
npm run dev
```

Open the URL printed by Next.js. To create a production static export:

```bash
npm run build
```

The deployable files are in `out/`. No Cloudflare Workers adapter or Vercel serverless function is needed. `npm run collect` and `npm test` use only Node built-ins; the scheduled workflow does not install the frontend dependencies.

## Add or change employers

Add an entry to `config/sources.json` using an employer’s real public board token:

```json
{ "provider": "greenhouse", "board": "EMPLOYER_BOARD_TOKEN", "company": "Employer name" }
```

Use lowercase board tokens from the actual employer board, not necessarily its marketing name. Replace the placeholder; do not paste this example unchanged. Providers currently supported: `greenhouse` and `lever` on their configured public API hosts. Other platforms need a new adapter; this is not a generic website scraper.

An optional `logo` field can contain an HTTPS company image URL you have permission to use. Neither API is assumed to supply a logo. Failed images fall back to initials. Do not add a paid logo API just to populate these marks.

Run tests and collection after editing sources. Check the per-employer result and original destination before deploying. Change the top-level `limitPerSource` if required (1–100 supported); its current value is 40. The safety cap is 30 configured employers. Edit `scripts/feed.mjs` and its tests if changing role/location matching.

## Free-service budget

Cloudflare Pages Free currently includes 500 builds/month; static requests do not use Pages Functions billing. Two daily collections request roughly 60–62 builds/month. If Git integration also builds the same bot commits, allow up to about 120–124, plus manual/code deployments. This project has no Pages Functions.

GitHub Free currently includes 2,000 Actions minutes/month for private repositories; standard hosted runners for public repositories are free. Each supplied run has a 10-minute ceiling, so 62 scheduled runs have an upper bound of 620 minutes; other workflows and manual runs share your account allowance. Keep paid usage disabled/budgeted according to your account policy and monitor usage. No paid GitHub plan is required for the supplied design.

These are current free allowances, not a guarantee of unlimited usage or unchanged future pricing. Public feeds can impose their own limits. A new custom domain, paid upgrades and staff time are not included in a zero-service-cost claim. The free `*.pages.dev` address is sufficient for review and integration testing.

## Tech-team handover

Provide the new repository URL, Cloudflare project name/URL, latest successful collection run, latest successful deployment and intended navbar placement. Existing production settings should remain independent until this version is accepted.

The simplest later integration is a navbar link to the new page. Embedding or reverse-proxying it under a Languify path requires your team to confirm authentication, routing, asset paths and responsive layout. This package is public by design: no SSO, user database or server-side access control is included. Browser bookmarks use `languify-free-saved-jobs-v1` and do not sync with Languify accounts or the original board.

Keep the deploy-hook secret in GitHub Actions, not in code or this README. No Apify token should be copied into this project. Restrict Cloudflare GitHub access to the new repository. The workflow must be allowed to write its snapshot; if branch rules forbid that, your tech team should implement an approved publication branch/process.

## Troubleshooting and acceptance

- **No workflow shown:** confirm `.github/workflows/update-jobs.yml` exists on the repository’s default branch.
- **Git push denied:** check repository/organisation Actions permissions and branch rules; do not change the original repo.
- **Deploy hook missing/rejected:** verify the repository secret name and regenerate the hook in this new Pages project if necessary. Never paste the secret into support screenshots.
- **Green GitHub run, old website:** check Cloudflare’s build/deployment result and branch. A deploy-hook response is only an accepted request.
- **Red source in the collection log:** validate that employer’s board token/API; the job snapshot includes its error and last success time. All sources failing is a failed run.
- **Zero jobs under a filter:** that employer selection may have no matching jobs; publication date filters omit undated jobs. Use Any time/Reset all to check total coverage.
- **Old timestamp:** run the workflow manually and inspect both GitHub and Cloudflare. Public-repository schedules can be disabled after 60 days of repository inactivity; GitHub schedules can also be delayed.
- **Company initials instead of logos:** expected unless a valid optional logo URL is configured.

Before integrating, confirm the new URL loads on desktop/mobile, search and Reset all work, Saved jobs persists on the same browser, View job opens the correct employer role, the details drawer works, and a manual collection changes the published timestamp after a successful Cloudflare deployment.

## Official references

- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board)
- [Lever Postings API](https://github.com/lever/postings-api)
- [Cloudflare: static Next.js export on Pages](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/)
- [Cloudflare deploy hooks](https://developers.cloudflare.com/pages/configuration/deploy-hooks/)
- [Cloudflare GitHub integration](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Cloudflare static request pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitHub scheduled workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

References checked while preparing this package on 27 October 2026. Provider screens, plan limits and feed schemas can change.
