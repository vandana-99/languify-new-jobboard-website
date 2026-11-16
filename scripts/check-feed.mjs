import { readFile } from 'node:fs/promises';
import { parseFeed } from '../lib/jobs.ts';

const feed = parseFeed(JSON.parse(await readFile(new URL('../public/jobs.json', import.meta.url), 'utf8')));
if (process.argv.includes('--require-success') && !feed.sources.some(s => s.status === 'ok')) throw new Error('No employer feeds succeeded. Inspect the collection summary; older data was retained only within the retention window.');
console.log(`Feed valid: ${feed.jobs.length} jobs, ${feed.sources.length} sources.`);
