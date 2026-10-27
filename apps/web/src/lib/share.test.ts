import { describe, expect, it } from "vitest";
import { installModeFor } from "./install";
import { coachLink, qrSvg, slug } from "./share";

describe("coachLink", () => {
  it("builds the short coaching link", () => {
    expect(coachLink("ps1-buttons", "https://apprentice.pages.dev/")).toBe(
      "https://apprentice.pages.dev/c/ps1-buttons",
    );
    expect(coachLink("a b", "http://localhost:5173")).toBe("http://localhost:5173/c/a%20b");
  });
});

describe("qrSvg", () => {
  it("renders an SVG QR code with dark modules on white", () => {
    const svg = qrSvg("https://apprentice.pages.dev/c/ps1-buttons");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("#0A0B0D");
    expect(svg).toContain("#FFFFFF");
  });
});

describe("installModeFor", () => {
  const iphoneSafari =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const iphoneChrome = iphoneSafari.replace("Version/18.0", "CriOS/130.0");
  const android =
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

  it.each([
    [android, false, true, "prompt"],
    [android, false, false, "none"],
    [iphoneSafari, false, false, "ios"],
    [iphoneChrome, false, false, "none"],
    [iphoneSafari, true, false, "none"],
  ] as const)("%#: %s", (ua, standalone, event, mode) => {
    expect(installModeFor(ua, standalone, event)).toBe(mode);
  });
});

describe("slug", () => {
  it("makes a safe file name", () => {
    expect(slug("Fix sticky PlayStation buttons!")).toBe("fix-sticky-playstation-buttons");
    expect(slug("***")).toBe("guide");
  });
});
