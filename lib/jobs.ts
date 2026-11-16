export const ROLES = ["Product", "Consulting", "Growth", "Marketing", "Business", "Design"] as const;
export type Role = (typeof ROLES)[number];
export const STALE_AFTER_HOURS = 26;
export const RETAIN_FOR_HOURS = 72;
export type Job = {
  id: string; title: string; company: string; companyLogo: string | null;
  location: string; workMode: string; employmentType: string; experience: string;
  role: Role; salary: string | null; description: string; skills: string[];
  postedAt: string | null; firstSeenAt: string; verifiedAt: string;
  url: string; listingUrl: string; source: string; sourceId: string; demo: false;
};
export type SourceStatus = {
  id: string; company: string; provider: "greenhouse" | "lever";
  status: "ok" | "error"; checkedAt: string; lastSuccessAt: string | null;
  total: number; matches: number; published: number; truncated: boolean; error: string | null;
};
export type JobFeed = {
  schemaVersion: 1; jobs: Job[]; mode: "live" | "error" | "unconfigured";
  fetchedAt: string; sourceUpdatedAt: string | null; stale: boolean;
  truncated: boolean; message: string | null; sources: SourceStatus[];
  limitPerSource: number;
};

export function safeUrl(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 2500) return null;
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || !host.includes(".")
      || host.endsWith(".local") || host.endsWith(".localhost") || host.includes(":")
      || /^(0\.|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return null;
    return url.toString();
  } catch { return null; }
}

export function absoluteDate(input: unknown): string | null {
  if (typeof input !== "string" && typeof input !== "number") return null;
  if (typeof input === "string" && !/^\d{4}-\d{2}-\d{2}T/.test(input)) return null;
  const value = typeof input === "number" ? input : Date.parse(input);
  return Number.isFinite(value) && value >= 946684800000 && value < 4102444800000 ? new Date(value).toISOString() : null;
}

// Greenhouse descriptions contain encoded HTML. Decode before stripping markup,
// then render the result as React text; never use dangerouslySetInnerHTML.
export function plainText(value: unknown, limit = 12000): string {
  if (typeof value !== "string") return "";
  let text = value.slice(0, 150000);
  for (let i = 0; i < 2; i++) text = text.replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, key: string) =>
    ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[key.toLowerCase()] ?? " ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, key: string) => {
      const point = key[0].toLowerCase() === "x" ? parseInt(key.slice(1), 16) : Number(key);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    });
  return text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, limit);
}

export function isJobStale(job: Job, now: number) {
  return now - Date.parse(job.verifiedAt) > STALE_AFTER_HOURS * 3600000;
}
export function isJobRetained(job: Job, now: number) {
  return now - Date.parse(job.verifiedAt) <= RETAIN_FOR_HOURS * 3600000;
}
export function isFeedStale(feed: JobFeed, now: number) {
  return feed.stale || !feed.sourceUpdatedAt || now - Date.parse(feed.sourceUpdatedAt) > STALE_AFTER_HOURS * 3600000;
}

export function parseFeed(value: unknown): JobFeed {
  if (!value || typeof value !== "object") throw new Error("Invalid job feed");
  const feed = value as JobFeed;
  if (feed.schemaVersion !== 1 || !["live", "error", "unconfigured"].includes(feed.mode)
    || !Array.isArray(feed.jobs) || feed.jobs.length > 5000 || !Array.isArray(feed.sources)
    || !absoluteDate(feed.fetchedAt) || (feed.sourceUpdatedAt !== null && !absoluteDate(feed.sourceUpdatedAt))
    || typeof feed.stale !== "boolean" || typeof feed.truncated !== "boolean"
    || (feed.message !== null && typeof feed.message !== "string")
    || !Number.isInteger(feed.limitPerSource) || feed.limitPerSource < 1 || feed.limitPerSource > 100) throw new Error("Invalid feed metadata");
  const ids = new Set<string>();
  for (const job of feed.jobs) {
    if (!job || typeof job !== "object" || job.demo !== false
      || ![job.id, job.title, job.company, job.location, job.workMode, job.employmentType, job.experience, job.description, job.source, job.sourceId].every(x => typeof x === "string" && x.length > 0)
      || !ROLES.includes(job.role) || !safeUrl(job.listingUrl) || !safeUrl(job.url)
      || (job.companyLogo !== null && !safeUrl(job.companyLogo))
      || (job.salary !== null && typeof job.salary !== "string")
      || !absoluteDate(job.verifiedAt) || !absoluteDate(job.firstSeenAt)
      || (job.postedAt !== null && !absoluteDate(job.postedAt))
      || !Array.isArray(job.skills) || !job.skills.every(x => typeof x === "string") || ids.has(job.id)) throw new Error("Invalid job record");
    ids.add(job.id);
  }
  const sourceIds = new Set<string>();
  for (const source of feed.sources) {
    if (!source || !["ok", "error"].includes(source.status) || !["greenhouse", "lever"].includes(source.provider)
      || !source.id || sourceIds.has(source.id) || typeof source.company !== "string" || !absoluteDate(source.checkedAt)
      || (source.lastSuccessAt !== null && !absoluteDate(source.lastSuccessAt))
      || ![source.total, source.matches, source.published].every(n => Number.isInteger(n) && n >= 0)
      || typeof source.truncated !== "boolean" || (source.error !== null && typeof source.error !== "string")) throw new Error("Invalid source status");
    sourceIds.add(source.id);
  }
  if (feed.jobs.some(job => !sourceIds.has(job.sourceId))) throw new Error("Job has no source status");
  return feed;
}

export type JobFilters = { query: string; location: string; roles: string[]; modes: string[]; levels: string[]; types: string[]; posted: string };
export const EMPTY_FILTERS: JobFilters = { query: "", location: "", roles: [], modes: [], levels: [], types: [], posted: "any" };
export function filterJobs(jobs: Job[], filters: JobFilters, now: number): Job[] {
  const query = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const location = filters.location.trim().toLowerCase();
  const cutoff = filters.posted === "any" ? 0 : now - Number(filters.posted) * 86400000;
  return jobs.filter(job => {
    const text = [job.title, job.company, job.role, ...job.skills].join(" ").toLowerCase();
    return isJobRetained(job, now) && query.every(word => text.includes(word))
      && (!location || `${job.location} ${job.workMode}`.toLowerCase().includes(location))
      && (!filters.roles.length || filters.roles.includes(job.role)) && (!filters.modes.length || filters.modes.includes(job.workMode))
      && (!filters.levels.length || filters.levels.includes(job.experience)) && (!filters.types.length || filters.types.includes(job.employmentType))
      && (!cutoff || !!job.postedAt && Date.parse(job.postedAt) >= cutoff && Date.parse(job.postedAt) <= now);
  });
}
export function relativeDate(date: string | null, now: number): string {
  if (!date) return "Date not listed";
  const days = Math.floor(Math.max(0, now - Date.parse(date)) / 86400000);
  return days === 0 ? "Today" : days === 1 ? "1 day ago" : `${days} days ago`;
}
