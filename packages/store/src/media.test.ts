import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileMediaStore, R2MediaStore, assertSafeKey } from "./media.js";

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "apprentice-media-"));
});
afterEach(async () => rm(dir, { recursive: true, force: true }));

describe("assertSafeKey", () => {
  it.each(["../etc/passwd", "a/../../b", "/abs", "a//b", "a/./b", "with space"])(
    "refuses %s",
    (key) => {
      expect(() => assertSafeKey(key)).toThrow();
    },
  );

  it("accepts the keys the app writes", () => {
    expect(() => assertSafeKey("sessions/abc-1/frames/000001.jpg")).not.toThrow();
    expect(() => assertSafeKey("guides/ps1/diagrams/1-abcdef012345.svg")).not.toThrow();
  });
});

describe("FileMediaStore", () => {
  it("round-trips bytes and mime type, and survives a new instance", async () => {
    await new FileMediaStore(dir).put(
      "guides/g/diagrams/1-a.png",
      new Uint8Array([1, 2, 3]),
      "image/png",
    );
    const item = await new FileMediaStore(dir).get("guides/g/diagrams/1-a.png");
    expect(item).toEqual({ data: new Uint8Array([1, 2, 3]), mime: "image/png" });
    expect(await new FileMediaStore(dir).get("guides/g/diagrams/2-a.png")).toBeUndefined();
  });

  it("refuses keys that climb out of its directory", async () => {
    await expect(
      new FileMediaStore(dir).put("../x.png", new Uint8Array(), "image/png"),
    ).rejects.toThrow(/Unsafe/);
  });
});

describe("R2MediaStore", () => {
  it("signs S3 requests to the account's R2 endpoint", async () => {
    const seen: Request[] = [];
    const store = new R2MediaStore(
      { accountId: "acct", bucket: "apprentice", accessKeyId: "AKID", secretAccessKey: "secret" },
      (async (input: Request | string | URL, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init);
        seen.push(req);
        if (req.method === "PUT") return new Response(null, { status: 200 });
        return req.url.endsWith("missing.jpg")
          ? new Response(null, { status: 404 })
          : new Response(new Uint8Array([9]), { headers: { "content-type": "image/jpeg" } });
      }) as typeof fetch,
    );
    await store.put("sessions/s/frames/000001.jpg", new Uint8Array([9]), "image/jpeg");
    expect(await store.get("sessions/s/frames/000001.jpg")).toEqual({
      data: new Uint8Array([9]),
      mime: "image/jpeg",
    });
    expect(await store.get("sessions/s/frames/missing.jpg")).toBeUndefined();
    expect(seen[0]?.url).toBe(
      "https://acct.r2.cloudflarestorage.com/apprentice/sessions/s/frames/000001.jpg",
    );
    expect(seen[0]?.headers.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/auto\/s3\/aws4_request/,
    );
  });
});
