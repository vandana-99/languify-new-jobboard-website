import test from 'node:test';
import assert from 'node:assert/strict';
import { collectFeed, classifyRole, normalizePosting, fetchPostings, validateConfig } from '../scripts/feed.mjs';
import { parseFeed, plainText, safeUrl, isFeedStale, isJobRetained, filterJobs, EMPTY_FILTERS } from '../lib/jobs.ts';

const NOW = '2026-10-27T04:17:00.000Z';
const source = { provider: 'greenhouse', board: 'test-employer', company: 'Test Employer' };
const config = { limitPerSource: 40, sources: [source] };
const posting = (overrides = {}) => ({ id: 1, title: 'Product Manager', location: { name: 'Bengaluru, India' },
  absolute_url: 'https://careers.example.com/jobs/1?gh_jid=1', first_published: '2026-10-20T10:00:00Z',
  updated_at: NOW, content: '&lt;p&gt;Build useful products.&lt;/p&gt;', ...overrides });
const response = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const ghFetch = rows => async () => response({ jobs: rows, meta: { total: rows.length } });
const outage = async () => new Response('Unavailable', { status: 503 });

test('requested categories and internships are included, sales and engineering are excluded', () => {
  const cases = { 'Product Manager': 'Product', 'Associate Product Manager': 'Product', 'Product Management Intern': 'Product',
    'Business Analyst Internship': 'Business', 'Strategy Consultant': 'Consulting', 'Consulting Intern': 'Consulting',
    'Growth Manager': 'Growth', 'Growth Intern': 'Growth', 'Product Marketing Manager': 'Marketing',
    'Marketing Intern': 'Marketing', 'Product Designer': 'Design', 'Director of Product Design': 'Design',
    'UX Design Intern': 'Design', 'Sales Consultant': null, 'Business Development Manager': null,
    'Account Executive': null, 'Product Software Engineer': null, 'Design Engineer': null };
  for (const [title, expected] of Object.entries(cases)) assert.equal(classifyRole(title), expected, title);
});

test('only explicit India locations qualify, including remote India', () => {
  assert.ok(normalizePosting(posting({ location: { name: 'Remote, India' } }), source, NOW));
  assert.equal(normalizePosting(posting({ location: { name: 'Indiana, US' } }), source, NOW), null);
  assert.equal(normalizePosting(posting({ location: { name: 'Remote, APAC' } }), source, NOW), null);
});

test('real publication dates and original URL query are preserved', () => {
  const job = normalizePosting(posting(), source, NOW);
  assert.equal(job.postedAt, '2026-10-20T10:00:00.000Z');
  assert.equal(job.listingUrl, posting().absolute_url);
  assert.equal(job.description, 'Build useful products.');
  assert.equal(normalizePosting(posting({ first_published: undefined }), source, NOW).postedAt, null);
});

test('Lever createdAt does not become a publication date, apply link is kept separately', () => {
  const job = normalizePosting({ id: 'abc', text: 'Business Analyst Intern', country: 'IN', categories: { location: 'Delhi', commitment: 'full time' },
    createdAt: Date.parse(NOW), workplaceType: 'hybrid', hostedUrl: 'https://jobs.lever.co/example/abc', applyUrl: 'https://jobs.lever.co/example/abc/apply' },
  { provider: 'lever', board: 'example', company: 'Example' }, NOW);
  assert.equal(job.postedAt, null);
  assert.equal(job.url, 'https://jobs.lever.co/example/abc/apply');
  assert.equal(job.employmentType, 'Internship');
  assert.equal(job.experience, 'Entry level');
});

test('first-seen time survives refresh; updated timestamp is never used as posted date', async () => {
  const previous = await collectFeed(config, null, { now: NOW, fetcher: ghFetch([posting()]) });
  const nextTime = '2026-10-27T16:17:00.000Z';
  const next = await collectFeed(config, previous, { now: nextTime, fetcher: ghFetch([posting({ updated_at: nextTime })]) });
  assert.equal(next.jobs[0].firstSeenAt, NOW);
  assert.equal(next.jobs[0].verifiedAt, nextTime);
  assert.equal(next.jobs[0].postedAt, previous.jobs[0].postedAt);
});

test('successful empty source removes jobs; failed source retains original timestamps', async () => {
  const previous = await collectFeed(config, null, { now: NOW, fetcher: ghFetch([posting()]) });
  const nextTime = '2026-10-27T16:17:00.000Z';
  const empty = await collectFeed(config, previous, { now: nextTime, fetcher: ghFetch([]) });
  assert.equal(empty.jobs.length, 0); assert.equal(empty.mode, 'live');
  const failed = await collectFeed(config, previous, { now: nextTime, fetcher: outage });
  assert.equal(failed.jobs.length, 1); assert.equal(failed.mode, 'error'); assert.equal(failed.stale, true);
  assert.equal(failed.jobs[0].verifiedAt, NOW); assert.equal(failed.sourceUpdatedAt, NOW);
});

test('failed sources expire after 72 hours, even when no new snapshot reaches the browser', async () => {
  const previous = await collectFeed(config, null, { now: NOW, fetcher: ghFetch([posting()]) });
  const later = '2026-10-30T04:18:00.000Z';
  const next = await collectFeed(config, previous, { now: later, fetcher: outage });
  assert.equal(next.jobs.length, 0);
  assert.equal(isJobRetained(previous.jobs[0], Date.parse(later)), false);
  assert.equal(filterJobs(previous.jobs, EMPTY_FILTERS, Date.parse(later)).length, 0);
  assert.equal(isFeedStale(previous, Date.parse(later)), true);
});

test('malformed or incomplete source response cannot silently clear earlier jobs', async () => {
  const previous = await collectFeed(config, null, { now: NOW, fetcher: ghFetch([posting()]) });
  const invalid = await collectFeed(config, previous, { now: NOW, fetcher: async () => response({ jobs: [], meta: { total: 10 } }) });
  assert.equal(invalid.jobs.length, 1); assert.equal(invalid.sources[0].status, 'error');
  assert.equal(invalid.jobs[0].verifiedAt, previous.jobs[0].verifiedAt);
});

test('a partial outage retains only the failing employer’s jobs', async () => {
  const two = { ...config, sources: [source, { ...source, board: 'another', company: 'Another' }] };
  const fetcher = async url => ghFetch([posting({ id: url.includes('/another/') ? 2 : 1, absolute_url: url.includes('/another/') ? 'https://careers.example.com/jobs/2' : posting().absolute_url })])();
  const previous = await collectFeed(two, null, { now: NOW, fetcher });
  const next = await collectFeed(two, previous, { now: '2026-10-27T16:17:00.000Z', fetcher: url => url.includes('/another/') ? outage() : ghFetch([])() });
  assert.equal(next.mode, 'live'); assert.equal(next.stale, true);
  assert.equal(next.jobs.length, 1); assert.equal(next.jobs[0].company, 'Another');
});

test('duplicates are removed before applying the per-source limit', async () => {
  const rows = [posting(), posting(), posting({ id: 2, absolute_url: 'https://careers.example.com/jobs/2', first_published: '2026-10-25T00:00:00Z' })];
  const feed = await collectFeed({ ...config, limitPerSource: 1 }, null, { now: NOW, fetcher: ghFetch(rows) });
  assert.equal(feed.jobs.length, 1); assert.equal(feed.jobs[0].id, 'greenhouse:test-employer:2');
  assert.equal(feed.sources[0].matches, 2); assert.equal(feed.truncated, true);
});

test('Lever pagination reads every page before treating a feed as complete', async () => {
  const calls = [];
  const rows = await fetchPostings({ provider: 'lever', board: 'example' }, async url => {
    const skip = Number(new URL(url).searchParams.get('skip')); calls.push(skip);
    return response(Array.from({ length: skip === 0 ? 100 : 1 }, (_, n) => ({ id: String(skip + n), text: 'Product Manager', hostedUrl: `https://jobs.lever.co/example/${skip + n}`, categories: {} })));
  });
  assert.deepEqual(calls, [0, 100]); assert.equal(rows.length, 101);
});

test('date filters exclude unknown dates, and older posted jobs remain under Any time', () => {
  const known = normalizePosting(posting({ first_published: '2026-08-01T00:00:00Z' }), source, NOW);
  const unknown = normalizePosting(posting({ first_published: undefined }), source, NOW);
  assert.equal(filterJobs([known, unknown], { ...EMPTY_FILTERS, posted: '30' }, Date.parse(NOW)).length, 0);
  assert.equal(filterJobs([known, unknown], EMPTY_FILTERS, Date.parse(NOW)).length, 2);
});

test('unsafe links, injected markup and broken snapshots are rejected', async () => {
  for (const value of ['javascript:alert(1)', 'http://example.com', 'https://127.0.0.1/x', 'https://user:password@example.com']) assert.equal(safeUrl(value), null);
  assert.equal(plainText('&lt;script&gt;bad()&lt;/script&gt;&lt;p&gt;Safe &amp; useful&lt;/p&gt;'), 'Safe & useful');
  const feed = await collectFeed(config, null, { now: NOW, fetcher: ghFetch([posting()]) });
  const broken = structuredClone(feed); broken.jobs[0].url = 'javascript:bad()';
  assert.throws(() => parseFeed(broken));
  assert.throws(() => validateConfig({ ...config, sources: [{ ...source, board: '../private' }] }));
});
