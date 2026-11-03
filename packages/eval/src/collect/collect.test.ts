import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseDuration, searchArchive } from "./archive.js";
import { attribution, type Candidate } from "./candidate.js";
import { attributionMarkdown, collect, readManifest } from "./collect.js";
import { searchCommons } from "./commons.js";
import { checkLicence } from "./licence.js";

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

function routes(table: Record<string, () => Response>): typeof fetch & { calls: string[] } {
  const calls: string[] = [];
  const f = async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    const hit = Object.entries(table).find(([prefix]) => url.startsWith(prefix));
    return hit ? hit[1]() : new Response("not found", { status: 404 });
  };
  return Object.assign(f, { calls }) as typeof fetch & { calls: string[] };
}

describe("checkLicence", () => {
  it.each([
    [{ name: "CC BY-SA 4.0" }, "CC BY-SA", "https://creativecommons.org/licenses/by-sa/4.0/"],
    [{ name: "CC BY 3.0" }, "CC BY", "https://creativecommons.org/licenses/by/3.0/"],
    [{ name: "CC0" }, "CC0", "https://creativecommons.org/publicdomain/zero/1.0/"],
    [{ name: "Public domain" }, "PD", "https://creativecommons.org/publicdomain/mark/1.0/"],
    [
      { url: "http://creativecommons.org/licenses/by/2.0/" },
      "CC BY",
      "https://creativecommons.org/licenses/by/2.0/",
    ],
    [
      { url: "https://creativecommons.org/publicdomain/zero/1.0/" },
      "CC0",
      "https://creativecommons.org/publicdomain/zero/1.0/",
    ],
  ])("accepts %j", (stated, id, url) => {
    expect(checkLicence(stated)).toMatchObject({ ok: true, licence: { id, url } });
  });

  it.each([
    [{ name: "CC BY-NC-SA 4.0" }],
    [{ name: "CC BY-ND 2.0" }],
    [{ url: "http://creativecommons.org/licenses/by-nc/3.0/" }],
    [{ name: "GFDL" }],
    [{ name: "All rights reserved" }],
    [{}],
  ])("refuses %j", (stated) => {
    expect(checkLicence(stated).ok).toBe(false);
  });
});

describe("searchCommons", () => {
  it("keeps reusable videos with an author and says why the rest were left out", async () => {
    const info = (name: string, mime = "video/webm", artist = '<a href="//x">Ann Lee</a>') => ({
      url: `https://upload.wikimedia.org/${name}.webm`,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:${name}.webm`,
      mime,
      size: 1000,
      duration: 42.5,
      extmetadata: { LicenseShortName: { value: name }, Artist: { value: artist } },
    });
    const fetch = routes({
      "https://commons.wikimedia.org/w/api.php": () =>
        json({
          query: {
            pages: {
              "1": { pageid: 1, title: "File:Chain.webm", imageinfo: [info("CC BY-SA 4.0")] },
              "2": { pageid: 2, title: "File:Nc.webm", imageinfo: [info("CC BY-NC 4.0")] },
              "3": { pageid: 3, title: "File:Pic.jpg", imageinfo: [info("CC0", "image/jpeg")] },
              "4": {
                pageid: 4,
                title: "File:Anon.webm",
                imageinfo: [info("CC BY 4.0", "video/webm", "")],
              },
            },
          },
        }),
    });
    const r = await searchCommons("bike chain", { limit: 4, fetch });
    expect(new URL(fetch.calls[0] ?? "").searchParams.get("gsrsearch")).toBe(
      "bike chain filetype:video",
    );
    expect(r.candidates).toEqual([
      expect.objectContaining({
        id: "1",
        title: "Chain.webm",
        author: "Ann Lee",
        durationS: 42.5,
        licence: expect.objectContaining({ id: "CC BY-SA", version: "4.0" }),
      }),
    ]);
    expect(r.rejected.map((x) => [x.id, x.reason])).toEqual([
      ["2", "CC BY-NC 4.0 does not allow the reuse this needs"],
      ["3", "Not a video (image/jpeg)"],
      ["4", "No author stated, so it cannot be attributed"],
    ]);
  });
});

describe("searchArchive", () => {
  it("picks the smallest playable file of each licensed item", async () => {
    const fetch = routes({
      "https://archive.org/advancedsearch.php": () =>
        json({
          response: {
            docs: [
              {
                identifier: "fix-tap",
                title: "Fixing a tap",
                creator: "Bo",
                licenseurl: "http://creativecommons.org/licenses/by/3.0/",
              },
              {
                identifier: "nd-one",
                title: "No derivs",
                creator: "Cy",
                licenseurl: "http://creativecommons.org/licenses/by-nd/3.0/",
              },
            ],
          },
        }),
      "https://archive.org/metadata/fix-tap": () =>
        json({
          files: [
            { name: "fix tap.mp4", format: "h.264", size: "9000" },
            { name: "fix tap_512kb.mp4", format: "512Kb MPEG4", size: "3000", length: "61.2" },
            { name: "fix tap.jpg", format: "JPEG", size: "10" },
          ],
        }),
    });
    const r = await searchArchive("tap", { limit: 2, fetch });
    expect(r.candidates).toEqual([
      expect.objectContaining({
        id: "fix-tap",
        pageUrl: "https://archive.org/details/fix-tap",
        downloadUrl: "https://archive.org/download/fix-tap/fix%20tap_512kb.mp4",
        mime: "video/mp4",
        sizeBytes: 3000,
        durationS: 61.2,
      }),
    ]);
    expect(r.rejected).toEqual([
      expect.objectContaining({
        id: "nd-one",
        reason: "CC BY-ND does not allow the reuse this needs",
      }),
    ]);
    expect(fetch.calls.some((u) => u.includes("metadata/nd-one"))).toBe(false);
  });

  it("reads clock-time lengths and the retired CC public domain dedication (real Archive data)", async () => {
    const fetch = routes({
      "https://archive.org/advancedsearch.php": () =>
        json({
          response: {
            docs: [
              {
                identifier: "Woodwork1940",
                title: "Woodworker, The",
                licenseurl: "http://creativecommons.org/licenses/publicdomain/",
              },
            ],
          },
        }),
      "https://archive.org/metadata/Woodwork1940": () =>
        json({
          files: [
            { name: "a.mp4", format: "h.264", size: "5000", length: "10:41" },
            { name: "a.ogv", format: "Ogg Video", size: "4000", length: "642.18" },
            { name: "a.xml", format: "Metadata", size: "10" },
          ],
        }),
    });
    const r = await searchArchive("woodwork", { limit: 1, fetch });
    expect(r.rejected).toEqual([]);
    expect(r.candidates).toEqual([
      expect.objectContaining({
        id: "Woodwork1940",
        licence: expect.objectContaining({ id: "PD" }),
      }),
    ]);
  });
});

describe("parseDuration", () => {
  it("accepts seconds and clock time, and ignores anything else", () => {
    expect(parseDuration("642.44")).toBe(642.44);
    expect(parseDuration("10:41")).toBe(641);
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration(12)).toBe(12);
    expect(parseDuration("")).toBeUndefined();
    expect(parseDuration("n/a")).toBeUndefined();
    expect(parseDuration(undefined)).toBeUndefined();
  });
});

describe("collect", () => {
  let dir = "";
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const candidate = (id: string, sizeBytes?: number): Candidate => ({
    source: "commons",
    id,
    title: `Video ${id}`,
    author: "Ann Lee",
    pageUrl: `https://commons.wikimedia.org/wiki/File:${id}.webm`,
    downloadUrl: `https://upload.wikimedia.org/${id}.webm`,
    mime: "video/webm",
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    licence: { id: "CC BY", version: "4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
  });

  it("downloads once, names by hash, records attribution, and skips what is too big or already there", async () => {
    dir = await mkdtemp(join(tmpdir(), "collect-"));
    const fetch = routes({
      "https://upload.wikimedia.org/a.webm": () =>
        new Response("video-a", { headers: { "content-type": "video/webm" } }),
      "https://upload.wikimedia.org/big.webm": () => new Response("x".repeat(50)),
    });
    const skipped: string[] = [];
    const opts = {
      dir,
      maxBytes: 20,
      fetch,
      resolve: async () => ["93.184.216.34"],
      now: () => new Date("2026-10-27T12:00:00Z"),
      onSkip: (c: Candidate, why: string) => skipped.push(`${c.id}: ${why}`),
    };
    const added = await collect([candidate("a"), candidate("huge", 1e9), candidate("big")], opts);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      id: "a",
      bytes: 7,
      file: expect.stringMatching(/^[0-9a-f]{64}\.webm$/),
    });
    expect(await readFile(join(dir, added[0]?.file ?? ""), "utf8")).toBe("video-a");
    expect(skipped).toEqual(["huge: larger than 0 MB", "big: File is larger than 0 MB"]);

    const again = await collect([candidate("a")], opts);
    expect(again).toEqual([]);
    expect(fetch.calls.filter((u) => u.endsWith("/a.webm"))).toHaveLength(1);

    const manifest = await readManifest(dir);
    expect(attributionMarkdown(manifest)).toContain(
      `\`${added[0]?.file}\`: "Video a" by Ann Lee, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), via Wikimedia Commons: https://commons.wikimedia.org/wiki/File:a.webm`,
    );
  });

  it("formats public-domain credits without a version", () => {
    expect(attribution({ ...candidate("p"), licence: { id: "PD" } })).toBe(
      '"Video p" by Ann Lee, Public domain, via Wikimedia Commons: https://commons.wikimedia.org/wiki/File:p.webm',
    );
  });
});
