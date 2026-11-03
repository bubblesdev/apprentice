import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { extractText, getDocumentProxy } from "unpdf";
import { IngestError } from "./ingest.js";
import type { BuildGuidePayload } from "./job.js";
import { safeFetch, type Resolver } from "./safe-fetch.js";

/** Matches the API's limit on pasted documents. */
export const MAX_DOCUMENT_CHARS = 200_000;
const MAX_DOWNLOAD_BYTES = 20_000_000;

/** Collapses runs of blank space while keeping paragraph breaks, which carry step structure. */
export function tidyText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function pdfText(data: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });
  return tidyText(text.join("\n\n"));
}

/**
 * The main content of a help page, as text with list items and headings on their own lines.
 * Readability drops navigation, cookie banners and footers; if it finds no article, the body
 * text is used.
 */
export function htmlText(html: string, url: string): { title: string; text: string } {
  const { document } = parseHTML(html);
  for (const el of document.querySelectorAll("script, style, noscript, svg, iframe")) el.remove();
  const article = new Readability(document.cloneNode(true) as typeof document, {
    charThreshold: 200,
  }).parse();
  const container = parseHTML(
    `<html><body>${article?.content ?? document.body?.innerHTML ?? ""}</body></html>`,
  ).document;
  for (const el of container.querySelectorAll("li")) el.prepend(container.createTextNode("\n- "));
  for (const el of container.querySelectorAll("h1, h2, h3, h4, p, br, tr, div, section, ol, ul")) {
    el.append(container.createTextNode("\n"));
  }
  const title = article?.title?.trim() || document.title?.trim() || new URL(url).hostname;
  return { title, text: tidyText(container.body?.textContent ?? "") };
}

async function readLimited(res: Response): Promise<Uint8Array> {
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_DOWNLOAD_BYTES) throw new IngestError("That document is too large");
  const data = new Uint8Array(await res.arrayBuffer());
  if (data.byteLength > MAX_DOWNLOAD_BYTES) throw new IngestError("That document is too large");
  return data;
}

export interface DocumentOptions {
  fetch?: typeof fetch;
  resolve?: Resolver;
}

/**
 * For document sources without text yet (an uploaded PDF, or a link to a help page, PDF or text
 * file), extracts the text the steps are drafted from. Photos of manual pages are read by the
 * model itself. Other payloads pass through unchanged.
 */
export async function ingestDocument(
  payload: BuildGuidePayload,
  opts: DocumentOptions = {},
): Promise<BuildGuidePayload> {
  const { media, source } = payload;
  if (source.kind !== "document" || payload.documentText || payload.pages || media.kind !== "url")
    return payload;

  let text: string;
  if (media.url.startsWith("file:")) {
    text = await pdfText(new Uint8Array(await readFile(fileURLToPath(media.url))));
  } else if (/^https?:/i.test(media.url)) {
    const res = await safeFetch(media.url, opts);
    if (!res.ok) throw new IngestError(`Could not open that page (HTTP ${res.status})`);
    const type = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const data = await readLimited(res);
    if (type === "application/pdf") text = await pdfText(data);
    else if (type === "text/html" || type === "application/xhtml+xml")
      text = htmlText(new TextDecoder().decode(data), media.url).text;
    else if (type.startsWith("text/")) text = tidyText(new TextDecoder().decode(data));
    else throw new IngestError("That link is not a web page, PDF or text file");
  } else {
    return payload;
  }
  if (text.length < 40)
    throw new IngestError("I couldn't find readable instructions in that document");
  return { ...payload, documentText: text.slice(0, MAX_DOCUMENT_CHARS) };
}
