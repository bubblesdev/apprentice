import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ModelOutputError } from "./errors.js";
import { parseModelJson } from "./json.js";

const Schema = z.object({ verdict: z.string() });

describe("parseModelJson", () => {
  it("extracts JSON wrapped in prose or a code fence", () => {
    expect(parseModelJson('Sure!\n```json\n{"verdict":"done"}\n```', Schema)).toEqual({
      verdict: "done",
    });
  });

  it.each(["no json here", '{"verdict":', '{"other":1}'])(
    "throws ModelOutputError for %j",
    (text) => {
      expect(() => parseModelJson(text, Schema)).toThrow(ModelOutputError);
    },
  );
});
