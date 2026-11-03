import { describe, expect, it } from "vitest";
import { color, cssVariables } from "./tokens.js";

describe("cssVariables", () => {
  it("exposes every token as a CSS custom property", () => {
    const vars = cssVariables();
    expect(vars["--color-accent"]).toBe("#9DB8FF");
    expect(vars["--color-surface-raised"]).toBe(color.surfaceRaised);
    expect(vars["--type-hero-size"]).toBe("34px");
    expect(vars["--touch-min"]).toBe("44px");
  });

  it("keeps the approved state colours", () => {
    expect([color.accent, color.amber, color.coral]).toEqual(["#9DB8FF", "#F2B65A", "#FF7A5C"]);
  });
});
