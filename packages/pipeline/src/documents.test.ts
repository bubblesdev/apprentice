import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { htmlText, ingestDocument, pdfText, tidyText } from "./documents.js";
import type { BuildGuidePayload } from "./job.js";
import { assertPublicUrl, isPrivateAddress, safeFetch } from "./safe-fetch.js";

/** A minimal one-page PDF with the given lines, xref offsets computed. */
function makePdf(lines: string[]): Uint8Array {
  const stream = [
    "BT",
    "/F1 12 Tf",
    "72 720 Td",
    "14 TL",
    ...lines.map((l) => `(${l}) '`),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

const STEPS = [
  "1. Unplug the kettle and let it cool.",
  "2. Unscrew the base plate.",
  "3. Wipe the element with vinegar.",
];

const HELP_PAGE = `<!doctype html><html><head><title>Descale your kettle | Help Centre</title><script>track()</script></head>
<body><nav><a href="/">Home</a> <a href="/shop">Shop</a></nav>
<main><article><h1>Descale your kettle</h1><p>Limescale slows boiling. Follow these steps every month to keep your kettle working well and quietly.</p>
<ol><li>Unplug the kettle and let it cool completely.</li><li>Fill it halfway with equal parts water and white vinegar.</li><li>Leave it for an hour, then rinse three times.</li></ol>
<p>Never immerse the base in water.</p></article></main><footer>Cookie settings</footer></body></html>`;

const doc = (url: string, extra: Partial<BuildGuidePayload> = {}): BuildGuidePayload => ({
  guideId: "g",
  source: { id: "s", kind: "document", title: "Manual", location: url },
  media: { kind: "url", url },
  ...extra,
});

const publicDns = async () => ["93.184.216.34"];
const respond = (
  body: ConstructorParameters<typeof Response>[0],
  type: string,
  status = 200,
  headers: Record<string, string> = {},
): typeof fetch =>
  (async () =>
    new Response(body, { status, headers: { "content-type": type, ...headers } })) as typeof fetch;

describe("text extraction", () => {
  it("reads text from a PDF", async () => {
    const text = await pdfText(makePdf(STEPS));
    for (const step of STEPS) expect(text).toContain(step);
  });

  it("keeps the article of a help page and drops navigation, scripts and footers", () => {
    const { title, text } = htmlText(HELP_PAGE, "https://help.example.com/kettle");
    expect(title).toBe("Descale your kettle | Help Centre");
    expect(text).toContain("- Unplug the kettle and let it cool completely.");
    expect(text).toContain("Never immerse the base in water.");
    expect(text).not.toMatch(/track\(\)|Cookie settings|Shop/);
  });

  it("tidies whitespace but keeps paragraph breaks", () => {
    expect(tidyText("a  \t b\r\n\r\n\r\n\n c ")).toBe("a b\n\nc");
  });
});

describe("ingestDocument", () => {
  it("extracts text from an uploaded PDF", async () => {
    const dir = await mkdtemp(join(tmpdir(), "apprentice-doc-"));
    const path = join(dir, "manual.pdf");
    await writeFile(path, makePdf(STEPS));
    const out = await ingestDocument(doc(pathToFileURL(path).href));
    expect(out.documentText).toContain("Unscrew the base plate.");
    await rm(dir, { recursive: true, force: true });
  });

  it("reads a help page link", async () => {
    const out = await ingestDocument(doc("https://help.example.com/kettle"), {
      fetch: respond(HELP_PAGE, "text/html"),
      resolve: publicDns,
    });
    expect(out.documentText).toContain("equal parts water and white vinegar");
  });

  it("refuses links that are not documents, and pages with no instructions", async () => {
    const opts = (f: typeof fetch) => ({ fetch: f, resolve: publicDns });
    await expect(
      ingestDocument(doc("https://x.example/v"), opts(respond("x", "video/mp4"))),
    ).rejects.toThrow(/not a web page/);
    await expect(
      ingestDocument(doc("https://x.example/e"), opts(respond("<p>Hi</p>", "text/html"))),
    ).rejects.toThrow(/readable/);
  });

  it("leaves pasted documents and videos alone", async () => {
    const pasted = doc("data:text/markdown;base64,eA==", { documentText: "1. Do it." });
    expect(await ingestDocument(pasted)).toBe(pasted);
    const page = { kind: "url" as const, url: "https://x.example/page-1.jpg" };
    const photos = { ...doc(page.url), pages: [page] };
    const fetchPage = respond("not fetched", "text/html");
    expect(await ingestDocument(photos, { fetch: fetchPage, resolve: publicDns })).toBe(photos);
    const video = {
      ...doc("https://x.example/v.mp4"),
      source: { id: "s", kind: "video" as const, title: "v", location: "x" },
    };
    expect(await ingestDocument(video)).toBe(video);
  });
});

describe("SSRF guard", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "fd00::1",
    "::ffff:10.0.0.1",
  ])("treats %s as private", (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it("allows public addresses", () => {
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
    expect(isPrivateAddress("2606:4700::1111")).toBe(false);
  });

  it("refuses private hosts, odd schemes and unresolvable names", async () => {
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(
      /private/,
    );
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow(/http/);
    await expect(
      assertPublicUrl("https://internal.example", async () => ["10.0.0.2"]),
    ).rejects.toThrow(/private/);
    await expect(assertPublicUrl("https://nowhere.example", async () => [])).rejects.toThrow(
      /could not be found/,
    );
  });

  it("checks every redirect hop", async () => {
    const hops = respond("", "text/html", 302, { location: "http://127.0.0.1/admin" });
    await expect(
      safeFetch("https://public.example/page", { fetch: hops, resolve: publicDns }),
    ).rejects.toThrow(/private/);
  });
});
