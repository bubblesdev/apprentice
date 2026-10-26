import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    if (a === "::1" || a === "::") return true;
    if (a.startsWith("fe80") || a.startsWith("fc") || a.startsWith("fd") || a.startsWith("ff"))
      return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    return mapped?.[1] ? isPrivateAddress(mapped[1]) : false;
  }
  const parts = address.split(".").map(Number);
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export type Resolver = (hostname: string) => Promise<string[]>;

const systemResolver: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true })).map((r) => r.address);

/**
 * Refuses URLs a user could use to make the server reach its own network (SSRF): only http(s)
 * to hosts that resolve exclusively to public addresses.
 */
export async function assertPublicUrl(
  raw: string,
  resolve: Resolver = systemResolver,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("That is not a valid link");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new UnsafeUrlError("Only http and https links are allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : await resolve(host).catch(() => []);
  if (addresses.length === 0) throw new UnsafeUrlError("That link's host could not be found");
  if (addresses.some(isPrivateAddress))
    throw new UnsafeUrlError("Links to private or local addresses are not allowed");
  return url;
}

/**
 * fetch that checks every hop: redirects are followed manually (at most 5) so a public URL
 * cannot bounce the request to a private one.
 */
export async function safeFetch(
  raw: string,
  opts: { fetch?: typeof fetch; resolve?: Resolver; timeoutMs?: number } = {},
): Promise<Response> {
  const doFetch = opts.fetch ?? fetch;
  let current = raw;
  for (let hop = 0; hop <= 5; hop++) {
    const url = await assertPublicUrl(current, opts.resolve);
    const res = await doFetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, url).href;
      continue;
    }
    return res;
  }
  throw new UnsafeUrlError("Too many redirects");
}
