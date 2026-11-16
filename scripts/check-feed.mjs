import { readFile } from 'node:fs/promises';
import { parseFeed } from '../lib/jobs.ts';

const feed = parseFeed(JSON.parse(await readFile(new URL('../public/jobs.json', import.meta.url), 'utf8')));
if (process.argv.includes('--require-success') && !feed.sources.some(s => s.status === 'ok')) throw new Error('No job sources succeeded. Inspect the collection summary; older data was retained only within the retention window.');
if (process.argv.includes('--require-platforms')) {
  for (const provider of ['linkedin', 'naukri']) {
    if (!feed.sources.some(s => s.provider === provider && s.status === 'ok')) throw new Error(`${provider} has no successful search. Other available jobs were kept; inspect the collection summary.`);
  }
}
console.log(`Feed valid: ${feed.jobs.length} jobs, ${feed.sources.length} sources.`);
