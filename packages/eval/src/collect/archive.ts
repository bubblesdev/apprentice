import { z } from "zod";
import { USER_AGENT, type SearchOptions, type SearchResult } from "./candidate.js";
import { checkLicence } from "./licence.js";

const BASE = "https://archive.org";

const stringish = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v.join(", ") : v));

const SearchResponse = z.object({
  response: z.object({
    docs: z.array(
      z.object({
        identifier: z.string().min(1),
        title: stringish.optional(),
        creator: stringish.optional(),
        licenseurl: stringish.optional(),
      }),
    ),
  }),
});

/** Internet Archive file lengths come as seconds ("642.44") or clock time ("10:41", "1:02:03"). */
export function parseDuration(raw: unknown): number | undefined {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? raw : undefined;
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const parts = raw.trim().split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n) || n < 0) || parts.length > 3) return undefined;
  return parts.reduce((total, n) => total * 60 + n, 0);
}

const duration = z.unknown().transform(parseDuration);

const MetadataResponse = z.object({
  files: z
    .array(
      z.object({
        name: z.string(),
        format: z.string().optional(),
        size: z.coerce.number().optional(),
        length: duration,
      }),
    )
    .default([]),
});

const VIDEO_FORMATS: Record<string, string> = {
  "h.264": "video/mp4",
  "h.264 ia": "video/mp4",
  mpeg4: "video/mp4",
  "512kb mpeg4": "video/mp4",
  webm: "video/webm",
  ogg: "video/ogg",
  "ogg video": "video/ogg",
};

/**
 * Searches Internet Archive movies that state a licence URL, then picks one playable file per
 * item: the smallest MP4, WebM or Ogg video, since frames are taken at 360p anyway.
 */
export async function searchArchive(query: string, opts: SearchOptions): Promise<SearchResult> {
  const doFetch = opts.fetch ?? fetch;
  const headers = { "User-Agent": USER_AGENT };
  const params = new URLSearchParams({
    q: `(${query}) AND mediatype:movies AND licenseurl:*`,
    rows: String(opts.limit),
    output: "json",
  });
  for (const f of ["identifier", "title", "creator", "licenseurl"]) params.append("fl[]", f);
  const res = await doFetch(`${BASE}/advancedsearch.php?${params}`, { headers });
  if (!res.ok) throw new Error(`Internet Archive search failed (HTTP ${res.status})`);
  const docs = SearchResponse.parse(await res.json()).response.docs;

  const result: SearchResult = { candidates: [], rejected: [] };
  for (const doc of docs) {
    const title = doc.title ?? doc.identifier;
    const reject = (reason: string) =>
      result.rejected.push({ source: "archive", id: doc.identifier, title, reason });
    const check = checkLicence(doc.licenseurl ? { url: doc.licenseurl } : {});
    if (!check.ok) {
      reject(check.reason);
      continue;
    }
    if (!doc.creator && check.licence.id !== "CC0" && check.licence.id !== "PD") {
      reject("No creator stated, so it cannot be attributed");
      continue;
    }
    const meta = await doFetch(`${BASE}/metadata/${encodeURIComponent(doc.identifier)}`, {
      headers,
    });
    if (!meta.ok) {
      reject(`Metadata unavailable (HTTP ${meta.status})`);
      continue;
    }
    const file = MetadataResponse.parse(await meta.json())
      .files.map((f) => ({ ...f, mime: VIDEO_FORMATS[f.format?.toLowerCase() ?? ""] }))
      .filter((f): f is typeof f & { mime: string } => f.mime !== undefined)
      .sort((a, b) => (a.size ?? Infinity) - (b.size ?? Infinity))[0];
    if (!file) {
      reject("No MP4, WebM or Ogg video file");
      continue;
    }
    result.candidates.push({
      source: "archive",
      id: doc.identifier,
      title,
      author: doc.creator ?? "Unknown author",
      pageUrl: `${BASE}/details/${encodeURIComponent(doc.identifier)}`,
      downloadUrl: `${BASE}/download/${encodeURIComponent(doc.identifier)}/${file.name.split("/").map(encodeURIComponent).join("/")}`,
      mime: file.mime,
      ...(file.size !== undefined ? { sizeBytes: file.size } : {}),
      ...(file.length !== undefined ? { durationS: file.length } : {}),
      licence: check.licence,
    });
  }
  return result;
}
