import { z } from "zod";
import {
  USER_AGENT,
  stripHtml,
  type Rejected,
  type SearchOptions,
  type SearchResult,
} from "./candidate.js";
import { checkLicence } from "./licence.js";

const API = "https://commons.wikimedia.org/w/api.php";

const Meta = z.object({ value: z.union([z.string(), z.number()]).transform(String) }).optional();

const CommonsResponse = z.object({
  query: z
    .object({
      pages: z.record(
        z.object({
          pageid: z.number(),
          title: z.string(),
          imageinfo: z
            .array(
              z.object({
                url: z.string().url(),
                descriptionurl: z.string().url(),
                mime: z.string(),
                size: z.number().optional(),
                duration: z.number().optional(),
                extmetadata: z
                  .object({
                    LicenseShortName: Meta,
                    LicenseUrl: Meta,
                    Artist: Meta,
                    Credit: Meta,
                    ObjectName: Meta,
                  })
                  .partial()
                  .default({}),
              }),
            )
            .optional(),
        }),
      ),
    })
    .optional(),
});

/** Searches File: pages that are videos, with licence metadata from the file's own page. */
export async function searchCommons(query: string, opts: SearchOptions): Promise<SearchResult> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: `${query} filetype:video`,
    gsrlimit: String(opts.limit),
    prop: "imageinfo",
    iiprop: "url|mime|size|extmetadata",
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Credit|ObjectName",
  });
  const res = await (opts.fetch ?? fetch)(`${API}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`Wikimedia Commons search failed (HTTP ${res.status})`);
  const body = CommonsResponse.parse(await res.json());
  const result: SearchResult = { candidates: [], rejected: [] };
  for (const page of Object.values(body.query?.pages ?? {})) {
    const info = page.imageinfo?.[0];
    const title =
      stripHtml(info?.extmetadata.ObjectName?.value ?? "") || page.title.replace(/^File:/, "");
    const reject = (reason: string) =>
      result.rejected.push({
        source: "commons",
        id: String(page.pageid),
        title,
        reason,
      } satisfies Rejected);
    if (!info) {
      reject("No file information");
      continue;
    }
    if (!info.mime.startsWith("video/")) {
      reject(`Not a video (${info.mime})`);
      continue;
    }
    const check = checkLicence({
      ...(info.extmetadata.LicenseShortName
        ? { name: info.extmetadata.LicenseShortName.value }
        : {}),
      ...(info.extmetadata.LicenseUrl ? { url: info.extmetadata.LicenseUrl.value } : {}),
    });
    if (!check.ok) {
      reject(check.reason);
      continue;
    }
    const author =
      stripHtml(info.extmetadata.Artist?.value ?? "") ||
      stripHtml(info.extmetadata.Credit?.value ?? "");
    if (!author && check.licence.id !== "CC0" && check.licence.id !== "PD") {
      reject("No author stated, so it cannot be attributed");
      continue;
    }
    result.candidates.push({
      source: "commons",
      id: String(page.pageid),
      title,
      author: author || "Unknown author",
      pageUrl: info.descriptionurl,
      downloadUrl: info.url,
      mime: info.mime,
      ...(info.size !== undefined ? { sizeBytes: info.size } : {}),
      ...(info.duration !== undefined ? { durationS: info.duration } : {}),
      licence: check.licence,
    });
  }
  return result;
}
