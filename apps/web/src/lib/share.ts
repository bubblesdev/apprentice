import { renderSVG } from "uqr";

/** The short link that opens straight into coaching a guide: what a QR code on a product box points to. */
export function coachLink(guideId: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/c/${encodeURIComponent(guideId)}`;
}

/**
 * A QR code as SVG markup: black on white with a four-module quiet zone and medium error
 * correction, so it still scans when printed small or slightly scuffed.
 */
export function qrSvg(text: string): string {
  return renderSVG(text, {
    ecc: "M",
    border: 4,
    pixelSize: 8,
    blackColor: "#0A0B0D",
    whiteColor: "#FFFFFF",
  });
}

/** Shares through the phone's share sheet where there is one, otherwise copies the link. */
export async function shareLink(input: {
  title: string;
  text?: string;
  url: string;
}): Promise<"shared" | "copied" | "failed"> {
  if (navigator.share) {
    try {
      await navigator.share(input);
      return "shared";
    } catch {
      return "failed";
    }
  }
  try {
    await navigator.clipboard.writeText(input.url);
    return "copied";
  } catch {
    return "failed";
  }
}

/** Saves text as a file the person downloads (the QR code as SVG for printing). */
export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "guide"
  );
}
