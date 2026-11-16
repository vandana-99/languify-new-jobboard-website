import { readFile, writeFile, rename } from 'node:fs/promises';
import { collectFeed } from './feed.mjs';
import { mergeBoardResults } from './job-boards.mjs';

const config = JSON.parse(await readFile(new URL('../config/sources.json', import.meta.url), 'utf8'));
const target = new URL('../public/jobs.json', import.meta.url);
let previous = null;
try { previous = JSON.parse(await readFile(target, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const employerFeed = await collectFeed(config, previous);
const boardConfig = JSON.parse(await readFile(new URL('../config/job-boards.json', import.meta.url), 'utf8'));
let boardResults = null;
try { boardResults = JSON.parse(await readFile(new URL('../.job-board-results.json', import.meta.url), 'utf8')); }
catch (error) { console.warn('No usable platform collection was found. Recent previous platform jobs will be retained.'); }
const feed = mergeBoardResults(employerFeed, previous, boardConfig, boardResults);
const temporary = new URL('../public/jobs.json.tmp', import.meta.url);
await writeFile(temporary, JSON.stringify(feed, null, 2) + '\n');
await rename(temporary, target);
for (const source of feed.sources) console.log(`${source.company}: ${source.status}, ${source.published} matching jobs${source.error ? ' — ' + source.error : ''}`);
console.log(`Saved ${feed.jobs.length} jobs. Checked ${feed.fetchedAt}.`);
if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY,
  `## Job collection\n\nChecked: ${feed.fetchedAt}\n\n${feed.jobs.length} jobs; ${feed.sources.filter(s => s.status === 'ok').length}/${feed.sources.length} source checks succeeded.\n\n${feed.message || 'All configured sources responded.'}\n\n| Source | Search / employer | Status | Jobs |\n| --- | --- | --- | --- |\n${feed.sources.map(s => `| ${s.provider} | ${s.company} | ${s.status} | ${s.published} |`).join('\n')}\n\nCollection is separate from deployment. Check the Cloudflare deployment status before treating this update as published.\n`, { flag: 'a' });
