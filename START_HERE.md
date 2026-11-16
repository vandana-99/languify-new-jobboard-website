# Languify Jobs — separate free version

This folder is a new project. **Do not upload it into your existing `languify-jobboard-website-` repository.** Your Vercel website and Apify task remain separate.

The dashboard uses public employer job feeds. It does not need Apify, ChatGPT, Hermes, a paid scraping API or a database. It is prepared for Cloudflare Pages Free and two scheduled collections per day, within the services’ free allowances.

## 1. Create a new GitHub repository

Name it **`languify-jobs-free`**. You can use a private repository on GitHub Free; this workflow uses its included Actions allowance.

Extract this ZIP on your computer. Upload the **contents** of its project folder into the new repository, not the ZIP itself. `package.json`, `package-lock.json`, `app`, `components`, `config`, `lib`, `public`, `scripts` and `tests` must be at the repository’s top level.

Make sure this workflow also exists in GitHub:

`.github/workflows/update-jobs.yml`

If your upload does not include it, select **Add file → Create new file**, enter that exact path, paste the contents of the supplied `update-jobs.yml`, and commit it. Use `main` as the default branch.

## 2. Create a separate Cloudflare Pages project

In Cloudflare, open **Workers & Pages → Create application → Pages → Import an existing Git repository**. Connect only your new `languify-jobs-free` repository.

Use these settings:

| Setting | Value |
| --- | --- |
| Framework preset | Next.js (Static HTML Export) |
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `out` |
| Root directory | Leave blank |
| Build environment variable | `NODE_VERSION` = `22` |

Select the Free plan. Deploy and wait for a successful build. The new project receives its own `*.pages.dev` URL. This does not change your Vercel URL or Languify’s domain.

Do not copy any Apify environment variables into this project. The initial deployment uses the real job snapshot included in `public/jobs.json`; that snapshot becomes stale unless scheduled updates are enabled below.

## 3. Connect the update workflow to this new deployment

In your **new Cloudflare Pages project**, open **Settings → Builds → Add deploy hook**. Name it `Employer job updates` and select branch `main`.

Copy the generated deploy hook URL. Treat it as a secret; anyone with it can request a build.

In your **new GitHub repository**, open **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
| --- | --- |
| `CLOUDFLARE_DEPLOY_HOOK` | Paste the deploy hook URL from Cloudflare |

The workflow already requests `contents: write`. If your organization blocks workflow writes or protects `main`, ask your tech team to configure a permitted publication workflow. Do not change the existing job board’s settings.

## 4. Run one update and verify it

In the new repository, open **Actions → Update employer jobs → Run workflow → Run workflow**.

Check all three places:

1. **GitHub Actions:** the collection step lists each employer and its result; the workflow finishes successfully.
2. **Cloudflare Pages → Deployments:** the new build triggered by the deploy hook finishes successfully. A green GitHub run confirms the request was accepted, not that the Cloudflare build has finished.
3. **Your new `*.pages.dev` page:** the “Last successful check” time changes. Click **View job** on a card; it opens that employer’s actual listing in a new tab.

If a step fails, open that step’s log. Do not share the deploy hook URL or other account secrets.

## 5. Updates after setup

The supplied workflow is scheduled for approximately **9:47 AM and 9:47 PM India time** (04:17 and 16:17 UTC). GitHub may delay scheduled runs; this is not a real-time guarantee. A successful collection must also finish deploying before visitors see it.

An open dashboard checks its published `jobs.json` every minute. **Refresh** reloads that published collection; it does not start an employer fetch. To collect immediately, run the GitHub workflow manually.

The dashboard flags overdue data after 26 hours. A temporarily failing employer can retain previously checked listings for up to 72 hours; older listings are hidden. Jobs absent from a successful employer feed are removed on the next deployed update.

## 6. Keep both versions separate

- Existing version: your original GitHub repository, Vercel website and Apify scraping.
- New version: `languify-jobs-free`, Cloudflare Pages and the employer-feed workflow.

Review the new version before asking your tech team to integrate its URL under **Shortlisting Genie → Job Board**. No navbar, domain, DNS or existing deployment changes are included in this package.

For data coverage, configuration, limitations and technical handover, read `README.md`.
