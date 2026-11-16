import { absoluteDate, plainText, safeUrl, parseFeed, isJobRetained } from '../lib/jobs.ts';

export const INDIA = /\bindia\b|\bbengaluru\b|\bbangalore\b|\bmumbai\b|\bhyderabad\b|\bpune\b|\bgurugram\b|\bgurgaon\b|\bnoida\b|\bchennai\b|\bdelhi\b|\bkolkata\b|\bahmedabad\b|\bjaipur\b|\bkochi\b|\bcoimbatore\b|\bchandigarh\b|\bindore\b/i;
const SALES = /\bsales\b|\bpre[- ]?sales\b|business development|account (executive|manager)|\b[bs]dr\b|customer success|recruit|talent acquisition/i;

export function classifyRole(title, department = '') {
  if (SALES.test(title)) return null;
  const text = /^(intern|internship|graduate|associate)\s*$/i.test(title.trim()) ? `${title} ${department}` : title;
  if (/\bdesigner\b|\bdesign\b|\b(ux|ui|user experience|user research)\b/i.test(text) && !/engineer|developer/i.test(text)) return 'Design';
  if (/marketing|\bbrand\b|\bseo\b|\bsem\b|copywriter|content (strateg|writ|creat)|communications?/i.test(text)) return 'Marketing';
  if (/\bgrowth\b|user acquisition/i.test(text)) return 'Growth';
  if (/\bproduct\b/i.test(text) && /manag|owner|lead|director|head|analyst|strategy|operation|intern|associate/i.test(text) && !/engineer|developer/i.test(text)) return 'Product';
  if (/consult|advisory/i.test(text)) return 'Consulting';
  if (/business.*analyst|analyst.*business|strategy|business operations|operations.*analyst|data analyst|business.*intern/i.test(text)) return 'Business';
  return null;
}

export function validateConfig(config) {
  if (!config || !Number.isInteger(config.limitPerSource) || config.limitPerSource < 1 || config.limitPerSource > 100
    || !Array.isArray(config.sources) || config.sources.length < 1 || config.sources.length > 30) throw new Error('Use 1–30 sources and a limitPerSource from 1–100.');
  const ids = new Set();
  for (const source of config.sources) {
    const id = `${source.provider}:${source.board}`;
    if (!['greenhouse', 'lever'].includes(source.provider) || !/^[a-z0-9_-]{1,100}$/.test(source.board)
      || typeof source.company !== 'string' || !source.company.trim() || source.company.length > 100
      || source.logo && !safeUrl(source.logo) || ids.has(id)) throw new Error('Invalid or duplicate employer source.');
    ids.add(id);
  }
  return config;
}

export function employmentType(title, value) {
  if (/intern/i.test(title + ' ' + value)) return 'Internship';
  if (/part[ -]?time/i.test(value)) return 'Part-time';
  if (/contract|freelance|temporary/i.test(value)) return 'Contract';
  if (/full[ -]?time/i.test(value)) return 'Full-time';
  return 'Not specified';
}

export function normalizePosting(row, source, now, previousJob) {
  const greenhouse = source.provider === 'greenhouse';
  const title = plainText(greenhouse ? row.title : row.text, 240);
  const location = plainText(greenhouse ? row.location?.name : [row.categories?.location, ...(row.categories?.allLocations || [])].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · '), 300);
  const department = greenhouse ? row.departments?.map(d => d.name).join(' ') : row.categories?.department;
  const role = classifyRole(title, department);
  if (!role || !(row.country === 'IN' || INDIA.test(location))) return null;
  const listingUrl = safeUrl(greenhouse ? row.absolute_url : row.hostedUrl);
  const url = greenhouse ? listingUrl : safeUrl(row.applyUrl) || listingUrl;
  if (!title || !listingUrl || !url || row.id === undefined) throw new Error('An eligible job is missing its title, ID or HTTPS listing link.');
  const deadline = typeof row.application_deadline === 'string' && /^\d{4}-\d{2}-\d{2}/.test(row.application_deadline)
    ? Date.parse(row.application_deadline.length === 10 ? row.application_deadline + 'T23:59:59Z' : row.application_deadline) : null;
  if (deadline && deadline < Date.parse(now)) return null;
  const rawMode = (greenhouse ? '' : row.workplaceType) || location;
  const workMode = /hybrid/i.test(rawMode) ? 'Hybrid' : /remote/i.test(rawMode) ? 'Remote' : /on.?site/i.test(rawMode) ? 'On-site' : 'Not specified';
  const metadata = greenhouse && Array.isArray(row.metadata) ? row.metadata : [];
  const typeValue = greenhouse ? metadata.find(m => /employment type|job type/i.test(m.name))?.value : row.categories?.commitment;
  const type = employmentType(title, plainText(typeValue, 100));
  // Titles are a useful approximation, not verified years of experience.
  const experience = type === 'Internship' || /\bintern|\bjunior|\bgraduate|\bentry|associate product manager/i.test(title) ? 'Entry level'
    : /\bsenior|\bsr\.?\b|\blead\b|\bhead\b|\bdirector|\bprincipal|\bstaff\b|\bvp\b/i.test(title) ? 'Senior level' : 'Not specified';
  // Greenhouse first_published is a publication date. updated_at and Lever
  // createdAt are not reliable publication dates, so never label them as such.
  const published = greenhouse ? absoluteDate(row.first_published) : null;
  const postedAt = published && Date.parse(published) <= Date.parse(now) ? published : null;
  const description = plainText(greenhouse ? row.content : [row.openingPlain, row.descriptionPlain || row.description, row.descriptionBodyPlain,
    ...(Array.isArray(row.lists) ? row.lists.flatMap(x => [x.text, x.content]) : []), row.additionalPlain].filter(Boolean).join('\n\n'))
    || 'See the employer’s original posting for the full role description and requirements.';
  return {
    id: `${source.provider}:${source.board}:${row.id}`, title, company: source.company, companyLogo: safeUrl(source.logo),
    location: location || 'India', role, workMode, employmentType: type, experience,
    salary: null, description, skills: [], postedAt,
    firstSeenAt: previousJob?.firstSeenAt || now, verifiedAt: now,
    url, listingUrl, source: greenhouse ? 'Greenhouse' : 'Lever', sourceId: `${source.provider}:${source.board}`, demo: false,
  };
}

async function readJson(url, fetcher) {
  const response = await fetcher(url, { headers: { Accept: 'application/json', 'User-Agent': 'LanguifyJobs/1.0 (public job feeds)' }, redirect: 'error', signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Employer feed returned HTTP ${response.status}.`);
  if (!response.body) throw new Error('Empty response body.');
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32 * 1024 * 1024) throw new Error('Employer response exceeded the 32 MB safety limit.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Employer response was not valid JSON.'); }
}

export async function fetchPostings(source, fetcher = fetch) {
  if (source.provider === 'greenhouse') {
    const data = await readJson(`https://boards-api.greenhouse.io/v1/boards/${source.board}/jobs?content=true`, fetcher);
    if (!Array.isArray(data?.jobs) || data.jobs.length > 10000
      || data.meta?.total !== undefined && data.meta.total !== data.jobs.length
      || data.jobs.some(j => !j || j.id === undefined || typeof j.title !== 'string' || typeof j.absolute_url !== 'string' || typeof j.location?.name !== 'string')) throw new Error('Incomplete or changed Greenhouse feed; previous jobs retained.');
    return data.jobs;
  }
  const output = []; const seen = new Set();
  for (let skip = 0; skip < 10000; skip += 100) {
    const data = await readJson(`https://api.lever.co/v0/postings/${source.board}?mode=json&limit=100&skip=${skip}`, fetcher);
    if (!Array.isArray(data) || data.length > 100 || data.some(j => !j || !j.id || typeof j.text !== 'string' || typeof j.hostedUrl !== 'string' || !j.categories)) throw new Error('Incomplete or changed Lever feed; previous jobs retained.');
    for (const row of data) {
      if (seen.has(row.id)) throw new Error('Lever pagination repeated a job; previous jobs retained.');
      seen.add(row.id); output.push(row);
    }
    if (data.length < 100) return output;
  }
  throw new Error('Lever pagination limit reached; previous jobs retained.');
}

export async function collectFeed(config, previous = null, options = {}) {
  validateConfig(config);
  if (previous) parseFeed(previous);
  const now = options.now || new Date().toISOString();
  const fetcher = options.fetcher || fetch;
  const previousJobs = new Map((previous?.jobs || []).map(j => [j.id, j]));
  const results = new Array(config.sources.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, config.sources.length) }, async () => {
    while (cursor < config.sources.length) {
      const index = cursor++; const source = config.sources[index]; const id = `${source.provider}:${source.board}`;
      const oldStatus = previous?.sources.find(s => s.id === id);
      try {
        const rows = await fetchPostings(source, fetcher);
        const unique = new Map();
        for (const row of rows) {
          const job = normalizePosting(row, source, now, previousJobs.get(`${id}:${row.id}`));
          if (job && !unique.has(job.listingUrl)) unique.set(job.listingUrl, job);
        }
        const matches = [...unique.values()].sort((a, b) => (b.postedAt ? Date.parse(b.postedAt) : 0) - (a.postedAt ? Date.parse(a.postedAt) : 0) || a.id.localeCompare(b.id));
        const jobs = matches.slice(0, config.limitPerSource);
        results[index] = { jobs, status: { id, company: source.company, provider: source.provider, status: 'ok', checkedAt: now, lastSuccessAt: now,
          total: rows.length, matches: matches.length, published: jobs.length, truncated: matches.length > config.limitPerSource, error: null } };
      } catch (error) {
        const jobs = (previous?.jobs || []).filter(j => j.sourceId === id && isJobRetained(j, Date.parse(now))).slice(0, config.limitPerSource);
        // Errors contain no request URLs, authentication headers or response bodies.
        const message = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'Employer feed timed out.'
          : /^Employer |^Incomplete |^Lever |^An eligible |^Empty response/.test(error?.message) ? error.message : 'Could not read employer feed.';
        results[index] = { jobs, status: { id, company: source.company, provider: source.provider, status: 'error', checkedAt: now, lastSuccessAt: oldStatus?.lastSuccessAt || null,
          total: oldStatus?.total || 0, matches: oldStatus?.matches || 0, published: jobs.length, truncated: oldStatus?.truncated || false, error: message } };
      }
    }
  }));
  const seen = new Set();
  const jobs = results.flatMap(result => result.jobs).filter(job => {
    if (seen.has(job.listingUrl)) return false;
    seen.add(job.listingUrl); return true;
  }).sort((a, b) => Date.parse(b.firstSeenAt) - Date.parse(a.firstSeenAt) || (b.postedAt ? Date.parse(b.postedAt) : 0) - (a.postedAt ? Date.parse(a.postedAt) : 0) || a.id.localeCompare(b.id));
  const sources = results.map(result => result.status);
  for (const source of sources) source.published = jobs.filter(j => j.sourceId === source.id).length;
  const failed = sources.filter(s => s.status === 'error').length;
  const successfulDates = sources.map(s => s.lastSuccessAt).filter(Boolean).sort();
  return parseFeed({ schemaVersion: 1, jobs, mode: failed === sources.length ? 'error' : 'live', fetchedAt: now,
    sourceUpdatedAt: successfulDates.at(-1) || null, stale: failed > 0, truncated: sources.some(s => s.truncated),
    message: failed ? `${failed} employer feed${failed === 1 ? ' is' : 's are'} unavailable. Previously checked jobs are kept for up to 3 days.` : null,
    sources, limitPerSource: config.limitPerSource });
}
