import { readFile, writeFile, rename } from 'node:fs/promises';
import { collectFeed } from './feed.mjs';

const config = JSON.parse(await readFile(new URL('../config/sources.json', import.meta.url), 'utf8'));
const target = new URL('../public/jobs.json', import.meta.url);
let previous = null;
try { previous = JSON.parse(await readFile(target, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const feed = await collectFeed(config, previous);
const temporary = new URL('../public/jobs.json.tmp', import.meta.url);
await writeFile(temporary, JSON.stringify(feed, null, 2) + '\n');
await rename(temporary, target);
for (const source of feed.sources) console.log(`${source.company}: ${source.status}, ${source.published} matching jobs${source.error ? ' — ' + source.error : ''}`);
console.log(`Saved ${feed.jobs.length} jobs. Checked ${feed.fetchedAt}.`);
if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY,
  `## Public employer job collection\n\nChecked: ${feed.fetchedAt}\n\n${feed.jobs.length} jobs; ${feed.sources.filter(s => s.status === 'ok').length}/${feed.sources.length} feeds succeeded.\n\n${feed.message || 'All configured feeds responded.'}\n\nCollection is separate from deployment. Check the Cloudflare deployment status before treating this update as published.\n`, { flag: 'a' });
