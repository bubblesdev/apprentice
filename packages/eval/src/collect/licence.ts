import { z } from "zod";

/**
 * Licences a video may carry to be collected. All four allow reuse, including commercially and in
 * modified form; the CC ones need attribution, which the manifest keeps. NC, ND, GFDL-only and
 * "all rights reserved" are refused.
 */
export const LicenceId = z.enum(["CC0", "PD", "CC BY", "CC BY-SA"]);
export type LicenceId = z.infer<typeof LicenceId>;

export const Licence = z.object({
  id: LicenceId,
  version: z.string().optional(),
  /** The licence deed, for the attribution line. */
  url: z.string().url().optional(),
});
export type Licence = z.infer<typeof Licence>;

export type LicenceCheck = { ok: true; licence: Licence } | { ok: false; reason: string };

const deedUrl = (id: LicenceId, version: string | undefined): string | undefined => {
  if (id === "CC0") return "https://creativecommons.org/publicdomain/zero/1.0/";
  if (id === "PD") return "https://creativecommons.org/publicdomain/mark/1.0/";
  if (!version) return undefined;
  return `https://creativecommons.org/licenses/${id === "CC BY" ? "by" : "by-sa"}/${version}/`;
};

const make = (id: LicenceId, version?: string): Licence => {
  const url = deedUrl(id, version);
  return { id, ...(version ? { version } : {}), ...(url ? { url } : {}) };
};

/** A Creative Commons deed URL, e.g. Internet Archive's `licenseurl`. */
function fromUrl(raw: string): LicenceCheck | undefined {
  const m = /creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)\/?([\d.]+)?/i.exec(raw);
  if (!m) return undefined;
  const [, kind, code = "", version] = m;
  const c = code.toLowerCase();
  if (kind?.toLowerCase() === "publicdomain")
    return c === "zero" ? { ok: true, licence: make("CC0") } : { ok: true, licence: make("PD") };
  // The retired CC public domain dedication, still used by Internet Archive items.
  if (c === "publicdomain") return { ok: true, licence: make("PD") };
  if (c === "by") return { ok: true, licence: make("CC BY", version) };
  if (c === "by-sa") return { ok: true, licence: make("CC BY-SA", version) };
  return { ok: false, reason: `CC ${c.toUpperCase()} does not allow the reuse this needs` };
}

/** A short licence name, e.g. Wikimedia Commons' `LicenseShortName`. */
function fromName(raw: string): LicenceCheck | undefined {
  const name = raw.trim().replace(/\s+/g, " ");
  if (/\b(nc|nd)\b/i.test(name.replace(/-/g, " ")))
    return { ok: false, reason: `${name} does not allow the reuse this needs` };
  if (/^cc0\b/i.test(name)) return { ok: true, licence: make("CC0") };
  if (/^(public domain|pd\b|pdm\b)/i.test(name)) return { ok: true, licence: make("PD") };
  const cc = /^cc[ -]by(-sa)?(?:[ -]([\d.]+))?/i.exec(name);
  if (cc) return { ok: true, licence: make(cc[1] ? "CC BY-SA" : "CC BY", cc[2]) };
  return undefined;
}

/** Decides from whatever the source states; unknown or missing means no. */
export function checkLicence(stated: { name?: string; url?: string }): LicenceCheck {
  const found =
    (stated.url ? fromUrl(stated.url) : undefined) ??
    (stated.name ? fromName(stated.name) : undefined);
  if (found) return found;
  const what = stated.name ?? stated.url;
  return { ok: false, reason: what ? `Unrecognised licence: ${what}` : "No licence stated" };
}

export function licenceLabel(l: Licence): string {
  if (l.id === "CC0") return "CC0 1.0";
  if (l.id === "PD") return "Public domain";
  return l.version ? `${l.id} ${l.version}` : l.id;
}
