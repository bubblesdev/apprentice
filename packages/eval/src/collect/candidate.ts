import { z } from "zod";
import { Licence, licenceLabel } from "./licence.js";

export const VideoSource = z.enum(["commons", "archive"]);
export type VideoSource = z.infer<typeof VideoSource>;

/** A video found by a search, with what its source says about who made it and its licence. */
export const Candidate = z.object({
  source: VideoSource,
  id: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1),
  /** The human page that states the licence. */
  pageUrl: z.string().url(),
  downloadUrl: z.string().url(),
  mime: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().optional(),
  durationS: z.number().nonnegative().optional(),
  licence: Licence,
});
export type Candidate = z.infer<typeof Candidate>;

/** A search hit that was turned away, and why, so a dry run can show what was left out. */
export interface Rejected {
  source: VideoSource;
  id: string;
  title: string;
  reason: string;
}

export interface SearchResult {
  candidates: Candidate[];
  rejected: Rejected[];
}

export interface SearchOptions {
  limit: number;
  fetch?: typeof fetch;
}

const SOURCE_NAMES: Record<VideoSource, string> = {
  commons: "Wikimedia Commons",
  archive: "Internet Archive",
};

/** TASL attribution: title, author, source, licence, with links. */
export function attribution(
  c: Pick<Candidate, "title" | "author" | "pageUrl" | "licence" | "source">,
): string {
  const deed = c.licence.url ? ` (${c.licence.url})` : "";
  return `"${c.title}" by ${c.author}, ${licenceLabel(c.licence)}${deed}, via ${SOURCE_NAMES[c.source]}: ${c.pageUrl}`;
}

/** Commons and Archive ask clients to identify themselves. */
export const USER_AGENT = "Apprentice-eval/0.1 (https://github.com/bubblesdev/apprentice)";

export const stripHtml = (html: string): string =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
