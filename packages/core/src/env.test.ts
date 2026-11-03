import { describe, expect, it } from "vitest";
import { withoutBlankValues } from "./env.js";

describe("withoutBlankValues", () => {
  it("drops blank and unset values and keeps the rest", () => {
    expect(
      withoutBlankValues({ DATABASE_URL: "", R2_BUCKET: "  ", PORT: "8787", X: undefined }),
    ).toEqual({
      PORT: "8787",
    });
  });
});
